/**
 * Genera el archivo Previred de Bahía Sargo (junio 2026) con las MISMAS librerías
 * del panel (armar-liquidacion, liquidacion, previred-nomina) y lo deja en Descargas.
 * Uso: npx tsx tmp-gen-previred.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { armarEntrada } from "./src/lib/armar-liquidacion";
import { calcularLiquidacion } from "./src/lib/liquidacion";
import { generarNominaPrevired, type DatosPreviredTrabajador } from "./src/lib/previred-nomina";

const CLIENTE_ID = "df5de011-1175-4d46-91c1-da96bad4219b";
const PERIODO = "2026-06";
const SALIDA = "C:\\Users\\CristianLópezThienel\\Downloads\\previred_2026-06_bahia_sargo.txt";

// credenciales desde .env.local
const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const COLS_IND =
  "rmi_general, utm, uf_ultimo_dia, tope_uf_afp, tope_uf_ips, tope_uf_afc, tasa_sis, tasa_seguro_social, afp, asignacion_familiar";

function partirRut(rut: string | null): { num: string; dv: string } {
  const limpio = (rut ?? "").replace(/\./g, "").trim();
  const [num, dv] = limpio.split("-");
  return { num: num ?? "", dv: dv ?? "" };
}

async function main() {
  const [cliRes, indRes, liqRes] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", CLIENTE_ID).maybeSingle(),
    supabase.from("indicadores_previred").select(COLS_IND).eq("periodo", PERIODO).maybeSingle(),
    supabase.from("liquidacion").select("trabajador_id, dias_trabajados, dias_licencia, total_imponible, detalle").eq("cliente_id", CLIENTE_ID).eq("periodo", PERIODO),
  ]);
  if (!indRes.data || !cliRes.data) throw new Error("Faltan indicadores o cliente");

  const trabRes = await supabase.from("trabajadores").select("*").eq("cliente_id", CLIENTE_ID).eq("activo", true).order("apellidos");
  const trabajadores = trabRes.data ?? [];
  const ids = trabajadores.map((t) => t.id);

  const [novRes, contRes, rimaRes] = await Promise.all([
    supabase.from("novedades_remuneraciones").select("trabajador_id, tipo, cantidad, monto, concepto_id, fecha, fecha_hasta").eq("periodo", PERIODO).in("trabajador_id", ids),
    supabase.from("contratos").select("trabajador_id, remuneracion, jornada, estado, created_at").in("trabajador_id", ids).neq("estado", "anulado").order("created_at", { ascending: false }),
    supabase.from("liquidacion").select("trabajador_id, total_imponible").eq("cliente_id", CLIENTE_ID).eq("periodo", "2026-05").in("trabajador_id", ids),
  ]);

  const movsMap = new Map<string, { codigo: string; desde: string | null; hasta: string | null }[]>();
  for (const n of (novRes.data ?? []) as { trabajador_id: string; tipo: string; fecha?: string | null; fecha_hasta?: string | null }[]) {
    if ((n.tipo === "ausencia" || n.tipo === "licencia") && n.fecha) {
      const lista = movsMap.get(n.trabajador_id) ?? [];
      lista.push({ codigo: n.tipo === "licencia" ? "3" : "4", desde: n.fecha, hasta: n.fecha_hasta ?? n.fecha });
      movsMap.set(n.trabajador_id, lista);
    }
  }
  const rimaMap = new Map((rimaRes.data ?? []).map((l) => [l.trabajador_id as string, Number(l.total_imponible ?? 0)]));
  const contMap = new Map<string, any>();
  for (const c of contRes.data ?? []) if (!contMap.has(c.trabajador_id)) contMap.set(c.trabajador_id, c);
  const diasMap = new Map((liqRes.data ?? []).map((l) => [l.trabajador_id, (l.dias_trabajados as number) ?? 30]));
  const detalleMap = new Map((liqRes.data ?? []).map((l) => [l.trabajador_id as string, l.detalle as Record<string, unknown> | null]));

  const indData = indRes.data as any;
  const uf = Number(indData.uf_ultimo_dia ?? 0);
  const tasaSeguroSocial = Number(indData.tasa_seguro_social ?? 0);
  const tasaSis = Number(indData.tasa_sis ?? 0);
  const tasaTotalAfp = (nombre: string | null): number => {
    const q = (nombre ?? "").toLowerCase().replace("afp", "").trim();
    const m = (indData.afp ?? []).find((a: any) => a.nombre.toLowerCase().includes(q) || (q && q.includes(a.nombre.toLowerCase())));
    return Number(m?.tasa_total ?? 0);
  };

  const datos: DatosPreviredTrabajador[] = trabajadores.map((t: any) => {
    const dias = diasMap.get(t.id) ?? 30;
    const entrada = armarEntrada({
      ind: indRes.data as any,
      cliente: cliRes.data as any,
      trabajador: t,
      contrato: contMap.get(t.id) ?? null,
      novedades: (novRes.data ?? []).filter((n) => n.trabajador_id === t.id) as any[],
      conceptos: [],
      periodo: PERIODO,
      diasTrabajados: dias,
    });
    let r = calcularLiquidacion(entrada);
    // Anclaje a las rentas reales de la liquidación del período (igual que actions.ts).
    const det = detalleMap.get(t.id);
    const esSocio = t.sueldo_empresarial === true;
    let tasaAfcEmp = esSocio ? 0
      : t.tipo_contrato === "plazo_fijo" || t.tipo_contrato === "casa_particular" ? 0.03
      : t.mas_11_anios === true ? 0.008 : 0.024;
    if (det && Number(det.baseImponible ?? 0) > 0) {
      if (!esSocio) {
        tasaAfcEmp = Number(det.afcTrabajador ?? 0) > 0 ? 0.024 : t.mas_11_anios === true ? 0.008 : 0.03;
      }
      const topeAfpSalud = Math.round(Number(indData.tope_uf_afp ?? 0) * uf);
      const topeAfcPesos = Math.round(Number(indData.tope_uf_afc ?? 0) * uf);
      const baseReal = topeAfpSalud > 0 ? Math.min(Number(det.baseImponible), topeAfpSalud) : Number(det.baseImponible);
      const baseAfcReal = topeAfcPesos > 0 ? Math.min(Number(det.baseImponible), topeAfcPesos) : Number(det.baseImponible);
      r = {
        ...r,
        baseImponible: baseReal,
        baseImponibleAfc: baseAfcReal,
        afpMonto: Number(det.afpMonto ?? r.afpMonto),
        saludLegal: Number(det.saludLegal ?? r.saludLegal),
        saludAdicional: Number(det.saludAdicional ?? r.saludAdicional),
        saludMonto: Number(det.saludMonto ?? r.saludMonto),
        afcTrabajador: Number(det.afcTrabajador ?? r.afcTrabajador),
        impuestoUnico: Number(det.impuestoUnico ?? r.impuestoUnico),
        asignacionFamiliar: Number(det.asignacionFamiliar ?? r.asignacionFamiliar),
        sisEmpleador: esSocio ? 0 : Math.round((baseReal * tasaSis) / 100),
        afcEmpleador: Math.round(baseAfcReal * tasaAfcEmp),
        mutualEmpleador: Math.round((baseReal * Number((cliRes.data as any).mutual_tasa ?? 0)) / 100),
      };
    }
    const { num, dv } = partirRut(t.rut);
    const planUf = t.salud_plan_unidad === "UF" ? Number(t.salud_plan_valor ?? 0) * uf : Number(t.salud_plan_valor ?? 0);
    return {
      rutSinDv: num,
      dv,
      apellidoPaterno: t.apellido_paterno ?? (t.apellidos ?? "").split(" ")[0] ?? "",
      apellidoMaterno: t.apellido_materno ?? (t.apellidos ?? "").split(" ").slice(1).join(" ") ?? "",
      nombres: t.nombres ?? "",
      sexo: t.sexo,
      nacionalidad: t.nacionalidad,
      regimen: t.regimen_previsional ?? "afp",
      tipoTrabajador: t.tipo_trabajador ?? "activo",
      diasTrabajados: dias,
      afp: t.afp,
      afpTasaTotal: tasaTotalAfp(t.afp),
      tasaSeguroSocial,
      salud: t.salud,
      monedaPlan: t.salud_plan_unidad,
      valorPlan: Math.round(planUf),
      valorPlanUf: t.salud_plan_unidad === "UF" ? Number(t.salud_plan_valor ?? 0) : 0,
      sueldoEmpresarial: esSocio,
      tasaSis,
      tasaAfcEmpleador: tasaAfcEmp,
      tramoAsignacion: t.tramo_asignacion,
      cargasSimples: t.cargas_simples ?? 0,
      cargasMaternales: t.cargas_maternales ?? 0,
      cargasInvalidas: t.cargas_invalidas ?? 0,
      jornada: t.jornada_tipo,
      centroCosto: t.sucursal,
      fechaIngreso: t.fecha_ingreso,
      fechaTermino: t.fecha_termino_contrato,
      movimientos: movsMap.get(t.id) ?? [],
      rima: Number(t.rima_renta_promedio ?? 0) || rimaMap.get(t.id) || Math.round((r.baseImponible * 30) / Math.max(1, dias)),
      r,
    };
  });

  const txt = generarNominaPrevired(PERIODO, { mutual: (cliRes.data as any).mutual_institucion, ccaf: (cliRes.data as any).caja_compensacion }, datos);
  writeFileSync(SALIDA, Buffer.from(txt, "latin1"));
  console.log(`OK: ${datos.length} trabajadores, ${txt.trim().split("\r\n").length} líneas -> ${SALIDA}`);
  // resumen de control por línea + cuadratura por institución (comparable con KAME)
  const cuadra = { seguroSocial: 0, afp: new Map<string, number>(), fonasa: 0, isapre: 0, mutual: 0 };
  for (const l of txt.trim().split("\r\n")) {
    const f = l.split(";");
    console.log(`rut=${f[0]}-${f[1]} linea=${f[13]} mov=${f[14]} ${f[15]}-${f[16]} dias=${f[12]} renta=${f[26]} afp=${f[25]} c28=${f[27]} sis=${f[28]} rima=${f[91]} c94=${f[93]} fonasa=${f[69]} mut=${f[97]} afcT=${f[100]} afcE=${f[101]}`);
    cuadra.seguroSocial += Number(f[93]);
    cuadra.afp.set(f[25], (cuadra.afp.get(f[25]) ?? 0) + Number(f[27]) + Number(f[28]) + Number(f[100]) + Number(f[101]));
    cuadra.fonasa += Number(f[69]);
    cuadra.isapre += Number(f[79]) === 0 ? 0 : Number(f[79]) + Number(f[80]);
    cuadra.mutual += Number(f[97]);
  }
  console.log("\n== CUADRATURA (vs Informe KAME) ==");
  console.log("Seguro Social:", cuadra.seguroSocial, "(KAME 116.758)");
  let totalAfp = 0;
  for (const [cod, m] of cuadra.afp) { if (cod !== "00") { console.log(`AFP ${cod}:`, m); totalAfp += m; } }
  console.log("Subtotal AFP (cotiz+SIS+AFC):", totalAfp, "(KAME 1.970.262)");
  console.log("Fonasa:", cuadra.fonasa, "(KAME 826.915)");
  console.log("Mutual:", cuadra.mutual, "(KAME 445.943)");
}

main().catch((e) => { console.error(e); process.exit(1); });

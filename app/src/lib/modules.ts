import {
  Wallet,
  BookOpenCheck,
  FileText,
  FilePlus2,
  FileSignature,
  FileWarning,
  CalendarDays,
  Clock4,
  Building2,
  Users,
  Table2,
  BarChart3,
  UserCog,
  TrendingUp,
  Calculator,
  Link2,
  Receipt,
  Stethoscope,
  FileDown,
  type LucideIcon,
} from "lucide-react";

export type Rol = "admin" | "operador";

/**
 * Estado de un módulo:
 * - "activo": construido y navegable.
 * - "desarrollo": en construcción (visible, no navegable).
 * - "proximamente": planificado (visible, no navegable).
 */
export type EstadoModulo = "activo" | "desarrollo" | "proximamente";

export type Modulo = {
  key: string;
  label: string;
  descripcion: string;
  href: string;
  icon: LucideIcon;
  estado: EstadoModulo;
  /** Roles que pueden verlo. Si se omite, lo ven todos. */
  roles?: Rol[];
};

export type SeccionModulos = {
  seccion: string;
  modulos: Modulo[];
};

/**
 * Registro único de módulos de la plataforma. El sidebar y el home se
 * alimentan de acá. Para sumar un módulo nuevo: agregar una entrada y, cuando
 * esté construido, cambiar su `estado` a "activo" y crear su ruta.
 */
export const MODULOS: SeccionModulos[] = [
  {
    seccion: "Ciclos mensuales",
    modulos: [
      {
        key: "liquidaciones",
        label: "Liquidaciones",
        descripcion: "Ciclo mensual Previred.",
        href: "/liquidaciones",
        icon: Wallet,
        estado: "activo",
      },
      {
        key: "contabilidad",
        label: "Contabilidad mensual",
        descripcion:
          "RCV del SII (compras, ventas, NC/ND) y documentos mensuales por empresa.",
        href: "/contabilidad",
        icon: BookOpenCheck,
        estado: "activo",
      },
      {
        key: "f29",
        label: "F29",
        descripcion: "Armado y presentación mensual. Plazo día 20.",
        href: "/f29",
        icon: FileText,
        estado: "activo",
      },
      {
        key: "indicadores",
        label: "Indicadores Previred",
        descripcion:
          "UF, UTM, topes y tasas previsionales del mes — base de remuneraciones.",
        href: "/indicadores",
        icon: TrendingUp,
        estado: "activo",
      },
    ],
  },
  {
    seccion: "Gestiones — Recursos humanos",
    modulos: [
      {
        key: "contratos",
        label: "Contratos",
        descripcion:
          "Solicitud, generación desde plantilla aprobada y revisión de contratos de trabajo.",
        href: "/contratos",
        icon: FilePlus2,
        estado: "activo",
      },
      {
        key: "anexos",
        label: "Anexos",
        descripcion:
          "Anexos de contrato solicitados por los clientes: renovaciones, cambios de jornada y otros.",
        href: "/anexos",
        icon: FileSignature,
        estado: "activo",
      },
      {
        key: "amonestaciones",
        label: "Carta amonestación",
        descripcion:
          "Amonestaciones solicitadas por los clientes, con generación automática de la carta.",
        href: "/amonestaciones",
        icon: FileWarning,
        estado: "activo",
      },
      {
        key: "vacaciones",
        label: "Vacaciones",
        descripcion:
          "Papeletas de vacaciones solicitadas por los clientes desde su portal.",
        href: "/vacaciones",
        icon: CalendarDays,
        estado: "activo",
      },
      {
        key: "permisos",
        label: "Permisos",
        descripcion:
          "Permisos con y sin goce solicitados por los clientes. No descuentan vacaciones.",
        href: "/permisos",
        icon: Clock4,
        estado: "activo",
      },
      {
        key: "licencias",
        label: "Licencias médicas",
        descripcion:
          "Registro y tramitación de licencias médicas con los datos del trabajador a mano.",
        href: "/licencias",
        icon: Stethoscope,
        estado: "activo",
      },
      {
        key: "finiquitos",
        label: "Finiquitos",
        descripcion:
          "Solicitudes de término del portal y calculadora de indemnizaciones con indicadores Previred.",
        href: "/finiquitos",
        icon: Calculator,
        estado: "activo",
      },
    ],
  },
  {
    seccion: "Gestiones — Contabilidad",
    modulos: [
      {
        key: "documentos",
        label: "Solicitudes de documentos",
        descripcion:
          "Documentos contables (balance, libro mayor, libro diario, estado de resultados) que piden los clientes desde su portal. También recibe las solicitudes de documentos de personal.",
        href: "/documentos",
        icon: FileDown,
        estado: "activo",
      },
    ],
  },
  {
    seccion: "Cartera",
    modulos: [
      {
        key: "clientes",
        label: "Clientes",
        descripcion: "Datos, empresas, credenciales y responsables.",
        href: "/clientes",
        icon: Building2,
        estado: "proximamente",
      },
      {
        key: "trabajadores",
        label: "Trabajadores",
        descripcion: "Nómina por empresa: datos contractuales y previsionales.",
        href: "/trabajadores",
        icon: Users,
        estado: "proximamente",
      },
      {
        key: "excel-compartidos",
        label: "Excel compartidos",
        descripcion:
          "Novedades de remuneraciones del mes en vivo (cliente + equipo) y generación de archivos de liquidaciones y Previred.",
        href: "/excel",
        icon: Table2,
        estado: "activo",
      },
    ],
  },
  {
    seccion: "Análisis",
    modulos: [
      {
        key: "reportes",
        label: "Reportes",
        descripcion: "Indicadores históricos y alertas regulatorias.",
        href: "/reportes",
        icon: BarChart3,
        estado: "proximamente",
      },
    ],
  },
  {
    seccion: "Administración",
    modulos: [
      {
        key: "usuarios",
        label: "Usuarios del equipo",
        descripcion: "Miembros, roles y permisos. Solo administradores.",
        href: "/usuarios",
        icon: UserCog,
        estado: "proximamente",
        roles: ["admin"],
      },
    ],
  },
  {
    seccion: "Portal clientes",
    modulos: [
      {
        key: "links-clientes",
        label: "Links clientes",
        descripcion:
          "El link del portal de cada empresa: copiar, abrir y generar para las que no tienen.",
        href: "/links",
        icon: Link2,
        estado: "activo",
      },
    ],
  },
  {
    seccion: "Oficina",
    modulos: [
      {
        key: "facturacion",
        label: "Facturación",
        descripcion:
          "Facturas emitidas por la oficina a los clientes: descarga por cliente y carga mensual.",
        href: "/facturacion",
        icon: Receipt,
        estado: "activo",
      },
    ],
  },
];

/** Devuelve las secciones con módulos visibles para un rol dado. */
export function modulosVisibles(rol: Rol): SeccionModulos[] {
  return MODULOS.map((s) => ({
    seccion: s.seccion,
    modulos: s.modulos.filter((m) => !m.roles || m.roles.includes(rol)),
  })).filter((s) => s.modulos.length > 0);
}

import {
  Wallet,
  BookOpenCheck,
  BookText,
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
  ClipboardCheck,
  Stethoscope,
  FileDown,
  HandCoins,
  HardHat,
  KeyRound,
  ScrollText,
  Home,
  Scale,
  Send,
  Inbox,
  Library,
  DownloadCloud,
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
    seccion: "Inicio",
    modulos: [
      {
        key: "inicio",
        label: "Inicio y requerimientos",
        descripcion:
          "Bandeja de la oficina: todas las gestiones pendientes (contratos, anexos, finiquitos y lo que llegue) con asignación al equipo y calendario.",
        href: "/",
        icon: Inbox,
        estado: "activo",
      },
    ],
  },
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
        label: "Contabilidad",
        descripcion:
          "RCV del SII (compras, ventas, NC/ND) y documentos mensuales por empresa.",
        href: "/contabilidad",
        icon: BookOpenCheck,
        estado: "activo",
      },
      {
        key: "control-rcv",
        label: "Control RCV",
        descripcion:
          "Tablero de descargas del RCV desde el SII: matriz empresa × período que marca ventas y compras descargadas, faltantes y alto volumen pendiente.",
        href: "/control-rcv",
        icon: DownloadCloud,
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
        key: "comunicacion",
        label: "Comunicación mensual",
        descripcion:
          "Resumen mensual de pagos por empresa: Previred por centro de costo, F29 y facturas RS pendientes, con envío al cliente.",
        href: "/comunicacion",
        icon: Send,
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
          "Solicitudes del portal y control de saldos, papeletas y permisos Red Barrera.",
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
      {
        key: "libro-remuneraciones",
        label: "Libro de Remuneraciones",
        descripcion:
          "El LRE de cada empresa por mes, corregido al formato de la Dirección del Trabajo y listo para cargar en Mi DT, con descarga y estado de declaración.",
        href: "/libro-remuneraciones",
        icon: BookText,
        estado: "activo",
      },
      {
        key: "casa-particular",
        label: "Casa Particular",
        descripcion:
          "Generador de contratos de trabajador de casa particular puertas afuera (plazo fijo e indefinido) desde plantilla tipo, con empleador persona natural.",
        href: "/casa-particular",
        icon: Home,
        estado: "activo",
      },
    ],
  },
  {
    seccion: "Gestiones — Prevención (SST)",
    modulos: [
      {
        key: "rihs",
        label: "RIHS",
        descripcion:
          "Reglamento Interno de Higiene y Seguridad (D.S. N° 44) para entidades empleadoras con menos de 10 trabajadores: plantilla tipo y documento por empresa.",
        href: "/rihs",
        icon: HardHat,
        estado: "activo",
      },
      {
        key: "riohs",
        label: "RIOHS",
        descripcion:
          "Reglamento Interno de Orden, Higiene y Seguridad (Art. 153 Código del Trabajo) para entidades empleadoras con 10 o más trabajadores. Pendiente.",
        href: "/riohs",
        icon: ScrollText,
        estado: "proximamente",
      },
    ],
  },
  {
    seccion: "Gestiones — Contabilidad",
    modulos: [
      {
        key: "libro-mayor",
        label: "Libro Mayor",
        descripcion:
          "Libro Mayor anual importado desde KAME por empresa: detalle de movimientos, resumen por cuenta y cuadratura. Estado por cliente (cargado / sin información).",
        href: "/contabilidad/libro-mayor",
        icon: Library,
        estado: "activo",
      },
      {
        key: "documentos",
        label: "Solicitudes de documentos",
        descripcion:
          "Documentos contables (balance, libro mayor, libro diario, estado de resultados) que piden los clientes desde su portal. También recibe las solicitudes de documentos de personal.",
        href: "/documentos",
        icon: FileDown,
        estado: "activo",
      },
      {
        key: "mutuo",
        label: "Mutuo",
        descripcion:
          "Generador de contratos de mutuo de dinero desde plantilla, con datos y destino editables.",
        href: "/mutuo",
        icon: HandCoins,
        estado: "activo",
      },
    ],
  },
  {
    seccion: "Cartera",
    modulos: [
      {
        key: "onboarding",
        label: "Onboarding",
        descripcion:
          "Incorporación de clientes y empresas: alta con carpeta OneDrive automática y cola de validación de lo que cargan los clientes.",
        href: "/onboarding",
        icon: ClipboardCheck,
        estado: "activo",
      },
      {
        key: "clientes",
        label: "Clientes",
        descripcion:
          "Datos simples de cada cliente y checklist de completitud de sus fichas, para ir rellenando.",
        href: "/clientes",
        icon: Users,
        estado: "activo",
      },
      {
        key: "empresas",
        label: "Empresas",
        descripcion:
          "Ficha de cada empresa: datos tributarios, contacto, cuenta bancaria y servicios.",
        href: "/empresas",
        icon: Building2,
        estado: "activo",
      },
      {
        key: "credenciales",
        label: "Credenciales",
        descripcion:
          "Claves SII y Previred de cada empresa: ocultas con puntitos, ver o copiar con un click y edición en línea. Cada revelación queda auditada.",
        href: "/credenciales",
        icon: KeyRound,
        estado: "activo",
      },
      {
        key: "nominas",
        label: "Empresas — Nómina",
        descripcion:
          "Nómina de trabajadores de cada empresa: dotación activa vs. declarada y detalle contractual y previsional.",
        href: "/nominas",
        icon: Users,
        estado: "activo",
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
      {
        key: "gestiones-fr",
        label: "Gestiones Felipe Rodríguez",
        descripcion:
          "Causas judiciales (audiencias, plazos fatales, hitos) y prospección/cotizaciones. Sección protegida con clave.",
        href: "/gestiones-fr",
        icon: Scale,
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

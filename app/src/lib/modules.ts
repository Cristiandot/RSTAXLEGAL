import {
  Wallet,
  GitCompareArrows,
  FileText,
  FilePlus2,
  Inbox,
  Building2,
  Users,
  Table2,
  BarChart3,
  UserCog,
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
        key: "conciliacion",
        label: "Conciliación",
        descripcion: "Descargas SII C/V + revisión KAME + IVA salud.",
        href: "/conciliacion",
        icon: GitCompareArrows,
        estado: "proximamente",
      },
      {
        key: "f29",
        label: "F29",
        descripcion: "Armado y presentación mensual. Plazo día 20.",
        href: "/f29",
        icon: FileText,
        estado: "activo",
      },
    ],
  },
  {
    seccion: "Gestiones",
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
        key: "gestiones",
        label: "Gestiones RRHH",
        descripcion:
          "Amonestaciones, finiquitos y vacaciones solicitadas por los clientes desde su portal.",
        href: "/gestiones",
        icon: Inbox,
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
        descripcion: "Nóminas mensuales compartidas con cada cliente.",
        href: "/excel",
        icon: Table2,
        estado: "proximamente",
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
];

/** Devuelve las secciones con módulos visibles para un rol dado. */
export function modulosVisibles(rol: Rol): SeccionModulos[] {
  return MODULOS.map((s) => ({
    seccion: s.seccion,
    modulos: s.modulos.filter((m) => !m.roles || m.roles.includes(rol)),
  })).filter((s) => s.modulos.length > 0);
}

/**
 * Regiones y comunas de Chile (división político-administrativa vigente,
 * 16 regiones / 346 comunas) para los selectores de la ficha. Los nombres
 * de comuna coinciden con `catalogo_valores` tipo 'comuna' (codigo=etiqueta,
 * con tildes). El match región↔comuna se hace con nombre normalizado para
 * tolerar diferencias de tildes.
 *
 * OJO: esto es la geografía VIGENTE para la UI (Ñuble = XVI). No confundir
 * con los códigos del CSV de finiquitos DT (lib/dt-finiquitos.ts), que usan
 * la codificación antigua.
 */

export type RegionChile = {
  /** Número romano (o "RM") — se muestra junto al nombre. */
  numero: string;
  nombre: string;
  comunas: string[];
};

/** Orden oficial norte → sur. */
export const REGIONES_CHILE: RegionChile[] = [
  {
    numero: "XV",
    nombre: "Arica y Parinacota",
    comunas: ["Arica", "Camarones", "Putre", "General Lagos"],
  },
  {
    numero: "I",
    nombre: "Tarapacá",
    comunas: [
      "Iquique", "Alto Hospicio", "Pozo Almonte", "Camiña", "Colchane",
      "Huara", "Pica",
    ],
  },
  {
    numero: "II",
    nombre: "Antofagasta",
    comunas: [
      "Antofagasta", "Mejillones", "Sierra Gorda", "Taltal", "Calama",
      "Ollagüe", "San Pedro de Atacama", "Tocopilla", "María Elena",
    ],
  },
  {
    numero: "III",
    nombre: "Atacama",
    comunas: [
      "Copiapó", "Caldera", "Tierra Amarilla", "Chañaral", "Diego de Almagro",
      "Vallenar", "Alto del Carmen", "Freirina", "Huasco",
    ],
  },
  {
    numero: "IV",
    nombre: "Coquimbo",
    comunas: [
      "La Serena", "Coquimbo", "Andacollo", "La Higuera", "Paihuano",
      "Vicuña", "Illapel", "Canela", "Los Vilos", "Salamanca", "Ovalle",
      "Combarbalá", "Monte Patria", "Punitaqui", "Río Hurtado",
    ],
  },
  {
    numero: "V",
    nombre: "Valparaíso",
    comunas: [
      "Valparaíso", "Casablanca", "Concón", "Juan Fernández", "Puchuncaví",
      "Quintero", "Viña del Mar", "Isla de Pascua", "Los Andes",
      "Calle Larga", "Rinconada", "San Esteban", "La Ligua", "Cabildo",
      "Papudo", "Petorca", "Zapallar", "Quillota", "La Calera", "Hijuelas",
      "La Cruz", "Nogales", "San Antonio", "Algarrobo", "Cartagena",
      "El Quisco", "El Tabo", "Santo Domingo", "San Felipe", "Catemu",
      "Llaillay", "Panquehue", "Putaendo", "Santa María", "Quilpué",
      "Limache", "Olmué", "Villa Alemana",
    ],
  },
  {
    numero: "RM",
    nombre: "Metropolitana de Santiago",
    comunas: [
      "Santiago", "Cerrillos", "Cerro Navia", "Conchalí", "El Bosque",
      "Estación Central", "Huechuraba", "Independencia", "La Cisterna",
      "La Florida", "La Granja", "La Pintana", "La Reina", "Las Condes",
      "Lo Barnechea", "Lo Espejo", "Lo Prado", "Macul", "Maipú", "Ñuñoa",
      "Pedro Aguirre Cerda", "Peñalolén", "Providencia", "Pudahuel",
      "Quilicura", "Quinta Normal", "Recoleta", "Renca", "San Joaquín",
      "San Miguel", "San Ramón", "Vitacura", "Puente Alto", "Pirque",
      "San José de Maipo", "Colina", "Lampa", "Tiltil", "San Bernardo",
      "Buin", "Calera de Tango", "Paine", "Melipilla", "Alhué", "Curacaví",
      "María Pinto", "San Pedro", "Talagante", "El Monte", "Isla de Maipo",
      "Padre Hurtado", "Peñaflor",
    ],
  },
  {
    numero: "VI",
    nombre: "Libertador Gral. Bernardo O'Higgins",
    comunas: [
      "Rancagua", "Codegua", "Coinco", "Coltauco", "Doñihue", "Graneros",
      "Las Cabras", "Machalí", "Malloa", "Mostazal", "Olivar", "Peumo",
      "Pichidegua", "Quinta de Tilcoco", "Rengo", "Requínoa",
      "San Vicente de Tagua Tagua", "Pichilemu", "La Estrella", "Litueche",
      "Marchihue", "Navidad", "Paredones", "San Fernando", "Chépica",
      "Chimbarongo", "Lolol", "Nancagua", "Palmilla", "Peralillo",
      "Placilla", "Pumanque", "Santa Cruz",
    ],
  },
  {
    numero: "VII",
    nombre: "Maule",
    comunas: [
      "Talca", "Constitución", "Curepto", "Empedrado", "Maule", "Pelarco",
      "Pencahue", "Río Claro", "San Clemente", "San Rafael", "Cauquenes",
      "Chanco", "Pelluhue", "Curicó", "Hualañé", "Licantén", "Molina",
      "Rauco", "Romeral", "Sagrada Familia", "Teno", "Vichuquén", "Linares",
      "Colbún", "Longaví", "Parral", "Retiro", "San Javier", "Villa Alegre",
      "Yerbas Buenas",
    ],
  },
  {
    numero: "XVI",
    nombre: "Ñuble",
    comunas: [
      "Chillán", "Chillán Viejo", "Bulnes", "El Carmen", "Pemuco", "Pinto",
      "Quillón", "San Ignacio", "Yungay", "Cobquecura", "Coelemu", "Ninhue",
      "Portezuelo", "Quirihue", "Ránquil", "Trehuaco", "Coihueco", "Ñiquén",
      "San Carlos", "San Fabián", "San Nicolás",
    ],
  },
  {
    numero: "VIII",
    nombre: "Biobío",
    comunas: [
      "Concepción", "Coronel", "Chiguayante", "Florida", "Hualqui", "Lota",
      "Penco", "San Pedro de la Paz", "Santa Juana", "Talcahuano", "Tomé",
      "Hualpén", "Lebu", "Arauco", "Cañete", "Contulmo", "Curanilahue",
      "Los Álamos", "Tirúa", "Los Ángeles", "Antuco", "Cabrero", "Laja",
      "Mulchén", "Nacimiento", "Negrete", "Quilaco", "Quilleco",
      "San Rosendo", "Santa Bárbara", "Tucapel", "Yumbel", "Alto Biobío",
    ],
  },
  {
    numero: "IX",
    nombre: "La Araucanía",
    comunas: [
      "Temuco", "Carahue", "Cholchol", "Cunco", "Curarrehue", "Freire",
      "Galvarino", "Gorbea", "Lautaro", "Loncoche", "Melipeuco",
      "Nueva Imperial", "Padre Las Casas", "Perquenco", "Pitrufquén",
      "Pucón", "Saavedra", "Teodoro Schmidt", "Toltén", "Vilcún",
      "Villarrica", "Angol", "Collipulli", "Curacautín", "Ercilla",
      "Lonquimay", "Los Sauces", "Lumaco", "Purén", "Renaico", "Traiguén",
      "Victoria",
    ],
  },
  {
    numero: "XIV",
    nombre: "Los Ríos",
    comunas: [
      "Valdivia", "Corral", "Lanco", "Los Lagos", "Máfil", "Mariquina",
      "Paillaco", "Panguipulli", "La Unión", "Futrono", "Lago Ranco",
      "Río Bueno",
    ],
  },
  {
    numero: "X",
    nombre: "Los Lagos",
    comunas: [
      "Puerto Montt", "Calbuco", "Cochamó", "Fresia", "Frutillar",
      "Los Muermos", "Llanquihue", "Maullín", "Puerto Varas", "Castro",
      "Ancud", "Chonchi", "Curaco de Vélez", "Dalcahue", "Puqueldón",
      "Queilén", "Quellón", "Quemchi", "Quinchao", "Osorno", "Puerto Octay",
      "Purranque", "Puyehue", "Río Negro", "San Juan de la Costa",
      "San Pablo", "Chaitén", "Futaleufú", "Hualaihué", "Palena",
    ],
  },
  {
    numero: "XI",
    nombre: "Aysén del Gral. Carlos Ibáñez del Campo",
    comunas: [
      "Coyhaique", "Lago Verde", "Aysén", "Cisnes", "Guaitecas", "Cochrane",
      "O'Higgins", "Tortel", "Chile Chico", "Río Ibáñez",
    ],
  },
  {
    numero: "XII",
    nombre: "Magallanes y la Antártica Chilena",
    comunas: [
      "Punta Arenas", "Laguna Blanca", "Río Verde", "San Gregorio",
      "Cabo de Hornos", "Antártica", "Porvenir", "Primavera", "Timaukel",
      "Natales", "Torres del Paine",
    ],
  },
];

/** Nombre normalizado para comparar (sin tildes, minúsculas, sin signos). */
export function normalizarComuna(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Índice comuna normalizada → número de región ("VI", "RM", …). */
const REGION_POR_COMUNA: Record<string, string> = {};
for (const r of REGIONES_CHILE) {
  for (const c of r.comunas) REGION_POR_COMUNA[normalizarComuna(c)] = r.numero;
}

/** Región ("VI", "RM", …) a la que pertenece una comuna; null si no calza. */
export function regionDeComunaNombre(
  comuna: string | null | undefined,
): string | null {
  if (!comuna) return null;
  return REGION_POR_COMUNA[normalizarComuna(comuna)] ?? null;
}

/** ¿La comuna pertenece a la región indicada? (por nombre normalizado). */
export function comunaEnRegion(comuna: string, numeroRegion: string): boolean {
  return REGION_POR_COMUNA[normalizarComuna(comuna)] === numeroRegion;
}

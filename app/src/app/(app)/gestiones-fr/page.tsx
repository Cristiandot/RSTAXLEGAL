import GestionesFelipe from "@/components/gestiones-felipe";

/**
 * Gestiones Felipe Rodríguez — página propia accesible desde el sidebar
 * (sección Oficina). El contenido queda detrás de la clave de 4 dígitos
 * dentro del componente.
 */
export default function GestionesFRPage() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <GestionesFelipe />
    </main>
  );
}

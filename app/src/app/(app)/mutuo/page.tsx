import { MutuoClient } from "./mutuo-client";

export const metadata = { title: "Mutuo — RS Tax & Legal" };

export default function MutuoPage() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 sm:px-6">
      <MutuoClient />
    </main>
  );
}

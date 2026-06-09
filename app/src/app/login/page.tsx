import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Acceso — RS Tax & Legal",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Image
            src="/logo-claro.png"
            alt="Rodríguez Samith Tax & Legal"
            width={260}
            height={74}
            priority
            className="h-auto w-[260px]"
          />
        </div>
        <Card className="card-soft border-transparent">
          <CardHeader className="text-center">
            <CardDescription>
              Panel operativo interno. Acceso por link al correo autorizado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Rodríguez Samith Tax &amp; Legal · Viña del Mar
        </p>
      </div>
    </main>
  );
}

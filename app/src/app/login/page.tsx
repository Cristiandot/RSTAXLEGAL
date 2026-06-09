import { Scale } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Acceso — RS Tax & Legal",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <Scale className="size-6" />
          </span>
        </div>
        <Card className="card-soft border-transparent">
          <CardHeader className="text-center">
            <CardTitle className="font-heading text-2xl">
              RS Tax &amp; Legal
            </CardTitle>
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

"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user } = useAuth();

  // El latido vive aqui y no en cada pagina: este componente envuelve toda la
  // aplicacion y no se desmonta al navegar, asi que el intervalo sobrevive a
  // los cambios de pantalla en vez de reiniciarse en cada uno.
  //
  // Se activa solo con sesion: sin ella el endpoint responderia 401 cada 45
  // segundos, y en la pantalla de login no hay a quien registrar.
  // Las pantallas que se ven SIN sesion. Coinciden con PUBLIC_PATHS del proxy
  // y por eso estan aqui juntas: si una entra ahi y no aqui, se sirve con el
  // armazon del CRM alrededor.
  const esPublica =
    pathname === "/login" || pathname === "/privacy" || pathname === "/terms";

  usePresenceHeartbeat(Boolean(user?.email) && !esPublica);

  // ──────────────────────────────────────────────────────────────────────
  // SIN SIDEBAR NI LATIDO EN LAS PANTALLAS PUBLICAS.
  //
  // Las dos paginas legales se sirven a visitantes SIN SESION —entre ellos el
  // revisor de Google, que las abre para publicar la aplicacion OAuth—. Dentro
  // de este armazon veian la barra lateral del CRM entera, con Dashboard,
  // Clienti, Immobili y un boton de «Logout», y todos esos enlaces rebotan a
  // /login: parece una pantalla rota de una aplicacion ajena en vez de un
  // documento legal.
  //
  // Y hay un motivo mas concreto: este contenedor lleva `print:hidden`, y
  // globals.css esconde ademas todo el cuerpo al imprimir salvo el cartel de
  // escaparate. Una politica de privacidad que sale EN BLANCO al imprimirla o
  // al guardarla en PDF no sirve para archivarla, que es justo para lo que se
  // imprime un documento legal.
  // ──────────────────────────────────────────────────────────────────────
  if (esPublica) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full overflow-hidden bg-slate-50 print:hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-24 md:pb-6 p-4 md:p-8 lg:p-10 min-h-0 print:hidden">
        <div className="max-w-[1440px] mx-auto h-full flex flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}

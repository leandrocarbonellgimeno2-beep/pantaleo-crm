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
  usePresenceHeartbeat(Boolean(user?.email) && pathname !== "/login");

  // La pagina di login non mostra la sidebar
  if (pathname === "/login") {
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

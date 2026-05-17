"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

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

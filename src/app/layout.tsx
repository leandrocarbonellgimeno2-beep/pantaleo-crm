import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { ConfirmProvider } from "@/contexts/ConfirmDialog";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pantaleo CRM | Gestione Immobiliare Professionale",
  description: "Sistema di gestione immobiliare di alto rendimento",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="h-full">
      <body className={`${inter.className} h-full antialiased bg-background`}>
        <AuthProvider>
          <ConfirmProvider>
            <AuthenticatedLayout>
              {children}
            </AuthenticatedLayout>
          </ConfirmProvider>
        </AuthProvider>
        <Toaster
          position="bottom-right"
          richColors
          expand
          duration={5000}
          toastOptions={{
            style: {
              fontSize: '14px',
              fontWeight: 500,
            },
          }}
        />
      </body>
    </html>
  );
}


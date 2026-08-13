import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { DBProvider } from "@/components/DBProvider";

export const metadata: Metadata = {
  title: "Margen",
  description: "¿Cuánto puedo gastar hoy sin romper los próximos doce meses?",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Margen",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen flex flex-col">
        <DBProvider>
          <main className="flex-1 pb-20 overflow-y-auto">{children}</main>
          <BottomNav />
        </DBProvider>
      </body>
    </html>
  );
}

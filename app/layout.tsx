// app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import Footer from "@/app/components/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  icons: {
    icon: "/favicon.ico?v=2",
    shortcut: "/favicon.ico?v=2",
  },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-50 overflow-x-hidden">
        <AuthProvider>
          {/* Wrapper para mantener el footer al fondo */}
          <div className="min-h-screen flex flex-col">
            {/* Contenido de cada página */}
            <div className="flex-1">
              {children}
            </div>

            {/* Footer global */}
            <Footer />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}

// app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import Footer from "@/app/components/Footer";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-50">
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

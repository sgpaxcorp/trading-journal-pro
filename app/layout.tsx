// app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import Footer from "@/app/components/Footer";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  icons: {
    icon: "/favicon.ico?v=2",
    shortcut: "/favicon.ico?v=2",
    apple: "/apple-touch-icon.png",
  },
};
export default async function RootLayout({ children }: { children: ReactNode }) {
  // A fresh CSP nonce is created in proxy.ts for every request. Dynamic rendering
  // lets Next.js attach that same nonce to its bootstrap and framework scripts.
  await connection();

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

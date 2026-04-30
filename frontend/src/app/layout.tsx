import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EduPay – Registro de Pagos",
  description:
    "Sistema de registro manual de pagos para colegios. BaseLogic BL-002.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex bg-[var(--color-bg)]">
        <Sidebar />
        <main className="flex-1 ml-64 p-8 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}

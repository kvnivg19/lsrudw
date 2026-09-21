import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lansia SMART RSUD Wonosari",
  description: "Konfirmasi kehadiran lansia yang sederhana dan mudah digunakan"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

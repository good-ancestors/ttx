import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 2027 TTX - Facilitator Dashboard",
  description: "Tabletop Exercise facilitation tool for exploring AGI development scenarios",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

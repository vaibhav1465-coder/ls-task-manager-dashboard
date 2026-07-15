import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LS Task Manager Dashboard",
  description: "Read-only presentation dashboard powered by Google Sheets"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

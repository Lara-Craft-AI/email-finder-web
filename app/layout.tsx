import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "../public/fonts/GeistSans.ttf",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "../public/fonts/GeistMono.ttf",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Email Finder",
  description: "Find and verify work emails from a CSV upload.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-[#0a0a0b] antialiased`}
    >
      <body className="min-h-full bg-[#0a0a0b] font-sans text-zinc-100">{children}</body>
    </html>
  );
}

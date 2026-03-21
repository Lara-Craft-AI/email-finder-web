import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} min-h-full bg-white antialiased`}
    >
      <body className="min-h-full bg-white font-sans text-zinc-900">{children}</body>
    </html>
  );
}

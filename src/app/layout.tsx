import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.tryfocus.in"),
  title: "TryFocus — AI Fashion Marketing for Retail Stores",
  description: "AI try-on, personalized event videos, QR-led campaigns and showroom TV experiences for fashion retail brands.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "TryFocus — AI Fashion Marketing for Retail Stores",
    description: "AI try-on, personalized event videos, QR-led campaigns and showroom TV experiences for fashion retail brands.",
    url: "/",
    siteName: "TryFocus",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TryFocus — AI Fashion Marketing for Retail Stores",
    description: "AI try-on, personalized event videos, QR-led campaigns and showroom TV experiences for fashion retail brands.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-screen bg-canvas text-ink selection:bg-brand selection:text-white">
        {children}
      </body>
    </html>
  );
}

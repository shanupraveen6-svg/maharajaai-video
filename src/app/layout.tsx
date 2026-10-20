import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#070609] text-[#F8F5EE] selection:bg-[#D4AF37] selection:text-black">
        {children}
      </body>
    </html>
  );
}

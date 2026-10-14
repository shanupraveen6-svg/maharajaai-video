import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAHARAJA THANJAVUR — AI Diwali Fashion Experience",
  description: "Turn every ₹5,000+ Diwali purchase into a personalized AI Diwali fashion film on the big screen.",
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

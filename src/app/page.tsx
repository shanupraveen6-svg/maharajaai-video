import React from 'react';
import Link from 'next/link';
import { Flame, Sparkles, ArrowRight, Camera, Shirt, Tv, Smartphone, Download, BadgeCheck, ShieldCheck } from 'lucide-react';
import packageInfo from '../../package.json';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#070609] text-[#F8F5EE] font-sans relative overflow-hidden">
      
      {/* Background Decorative Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-radial from-[#6e0d1f]/30 via-[#2A060C]/10 to-transparent pointer-events-none blur-3xl" />

      {/* Header */}
      <header className="relative z-20 max-w-7xl mx-auto px-6 py-8 flex justify-between items-center border-b border-[#D4AF37]/20">
        <div className="flex items-center gap-3">
          <Flame className="w-8 h-8 text-[#D4AF37] animate-diya" />
          <div>
            <h1 className="text-2xl font-serif font-bold text-[#F3E5AB] tracking-widest uppercase">
              MAHARAJA
            </h1>
            <p className="text-[10px] text-[#D4AF37]/70 tracking-widest uppercase">
              THANJAVUR — SINCE 1985
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="text-xs uppercase tracking-wider text-gray-400 hover:text-[#D4AF37] transition hidden sm:block"
          >
            Store Admin
          </Link>
          <Link
            href="/tv"
            className="text-xs uppercase tracking-wider px-4 py-2 rounded-full border border-[#D4AF37]/40 text-[#F3E5AB] hover:bg-[#D4AF37]/10 transition"
          >
            TV Player
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#6e0d1f]/40 border border-[#D4AF37]/40 text-[#F3E5AB] text-xs uppercase tracking-widest mb-8">
          <Sparkles className="w-4 h-4 text-[#D4AF37]" />
          EXCLUSIVELY FOR DIWALI PURCHASES ₹5,000+
        </div>

        <h1 className="text-4xl md:text-7xl font-serif font-bold text-[#F3E5AB] leading-tight tracking-wide mb-6">
          “This Diwali, turn every ₹5,000+ purchase into a moment worth sharing.”
        </h1>

        <p className="text-lg md:text-2xl text-gray-300 max-w-3xl mx-auto mb-10 font-light leading-relaxed">
          Customers don't just buy an outfit. They become the face of Maharaja's Diwali celebration on our store screen.
        </p>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-5">
          <Link
            href="/create"
            className="w-full sm:w-auto py-4 px-8 rounded-full bg-gradient-to-r from-[#800A1D] via-[#D4AF37] to-[#800A1D] text-black font-bold uppercase tracking-wider text-base shadow-2xl hover:scale-105 transition flex items-center justify-center gap-3"
          >
            CREATE AI VIDEO <ArrowRight className="w-5 h-5" />
          </Link>
          <a
            href="#journey"
            className="w-full sm:w-auto py-4 px-8 rounded-full bg-black/60 border border-[#D4AF37]/40 text-[#F3E5AB] uppercase tracking-wider text-sm font-semibold hover:bg-black transition"
          >
            EXPLORE THE IDEA
          </a>
        </div>
      </section>

      {/* Web App Install Card */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-16">
        <div className="maharaja-card overflow-hidden border border-[#D4AF37]/30 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="p-7 md:p-10 flex flex-col justify-between gap-8">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/40 border border-emerald-400/30 text-emerald-200 text-[11px] uppercase tracking-widest font-semibold mb-5">
                  <BadgeCheck className="w-4 h-4" />
                  Latest Web App v{packageInfo.version}
                </div>

                <h2 className="text-3xl md:text-5xl font-serif font-bold text-[#F3E5AB] leading-tight mb-4">
                  Download our app for the fastest store workflow.
                </h2>

                <p className="text-sm md:text-base text-gray-300 leading-relaxed max-w-2xl">
                  Install the Maharaja AI Diwali Experience as a web app on your phone, tablet, or TV browser. No app store needed, just the latest web version ready from this site.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/create"
                  className="w-full sm:w-auto py-4 px-7 rounded-full bg-[#F5E089] text-black font-bold uppercase tracking-wider text-sm shadow-xl hover:bg-white transition flex items-center justify-center gap-3"
                >
                  <Download className="w-5 h-5" />
                  Install Web App
                </Link>
                <Link
                  href="/tv"
                  className="w-full sm:w-auto py-4 px-7 rounded-full bg-black/60 border border-cyan-300/30 text-cyan-100 uppercase tracking-wider text-sm font-semibold hover:bg-cyan-950/30 transition flex items-center justify-center gap-3"
                >
                  <Tv className="w-5 h-5" />
                  Open TV App
                </Link>
              </div>
            </div>

            <div className="relative min-h-[280px] bg-[#05080A] border-t lg:border-t-0 lg:border-l border-[#D4AF37]/20 overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(34,211,238,0.22),transparent_32%),radial-gradient(circle_at_80%_30%,rgba(212,175,55,0.2),transparent_34%),linear-gradient(145deg,rgba(110,13,31,0.36),rgba(5,8,10,0.92))]" />
              <div className="relative h-full p-8 flex items-center justify-center">
                <div className="w-full max-w-sm rounded-[2rem] border border-white/15 bg-black/70 p-4 shadow-2xl">
                  <div className="rounded-[1.35rem] border border-[#D4AF37]/25 bg-[#10070C] p-5">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[#D4AF37] text-black flex items-center justify-center">
                          <Smartphone className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">Maharaja AI</p>
                          <p className="text-[11px] text-gray-400">Web app install</p>
                        </div>
                      </div>
                      <ShieldCheck className="w-5 h-5 text-emerald-300" />
                    </div>

                    <div className="space-y-3">
                      <div className="h-3 rounded-full bg-[#D4AF37]/80 w-4/5" />
                      <div className="h-3 rounded-full bg-cyan-200/50 w-2/3" />
                      <div className="h-3 rounded-full bg-white/15 w-full" />
                    </div>

                    <div className="mt-8 grid grid-cols-3 gap-3">
                      <div className="aspect-square rounded-2xl bg-[#6e0d1f]/70 border border-[#D4AF37]/20" />
                      <div className="aspect-square rounded-2xl bg-[#D4AF37]/80 border border-[#F5E089]/30" />
                      <div className="aspect-square rounded-2xl bg-cyan-300/20 border border-cyan-200/25" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Visual Journey Steps */}
      <section id="journey" className="relative z-10 max-w-6xl mx-auto px-6 py-16 border-t border-[#D4AF37]/15">
        <div className="text-center mb-14">
          <p className="text-xs text-[#D4AF37] uppercase tracking-widest font-semibold mb-2">
            THE MAHARAJA EXPERIENCE JOURNEY
          </p>
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-[#F3E5AB]">
            SHOP → SCAN → STYLE → STAR → SHARE → GO LIVE
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="maharaja-card p-8 rounded-2xl border border-[#D4AF37]/30 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#6e0d1f]/40 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
              <Shirt className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-serif font-bold text-[#F3E5AB] mb-2">1. Garment Scan</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              Store staff photograph the customer's purchased outfit using the Maharaja Visual Engine scanner.
            </p>
          </div>

          <div className="maharaja-card p-8 rounded-2xl border border-[#D4AF37]/30 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#6e0d1f]/40 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
              <Camera className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-serif font-bold text-[#F3E5AB] mb-2">2. AI Styling & Film</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              Gemini synthesizes a master fashion reference image and generates a 6-second Diwali video with a Tamil greeting.
            </p>
          </div>

          <div className="maharaja-card p-8 rounded-2xl border border-[#D4AF37]/30 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#6e0d1f]/40 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
              <Tv className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-serif font-bold text-[#F3E5AB] mb-2">3. Download & Go Live</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              Customer downloads their MP4 video and hits GO LIVE to broadcast it onto Maharaja's main in-store TV display.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#D4AF37]/20 py-8 text-center text-xs text-gray-500">
        MAHARAJA READY-MADE STORE, THANJAVUR, TAMIL NADU • POWERED BY GOOGLE AI & NEXT.JS
      </footer>

    </main>
  );
}

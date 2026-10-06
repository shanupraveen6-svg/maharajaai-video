'use client';

import React from 'react';
import { Tv, Sparkles, ShieldCheck } from 'lucide-react';

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-[#070609] text-[#F8F5EE] p-6 md:p-12 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#D4AF37]/20 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#D4AF37]">
              <ShieldCheck className="w-4 h-4" /> STORE OPERATIONS DASHBOARD
            </div>
            <h1 className="text-3xl font-serif font-bold text-[#F3E5AB] tracking-wide mt-1">
              MAHARAJA THANJAVUR — ADMIN
            </h1>
          </div>
        </div>

        {/* Operations Card */}
        <div className="maharaja-card p-8 rounded-2xl border border-[#D4AF37]/40 relative overflow-hidden">
          <div className="flex items-center gap-3 text-[#D4AF37] mb-2 font-mono text-xs uppercase tracking-widest">
            <Sparkles className="w-4 h-4" /> LIVE DISPLAY VERIFICATION
          </div>

          <h2 className="text-2xl font-serif font-bold text-[#F3E5AB] mb-3">
            Test With A Real Created Session
          </h2>

          <p className="text-sm text-gray-300 mb-6 leading-relaxed max-w-2xl">
            Sample video enqueue has been removed. Use <code className="text-[#D4AF37]">/create</code> to finish a real proof or API test session, then use the result page <code className="text-[#D4AF37]">Go Live</code> button to send that exact session to <code className="text-[#D4AF37]">/tv</code>.
          </p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <a
              href="/tv"
              target="_blank"
              rel="noopener noreferrer"
              className="py-4 px-6 rounded-xl bg-black/60 border border-[#D4AF37]/40 text-[#F3E5AB] text-sm uppercase tracking-wider font-semibold hover:bg-black transition flex items-center gap-2"
            >
              <Tv className="w-4 h-4 text-[#D4AF37]" /> OPEN /tv DISPLAY IN NEW TAB
            </a>
          </div>
        </div>

        {/* Display Status */}
        <div className="maharaja-card p-6 rounded-xl border border-[#D4AF37]/30">
          <h3 className="text-lg font-serif font-bold text-[#F3E5AB] mb-4 flex items-center gap-2">
            <Tv className="w-5 h-5 text-[#D4AF37]" /> Connected Display Kiosk
          </h3>

          <div className="p-4 rounded-lg bg-black/50 border border-white/10 flex justify-between items-center">
            <div>
              <p className="font-semibold text-white text-sm">Maharaja Main Display</p>
              <p className="text-xs text-gray-400 font-mono">Screen ID: maharaja-main</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px] font-medium">
              ACTIVE PLAYER
            </span>
          </div>
        </div>

      </div>
    </main>
  );
}

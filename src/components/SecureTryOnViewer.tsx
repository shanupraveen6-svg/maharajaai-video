'use client';

import { Sparkles } from 'lucide-react';

interface SecureTryOnViewerProps {
  imageUrl: string | null;
  alt?: string;
}

export default function SecureTryOnViewer({
  imageUrl,
  alt = 'Maharaja AI Try-On',
}: SecureTryOnViewerProps) {
  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
      {/* Signed Storage URLs render directly; canvas CORS can otherwise leave the preview blank. */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-[#F3E5AB]/45">
          <Sparkles className="h-12 w-12" />
          <span className="text-xs font-bold uppercase">AI result preview</span>
        </div>
      )}

      {/* Top-Right Client Logo */}
      {imageUrl && (
        <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-full border border-[#D4AF37]/50 bg-black/60 px-2 py-1 backdrop-blur-sm shadow-md">
          <img src="/maharaja-logo.png" alt="Maharaja Silks" className="h-4 w-4 rounded-full object-contain" />
          <span className="text-[10px] font-bold tracking-wider uppercase text-[#F3E5AB]">Maharaja</span>
        </div>
      )}

    </div>
  );
}

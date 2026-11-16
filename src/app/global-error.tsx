'use client';

/**
 * The last safety net: shown only if the root layout itself fails. It must carry its own html and body and
 * cannot rely on the app's styles, so the colours are written in place.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error('App failed:', error.message, error.digest || '');
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F5F2', color: '#1A1A1A', fontFamily: 'system-ui, sans-serif', padding: 20 }}>
        <div style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 20, padding: 32, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#8A1127', margin: 0 }}>TRYFOCUS</p>
          <h1 style={{ fontSize: 24, margin: '12px 0 0' }}>This screen could not open</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#6B6B6B', margin: '12px 0 0' }}>Nothing was used. Please try again; if it happens again, ask our staff.</p>
          <button type="button" onClick={() => reset()} style={{ marginTop: 24, width: '100%', minHeight: 56, borderRadius: 14, border: 0, background: '#8A1127', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Try again</button>
        </div>
      </body>
    </html>
  );
}

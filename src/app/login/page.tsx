'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, LockKeyhole, Store, WandSparkles } from 'lucide-react';

const USERNAME = 'shanu7';
const PASSWORD = '99948387342';

function MaharajaLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const nextPath = useMemo(() => {
    const next = searchParams.get('next') || '/create';
    return next.startsWith('/') ? next : '/create';
  }, [searchParams]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (username.trim() !== USERNAME || password.trim() !== PASSWORD) {
      setError('Invalid Maharaja login. Please check username and password.');
      return;
    }

    const res = await fetch('/api/operator/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      setError('Invalid Maharaja login. Please check username and password.');
      return;
    }

    router.replace(nextPath);
  }

  return (
    <main className="min-h-screen bg-[#F8F5EE] text-[#1A1412]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,245,238,0.96),rgba(248,245,238,0.88)),url('https://images.unsplash.com/photo-1615715874901-4412f63d6e0f?auto=format&fit=crop&w=1800&q=80')]" />
      <section className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6">
        <Link href="/" className="inline-flex w-fit items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#6e0d1f] text-[#F3E5AB]">
            <WandSparkles className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-serif text-2xl font-bold text-[#6e0d1f]">focusAI</span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.28em] text-[#8A6A20]">Maharaja workspace</span>
          </span>
        </Link>

        <div className="grid flex-1 items-center gap-8 py-10 md:grid-cols-[1fr_420px]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#6e0d1f]/15 bg-white/75 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#6e0d1f]">
              <Store className="h-4 w-4 text-[#8A6A20]" />
              Maharaja selected
            </div>
            <h1 className="font-serif text-5xl font-bold leading-tight text-[#2A060C] md:text-6xl">
              Login to create Diwali greeting videos.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-[#4A3B35]">
              Enter the Maharaja operator login to upload garment photos, generate the AI image, approve it, and send the final video to the store TV.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="rounded-2xl border border-[#6e0d1f]/14 bg-white/90 p-6 shadow-2xl backdrop-blur">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6e0d1f] text-[#F3E5AB]">
                <LockKeyhole className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-serif text-2xl font-bold text-[#2A060C]">Maharaja Login</h2>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8A6A20]">Create workspace</p>
              </div>
            </div>

            <label className="block text-xs font-bold uppercase tracking-wider text-[#5C4B43]">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[#6e0d1f]/18 bg-[#fffaf0] px-4 py-3 text-base font-semibold text-[#2A060C] outline-none focus:border-[#6e0d1f]"
                autoComplete="username"
                autoFocus
              />
            </label>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-[#5C4B43]">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[#6e0d1f]/18 bg-[#fffaf0] px-4 py-3 text-base font-semibold text-[#2A060C] outline-none focus:border-[#6e0d1f]"
                autoComplete="current-password"
              />
            </label>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#6e0d1f] px-5 py-4 text-sm font-bold uppercase tracking-wider text-[#F3E5AB] shadow-lg transition hover:bg-[#800A1D]"
            >
              Enter Create Page <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default function MaharajaLoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#F8F5EE]" />}>
      <MaharajaLoginForm />
    </Suspense>
  );
}

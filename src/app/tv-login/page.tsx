'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, MonitorPlay, Tv } from 'lucide-react';

const USERNAME = 'shanu7';
const PASSWORDS = ['99948387342', '9994837342'];

function TvLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const nextPath = useMemo(() => {
    const next = searchParams.get('next') || '/tv';
    return next.startsWith('/') ? next : '/tv';
  }, [searchParams]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (username.trim() !== USERNAME || !PASSWORDS.includes(password.trim())) {
      setError('Invalid TV login. Please check username and password.');
      return;
    }

    const res = await fetch('/api/operator/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || 'Invalid TV login. Please check username and password.');
      return;
    }

    router.replace(nextPath);
  }

  return (
    <main className="min-h-screen bg-[#070609] text-[#F3E5AB]">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-8">
        <Link href="/" className="mb-8 inline-flex w-fit items-center gap-3 text-[#D4AF37]">
          <Tv className="h-6 w-6" />
          <span className="text-xs font-bold uppercase tracking-[0.24em]">focusAI TV</span>
        </Link>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-[#D4AF37]/35 bg-[#12070a] p-6 shadow-[0_0_48px_rgba(212,175,55,0.14)]">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6e0d1f] text-[#D4AF37]">
              <MonitorPlay className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-serif text-3xl font-bold text-[#F3E5AB]">TV Login</h1>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37]">Maharaja display</p>
            </div>
          </div>

          <label className="block text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#D4AF37]/30 bg-black px-4 py-3 text-base font-semibold text-white outline-none focus:border-[#D4AF37]"
              autoComplete="username"
              autoFocus
            />
          </label>

          <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#D4AF37]/30 bg-black px-4 py-3 text-base font-semibold text-white outline-none focus:border-[#D4AF37]"
              autoComplete="current-password"
            />
          </label>

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-xs font-semibold text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-4 text-sm font-black uppercase tracking-wider text-black transition hover:bg-[#F5E089]"
          >
            Enter TV Screen <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </section>
    </main>
  );
}

export default function TvLoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#070609]" />}>
      <TvLoginForm />
    </Suspense>
  );
}

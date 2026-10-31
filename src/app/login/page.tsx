'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, LoaderCircle, LockKeyhole, Store, WandSparkles } from 'lucide-react';

function MaharajaLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextPath = useMemo(() => {
    const next = searchParams.get('next') || '/maharaja/workspace';
    return next.startsWith('/') && !next.startsWith('//') ? next : '/maharaja/workspace';
  }, [searchParams]);

  React.useEffect(() => {
    router.prefetch(nextPath);
  }, [router, nextPath]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }

    setIsSubmitting(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch('/api/operator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'same-origin',
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Invalid login. Please check username and password.');
        setIsSubmitting(false);
        return;
      }

      const data = await res.json().catch(() => null);
      // Client logins never open TryFocus admin; they land on their own workspace.
      window.location.assign(data?.role === 'client' && nextPath.startsWith('/admin') ? '/maharaja/client-admin' : nextPath);
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === 'AbortError'
        ? 'Login is taking too long. Please check your connection and try again.'
        : 'Connection error. Please try again.');
      setIsSubmitting(false);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  const isAdmin = nextPath.startsWith('/admin');
  return (
    <main className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="mx-auto flex w-full max-w-5xl items-center px-5 py-5">
        <Link href="/" className="inline-flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
            <WandSparkles className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold">TryFocus</span>
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-16">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            {isAdmin ? <LockKeyhole className="h-6 w-6" /> : <Store className="h-6 w-6" />}
          </span>
          <div>
            <h1 className="text-2xl font-bold">{isAdmin ? 'TryFocus admin' : 'Store sign in'}</h1>
            <p className="text-[15px] text-muted">{isAdmin ? 'Manage clients, devices and credits.' : 'Your QR codes, catalogue, videos and usage.'}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="tf-card space-y-4 p-6">
            <label htmlFor="username-input" className="block text-sm font-semibold text-ink">
              Username
              <input
                id="username-input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-base text-ink outline-none focus:border-brand"
                autoComplete="username"
                autoFocus
              />
            </label>

            <label htmlFor="password-input" className="block text-sm font-semibold text-ink">
              Password
              <input
                id="password-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-base text-ink outline-none focus:border-brand"
                autoComplete="current-password"
              />
            </label>

            {error && (
              <div className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              id="login-submit-btn"
              disabled={isSubmitting}
              className="tf-btn tf-btn-primary w-full !min-h-12"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="h-4 w-4" />
                </>

              )}
            </button>
          </form>
      </section>
    </main>
  );
}

export default function MaharajaLoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-canvas" />}>
      <MaharajaLoginForm />
    </Suspense>
  );
}

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.VERCEL_DEPLOYMENT_ID
    || process.env.NEXT_PUBLIC_BUILD_VERSION
    || 'local-development';

  return NextResponse.json(
    { version },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      },
    },
  );
}

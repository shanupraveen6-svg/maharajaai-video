export const dynamic = 'force-dynamic';
export const revalidate = 0;

import ResultClient from './ResultClient';

export default async function ResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ access?: string }>;
}) {
  const { sessionId = '' } = await params;
  const { access = '' } = await searchParams;

  return <ResultClient sessionId={sessionId} accessCode={access} />;
}

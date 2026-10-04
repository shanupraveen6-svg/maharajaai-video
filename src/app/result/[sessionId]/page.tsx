export const dynamic = 'force-dynamic';
export const revalidate = 0;

import ResultClient from './ResultClient';

export default async function ResultPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId = '' } = await params;

  return <ResultClient sessionId={sessionId} />;
}

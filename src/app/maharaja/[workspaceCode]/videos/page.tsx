'use client';

import ClientVideoLibrary from '@/components/ClientVideoLibrary';
import { useParams } from 'next/navigation';

export default function MaharajaGoLiveVideosPage() {
  const params = useParams<{ workspaceCode: string }>();
  const workspaceCode = params?.workspaceCode || 'workspace';
  return (
    <ClientVideoLibrary
      backHref={`/maharaja/${workspaceCode}`}
      backLabel="Back to Client Workspace"
    />
  );
}

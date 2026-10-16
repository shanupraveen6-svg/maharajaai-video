'use client';

import MaharajaAdminDashboard from '@/components/MaharajaAdminDashboard';
import { useParams } from 'next/navigation';

export default function MaharajaWorkspaceAdminPage() {
  const params = useParams<{ workspaceCode: string }>();
  return <MaharajaAdminDashboard expectedWorkspaceCode={params.workspaceCode} />;
}

import { redirect } from 'next/navigation';

// Store, counter and privacy settings live on the client workspace.
export default function StoreOperationsPage() {
  redirect('/maharaja/client-admin');
}

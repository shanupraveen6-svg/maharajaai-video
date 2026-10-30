import { redirect } from 'next/navigation';

// Campaign, event, video and Go Live settings live on the client workspace.
export default function ClientCampaignsPage() {
  redirect('/maharaja/client-admin');
}

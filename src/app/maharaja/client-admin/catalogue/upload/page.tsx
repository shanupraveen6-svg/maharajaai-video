import { redirect } from 'next/navigation';

// Garments are uploaded in the workspace's Catalogue tab.
export default function CatalogueUploadPage() {
  redirect('/maharaja/client-admin');
}

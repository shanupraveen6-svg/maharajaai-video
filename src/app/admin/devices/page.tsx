import { redirect } from 'next/navigation';

// Device switches for each client are managed in TryFocus admin.
export default function DeviceOperationsPage() {
  redirect('/admin');
}

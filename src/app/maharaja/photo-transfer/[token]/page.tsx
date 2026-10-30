import PhonePhotoUpload from '@/components/PhonePhotoUpload';

export default async function PhotoTransferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PhonePhotoUpload token={token} />;
}

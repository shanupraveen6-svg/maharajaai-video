import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/operator';
import { listEnquiries } from '@/lib/tryfocus/enquiries';

export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'TryFocus admin only.' }, { status: 403 });
  }
  return NextResponse.json({ success: true, enquiries: await listEnquiries() });
}

import crypto from 'crypto';
import { getDb, getMockStore } from '@/lib/firebase/admin';

/** Interest captured from the public site (pricing, demo) and from client workspaces (more credits, modules). */
export type Enquiry = {
  id: string;
  name: string;
  phone: string;
  storeName: string;
  city: string;
  interest: string;
  modules: string[];
  message: string;
  source: string;
  createdAt: string;
  emailed: boolean;
};

const COLLECTION = 'tryfocusEnquiries';
const mockKey = (id: string) => `enquiry_${id}`;

export function newEnquiryId() {
  return `enq_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

export async function saveEnquiry(enquiry: Enquiry) {
  const db = getDb();
  if (db) await db.collection(COLLECTION).doc(enquiry.id).set(enquiry);
  else getMockStore().sessions.set(mockKey(enquiry.id), enquiry);
}

export async function listEnquiries(limit = 50): Promise<Enquiry[]> {
  const db = getDb();
  if (db) {
    const snapshot = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => doc.data() as Enquiry);
  }
  return Array.from(getMockStore().sessions.entries())
    .filter(([key]) => key.startsWith('enquiry_'))
    .map(([, value]) => value as Enquiry)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

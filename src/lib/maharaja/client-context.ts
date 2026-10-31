import { AsyncLocalStorage } from 'node:async_hooks';
import { MAHARAJA_CLIENT_ID } from './config';

const clientContext = new AsyncLocalStorage<{ clientId: string }>();

/**
 * Binds the rest of the current request to one client workspace, so every Firestore and Storage
 * path below it uses that client. Call it in the route handler itself, right after authentication:
 * a binding made inside an awaited helper does not carry back to the caller.
 */
export function bindClient(clientId: string | null | undefined) {
  clientContext.enterWith({ clientId: normalizeClientId(clientId) });
}

/** The client this request belongs to; requests that never bind one are Maharaja's. */
export function activeClientId() {
  return clientContext.getStore()?.clientId || MAHARAJA_CLIENT_ID;
}

export function normalizeClientId(clientId: string | null | undefined) {
  const clean = String(clientId || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,40}$/.test(clean) ? clean : MAHARAJA_CLIENT_ID;
}

/** Go Live queue of the bound client; Maharaja keeps its original screen id so queued items stay valid. */
export function liveScreenId() {
  const clientId = activeClientId();
  return clientId === MAHARAJA_CLIENT_ID ? 'maharaja-main' : `${clientId}-main`;
}

/** Runs `fn` with the given client bound, for jobs and tests that act for several clients in turn. */
export function runWithClient<T>(clientId: string, fn: () => T): T {
  return clientContext.run({ clientId: normalizeClientId(clientId) }, fn);
}

/**
 * Whether a storage path belongs to the bound client. Media lives under `clients/<id>/`; older
 * files outside that folder (Maharaja's original demo clips) count as Maharaja's.
 */
export function storagePathBelongsToActiveClient(storagePath: string | null | undefined) {
  const owner = /^clients\/([^/]+)\//.exec(String(storagePath || ''))?.[1];
  return owner ? owner === activeClientId() : activeClientId() === MAHARAJA_CLIENT_ID;
}

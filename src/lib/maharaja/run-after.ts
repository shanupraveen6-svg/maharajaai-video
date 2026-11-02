import { after } from 'next/server';

/** Runs work after the response is sent; outside a request (scripts, tests) it simply runs now. */
export function runAfter(task: () => Promise<unknown>) {
  try {
    after(task);
  } catch {
    void task().catch(() => undefined);
  }
}

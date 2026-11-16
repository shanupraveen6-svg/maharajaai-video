import { NextResponse } from 'next/server';

/**
 * Wraps an API route so an unexpected error (database down, a bad record) answers with a plain JSON message
 * and a 500 instead of the framework's bare error page. The cause is logged on the server; the customer or
 * staff screen shows one calm sentence and can try again.
 */
export function guardRoute<A extends unknown[]>(handler: (...args: A) => Promise<Response>, label = 'Route') {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error(`${label} failed:`, error instanceof Error ? error.message : error);
      return NextResponse.json(
        { success: false, error: 'Something went wrong on our side. Please try again.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  };
}

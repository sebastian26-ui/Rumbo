/**
 * Thin wrapper around fetch that attaches the current Firebase user's
 * ID token as a Bearer credential on every call. All frontend code that
 * hits /api/* should go through this — direct `fetch('/api/…')` will be
 * rejected by the server (server/auth.ts) with 401.
 *
 * If the user isn't signed in, the request still goes out without a
 * token, so the server can return 401 and the caller can react. We
 * deliberately don't throw locally — the UI gate already keeps unsigned
 * users out of the routing surface; a stray request from a logged-out
 * tab should fail with the server's canonical 401 shape.
 *
 * Token caching is handled by Firebase itself: getIdToken() returns a
 * cached token until ~5 min before expiry, then transparently refreshes.
 * No extra caching layer needed here.
 */
import { auth } from '../firebase';

async function currentIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch (e) {
    console.warn('getIdToken failed', e);
    return null;
  }
}

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await currentIdToken();

  // Merge headers without dropping caller-supplied entries.
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}

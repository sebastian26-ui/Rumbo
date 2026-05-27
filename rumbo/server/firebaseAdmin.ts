/**
 * Firebase Admin SDK — lazy-initialized from FIREBASE_SERVICE_ACCOUNT.
 *
 * We deliberately avoid firebase-admin for ID-token verification (see
 * server/auth.ts — JWKS via jose, no creds needed). The Admin SDK is only
 * loaded here because `generateEmailVerificationLink` requires a
 * service-account credential, and that's the one Firebase operation we
 * actually need server-side.
 *
 * The service account JSON is read from a single env var so Render /
 * deployment platforms can inject it without a file on disk. Most env
 * stores escape PEM newlines as \n; we restore them before handing to cert().
 */
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { logger } from "./logger";

let initialized = false;

function ensureInitialized() {
  if (initialized || getApps().length > 0) {
    initialized = true;
    return;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT not set. Download the JSON from Firebase " +
        "Console -> Project settings -> Service accounts -> Generate new " +
        "private key, then paste the entire JSON content as a single env var.",
    );
  }
  let parsed: { project_id: string; private_key: string; client_email: string };
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    logger.error({ err: e }, "[admin] FIREBASE_SERVICE_ACCOUNT is not valid JSON");
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
  }
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  initializeApp({ credential: cert(parsed as Parameters<typeof cert>[0]) });
  initialized = true;
  logger.info({ projectId: parsed.project_id }, "[admin] firebase-admin initialized");
}

export function adminAuth(): Auth {
  ensureInitialized();
  return getAuth();
}

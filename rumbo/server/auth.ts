/**
 * Verify Firebase ID tokens on incoming requests.
 *
 * Why this exists: without it, /api/* is open to the public internet and
 * one attacker can burn the GraphHopper free tier in minutes. CORS is
 * browser-only; rate limits per IP are not enough.
 *
 * Why not firebase-admin: it requires a service-account JSON, which
 * adds an env var + secret rotation burden. ID tokens are standard
 * RS256 JWTs signed by Google — we can verify them ourselves against
 * Google's public JWKS using `jose`, with no project credentials.
 *
 * The middleware:
 *   1. Reads Bearer <token> from Authorization.
 *   2. Verifies signature against Google's securetoken JWKS (cached).
 *   3. Validates issuer = https://securetoken.google.com/<projectId>,
 *      audience = <projectId>, and standard exp / iat / auth_time.
 *   4. Attaches { uid, email, emailVerified } to req.user.
 *
 * Set REQUIRE_AUTH=0 to disable locally if you're testing without sign-in.
 * In production REQUIRE_AUTH defaults to on.
 */
import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import firebaseConfig from "../firebase-applet-config.json";
import { logger } from "./logger";

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;

const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;

// Google publishes the Firebase ID token signing keys as a JWK set at
// this URL. jose's createRemoteJWKSet fetches + caches + rotates them.
const JWKS_URL = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
);

const jwks = createRemoteJWKSet(JWKS_URL, {
  cooldownDuration: 60_000,
  cacheMaxAge: 60 * 60_000, // 1 hour
});

interface FirebaseClaims extends JWTPayload {
  user_id?: string;
  email?: string;
  email_verified?: boolean;
  firebase?: {
    sign_in_provider?: string;
  };
}

export interface AuthedUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  signInProvider: string | null;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthedUser;
  }
}

function authDisabled(): boolean {
  // Allow opting out locally (e.g. for curl tests); default OFF in prod.
  if (process.env.REQUIRE_AUTH === "0") return true;
  if (process.env.NODE_ENV !== "production" && process.env.REQUIRE_AUTH !== "1") {
    return true;
  }
  return false;
}

export function requireFirebaseAuth() {
  if (authDisabled()) {
    logger.warn(
      "[auth] REQUIRE_AUTH is disabled — /api/* is OPEN. Only acceptable in local dev.",
    );
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith("bearer ")) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }
    const token = header.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: "Empty bearer token" });
      return;
    }

    try {
      const { payload } = await jwtVerify<FirebaseClaims>(token, jwks, {
        issuer: ISSUER,
        audience: PROJECT_ID,
        algorithms: ["RS256"],
      });

      // Firebase-specific extra checks beyond standard JWT claims:
      // sub must equal user_id, auth_time must be in the past.
      if (!payload.sub || (payload.user_id && payload.user_id !== payload.sub)) {
        res.status(401).json({ error: "Invalid token: subject mismatch" });
        return;
      }
      const authTime =
        typeof payload.auth_time === "number" ? payload.auth_time : null;
      if (authTime != null && authTime * 1000 > Date.now()) {
        res.status(401).json({ error: "Invalid token: auth_time in future" });
        return;
      }

      req.user = {
        uid: payload.sub,
        email: payload.email ?? null,
        emailVerified: payload.email_verified === true,
        signInProvider: payload.firebase?.sign_in_provider ?? null,
      };
      next();
    } catch (e) {
      // jose throws subclasses of JOSEError, all with codes starting with
      // ERR_JW (ERR_JWS_INVALID, ERR_JWT_EXPIRED, ERR_JWT_CLAIM_VALIDATION_FAILED,
      // ERR_JWKS_NO_MATCHING_KEY, …). Anything else is a real bug.
      const code =
        e instanceof Error && "code" in e ? String((e as { code: unknown }).code) : "";
      if (code.startsWith("ERR_JW")) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      logger.error({ err: e }, "[auth] unexpected verify error");
      res.status(500).json({ error: "Auth verification failed" });
    }
  };
}

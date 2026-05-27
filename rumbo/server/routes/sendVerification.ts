/**
 * POST /api/auth/send-verification
 *
 * Sends a branded verification email to the signed-in user's address using
 * Resend, with a server-generated Firebase action link.
 *
 * Authenticated: yes — relies on the existing requireFirebaseAuth middleware
 * (mounted at /api/* in server.ts) to populate req.user. We look up the
 * email via Admin SDK rather than trusting the JWT's email claim, so a
 * stale token can't redirect a verification email to a different address.
 *
 * Rate limited: 5/hour/IP. Verification email send is expensive (deliverability
 * budget, Resend quota) and easy to abuse to spam someone else's inbox.
 *
 * Idempotent: each generated oobCode invalidates the previous one — calling
 * twice is safe, only the most recent link works.
 */
import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { adminAuth } from "../firebaseAdmin";
import { sendTransactionalEmail, EmailError } from "../email/resend";
import { renderVerifyEmail } from "../email/templates/verifyEmail";
import { logger } from "../logger";

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "https://rumbo.cl";

const verificationLimiter = rateLimit({
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  windowMs: 60 * 60_000,
  max: 5,
  message: { error: "Too many verification requests. Try again in an hour." },
});

export function mountVerificationRoute(app: Express) {
  app.post(
    "/api/auth/send-verification",
    verificationLimiter,
    async (req: Request, res: Response) => {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Not signed in" });
        return;
      }

      try {
        const auth = adminAuth();
        const record = await auth.getUser(user.uid);
        const email = record.email;
        if (!email) {
          res.status(400).json({ error: "Account has no email address" });
          return;
        }
        if (record.emailVerified) {
          res.json({ alreadyVerified: true });
          return;
        }

        const verifyUrl = await auth.generateEmailVerificationLink(email, {
          url: APP_PUBLIC_URL,
          handleCodeInApp: false,
        });

        const { subject, html, text } = renderVerifyEmail({
          name: record.displayName || "",
          verifyUrl,
        });

        await sendTransactionalEmail({ to: email, subject, html, text });
        logger.info({ uid: user.uid }, "[verify] sent");
        res.json({ ok: true });
      } catch (e) {
        if (e instanceof EmailError) {
          logger.error({ err: e }, "[verify] email send failed");
          res.status(502).json({ error: "Could not send verification email" });
          return;
        }
        logger.error({ err: e }, "[verify] failed");
        res.status(500).json({ error: "Verification request failed" });
      }
    },
  );
}

/**
 * Resend transactional email client.
 *
 * Why Resend: the Firebase default sender (noreply@<projectId>.firebaseapp.com)
 * lands in Gmail spam on a cold project ID with no domain alignment to
 * rumbo.cl. Resend lets us send from no-reply@rumbo.cl with DKIM/SPF/DMARC
 * aligned, which is what Gmail/Outlook/iCloud actually weigh.
 *
 * Domain auth must be verified in Resend's dashboard (DKIM + SPF DNS rows)
 * before mail leaves the platform.
 */
import { logger } from "../logger";

const RESEND_API = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export class EmailError extends Error {
  constructor(message: string, public readonly providerCode?: string) {
    super(message);
    this.name = "EmailError";
  }
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Rumbo <no-reply@rumbo.cl>";
  const replyTo = process.env.RESEND_REPLY_TO || undefined;

  if (!apiKey) {
    throw new EmailError("RESEND_API_KEY not configured", "no_api_key");
  }

  const body: Record<string, unknown> = {
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  };
  if (replyTo) body.reply_to = replyTo;

  const r = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    logger.error({ status: r.status, body: text.slice(0, 500) }, "[email] resend failed");
    throw new EmailError(`Resend ${r.status}: ${text.slice(0, 200)}`);
  }
}

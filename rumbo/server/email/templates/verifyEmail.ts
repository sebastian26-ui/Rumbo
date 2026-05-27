/**
 * Verification email template. Inline styles only — Gmail strips <style>
 * blocks intermittently, and Outlook ignores most CSS. Tables for layout
 * because Outlook still uses Word's renderer for HTML mail.
 */
export interface VerifyEmailInput {
  name: string;
  verifyUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND_BG = "#8DAEBD";
const BRAND_DARK = "#202F47";

export function renderVerifyEmail({ name, verifyUrl }: VerifyEmailInput): RenderedEmail {
  const safeName = escapeHtml(name?.trim() || "there");
  const safeUrl = escapeHtml(verifyUrl);
  const subject = "Verify your Rumbo account";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND_DARK};">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:0;">Click the button to verify your email and finish creating your Rumbo account.</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7f9;padding:40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:520px;width:100%;">
            <tr>
              <td style="padding:32px 40px 8px;">
                <div style="font-size:22px;font-weight:800;color:${BRAND_DARK};letter-spacing:-0.02em;">Rumbo</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 8px;">
                <h1 style="font-size:24px;font-weight:800;color:${BRAND_DARK};margin:0 0 12px;letter-spacing:-0.02em;line-height:1.25;">Verify your email</h1>
                <p style="font-size:16px;line-height:1.55;color:#475569;margin:0 0 24px;">
                  Hi ${safeName}, welcome to Rumbo. Click the button below to confirm your email and finish creating your account.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 40px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${BRAND_BG}" style="border-radius:14px;">
                  <a href="${safeUrl}"
                    style="display:inline-block;background:${BRAND_BG};color:#ffffff;font-weight:700;font-size:16px;text-decoration:none;padding:14px 28px;border-radius:14px;mso-padding-alt:0;">
                    Verify my email
                  </a>
                </td></tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 16px;">
                <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
                  Button not working? Paste this link into your browser:
                </p>
                <p style="font-size:13px;color:#475569;word-break:break-all;margin:6px 0 0;">
                  <a href="${safeUrl}" style="color:#3b6f87;text-decoration:underline;">${safeUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 32px;border-top:1px solid #eef1f4;">
                <p style="font-size:12px;color:#94a3b8;line-height:1.55;margin:0;">
                  If you didn&rsquo;t create a Rumbo account, you can safely ignore this email.
                  Need help? Just reply to this message.
                </p>
              </td>
            </tr>
          </table>
          <div style="font-size:12px;color:#94a3b8;margin-top:16px;">
            Rumbo &middot; Santiago, Chile &middot; <a href="https://rumbo.cl" style="color:#94a3b8;text-decoration:none;">rumbo.cl</a>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${name?.trim() || "there"},

Welcome to Rumbo. Verify your email to finish creating your account:

${verifyUrl}

If you didn't sign up, you can ignore this message.

— Rumbo
https://rumbo.cl`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

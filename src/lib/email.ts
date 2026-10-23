import "server-only";

type LunchLoopEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailResult = { sent: boolean; reason?: string };

const DEFAULT_ADMIN_EMAIL = "craig@lunchloop.app";

/**
 * Sends transactional mail only when Resend is configured. Keeping the API
 * key server-only means a browser can never send arbitrary mail through the
 * Lunch Loop account.
 */
export async function sendLunchLoopEmail(
  email: LunchLoopEmail,
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "Email delivery is not configured" };

  const from =
    process.env.RESEND_FROM_EMAIL ?? "Lunch Loop <invites@lunchloop.app>";
  const replyTo = process.env.RESEND_REPLY_TO ?? "feedback@lunchloop.app";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        reply_to: replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    if (!response.ok) return { sent: false, reason: "Email provider rejected the message" };
    return { sent: true };
  } catch {
    return { sent: false, reason: "Email provider could not be reached" };
  }
}

export async function notifyCraig(
  subject: string,
  details: string,
): Promise<EmailResult> {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL ?? DEFAULT_ADMIN_EMAIL;
  const safeDetails = escapeHtml(details).replace(/\n/g, "<br />");
  return sendLunchLoopEmail({
    to,
    subject: `Lunch Loop · ${subject}`,
    html: lunchLoopEmailDocument({
      heading: "Lunch Loop",
      bodyHtml: `<p style="margin:0">${safeDetails}</p>`,
      button: { href: "https://lunchloop.app/global-admin", label: "Open Global Admin" },
    }),
    text: `${details}\n\nOpen Global Admin: https://lunchloop.app/global-admin`,
  });
}

/**
 * Shared HTML shell for Lunch Loop mail. Pass already-escaped body HTML.
 * Button href must be escaped or a trusted literal.
 */
export function lunchLoopEmailDocument(parts: {
  heading: string;
  bodyHtml: string;
  button?: { href: string; label: string };
}) {
  const button = parts.button
    ? `<p style="margin:24px 0 0"><a href="${parts.button.href}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 18px;border-radius:12px;font-weight:800;font-size:16px;line-height:20px;text-decoration:none">${parts.button.label}</a></p>`
    : "";
  return `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:24px;background:#fff7ed"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ffedd5;border-radius:16px"><tr><td style="padding:28px 28px 0;font-family:Arial,Helvetica,sans-serif"><p style="margin:0;font-size:12px;font-weight:800;letter-spacing:0.16em;color:#9a3412">LUNCH LOOP</p><h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;color:#7c2d12">${parts.heading}</h1></td></tr><tr><td style="padding:16px 28px 28px;font-family:Arial,Helvetica,sans-serif;color:#292524;font-size:16px;line-height:1.5">${parts.bodyHtml}${button}</td></tr></table></body></html>`;
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

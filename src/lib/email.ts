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
    html: `<main style="font-family:Arial,sans-serif;color:#292524;line-height:1.5"><h1 style="color:#ea580c">Lunch Loop</h1><p>${safeDetails}</p><p><a href="https://lunchloop.app/global-admin">Open Global Admin</a></p></main>`,
    text: `${details}\n\nOpen Global Admin: https://lunchloop.app/global-admin`,
  });
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

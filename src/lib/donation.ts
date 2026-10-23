export const donationUrl = "https://donate.stripe.com/aFafZg58yg91fKIdyZ53O00";
export const donationLinkLabel = "Keep Lunch Loop running";
export const donationCopy = "Lunch Loop is free and ad-free. If it helped, you can chip in to keep it running.";

const shownPrefix = "lunch-loop-donation-prompt-at:";
const openKey = "lunch-loop-donation-prompt-open";
const quietMs = 14 * 24 * 60 * 60 * 1000;

export function donationPromptDue(lastShownAt: number | null, now: number) {
  if (lastShownAt === null) return true;
  return now - lastShownAt >= quietMs;
}

export function offerDonationPrompt(userId: string, now = Date.now()) {
  const raw = window.localStorage.getItem(shownPrefix + userId);
  const at = raw ? Number(raw) : Number.NaN;
  const lastShownAt = Number.isFinite(at) ? at : null;
  if (!donationPromptDue(lastShownAt, now)) return false;
  window.localStorage.setItem(shownPrefix + userId, String(now));
  window.sessionStorage.setItem(openKey, userId);
  window.dispatchEvent(new Event("lunch-loop-donation-prompt"));
  return true;
}

export function donationPromptOpenFor(userId: string) {
  return window.sessionStorage.getItem(openKey) === userId;
}

export function dismissDonationPrompt(userId: string) {
  if (window.sessionStorage.getItem(openKey) === userId) {
    window.sessionStorage.removeItem(openKey);
  }
}

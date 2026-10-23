const shownPrefix = "lunch-loop-feedback-prompt-at:";
const openKey = "lunch-loop-feedback-prompt-open";
const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

function shownAt(userId: string) {
  const raw = window.localStorage.getItem(shownPrefix + userId);
  const at = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(at) ? at : null;
}

export function offerFeedbackPrompt(userId: string) {
  const lastShown = shownAt(userId);
  if (lastShown !== null && Date.now() - lastShown < fourteenDaysMs) return false;
  window.localStorage.setItem(shownPrefix + userId, String(Date.now()));
  window.sessionStorage.setItem(openKey, userId);
  window.dispatchEvent(new Event("lunch-loop-feedback-prompt"));
  return true;
}

export function feedbackPromptOpenFor(userId: string) {
  return window.sessionStorage.getItem(openKey) === userId;
}

export function dismissFeedbackPrompt(userId: string) {
  if (window.sessionStorage.getItem(openKey) === userId) {
    window.sessionStorage.removeItem(openKey);
  }
}

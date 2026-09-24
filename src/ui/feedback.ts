/**
 * A25: where Done's feedback button sends a message. Track It has no server
 * (it is local-only by design), so the message goes through the user's own
 * mail app: the button opens a pre-addressed `mailto:` draft they send.
 */
export const FEEDBACK_EMAIL = 'serdiopedro@gmail.com';

/**
 * `encodeURIComponent`, not `URLSearchParams`: the latter writes spaces as
 * `+`, which several mail apps show literally in the draft.
 */
export function feedbackMailto(message: string, app: { version: string; platform: string }): string {
  const subject = `Track It feedback (v${app.version})`;
  const body = `${message.trim()}\n\n—\nTrack It ${app.version} · ${app.platform}`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

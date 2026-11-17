/**
 * Best-effort scrubbing of personal / secret data in recorded API responses.
 * This is a first pass, not a guarantee: review fixtures (git diff) before committing,
 * and extend SENSITIVE_KEYS for anything app-specific (customer names, site addresses, meter IDs…).
 */
const SENSITIVE_KEYS =
  /^(e-?mail|email_?address|phone|phone_?number|mobile|password|passwd|secret|token|access_?token|refresh_?token|id_?token|api_?key|authorization|cookie|session(_?id)?|address|street|first_?name|last_?name|full_?name|user_?name|display_?name|owner_?name|dob|date_?of_?birth|pan|aadhaar|ip_?address)$/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;

export function sanitize(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((v) => sanitize(v));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k)]));
  }
  if (key && SENSITIVE_KEYS.test(key) && value !== null) {
    if (typeof value === 'string') return `redacted-${key}`;
    if (typeof value === 'number') return 0;
  }
  if (typeof value === 'string') return value.replace(EMAIL, 'user@example.com').replace(JWT, 'redacted.jwt.token');
  return value;
}

/** Same scrubbing for URLs stored in manifests (query params like ?email=…). */
export function sanitizeUrl(url: string): string {
  const u = new URL(url);
  for (const [k] of [...u.searchParams]) if (SENSITIVE_KEYS.test(k)) u.searchParams.set(k, 'redacted');
  return u.toString().replace(EMAIL, 'user@example.com').replace(JWT, 'redacted.jwt.token');
}

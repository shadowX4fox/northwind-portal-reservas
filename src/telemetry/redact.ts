// ADR-004: los logs nunca incluyen tokens ni datos personales completos.

const SENSITIVE_KEY = /token|authorization|secret|password|code_verifier|email|name|subject/i;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;

export const REDACTED = '[REDACTED]';

export function redactText(text: string): string {
  return text.replace(BEARER, `Bearer ${REDACTED}`).replace(JWT, REDACTED);
}

export function redact(attributes: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue;
    if (SENSITIVE_KEY.test(key)) out[key] = REDACTED;
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else out[key] = redactText(String(value));
  }
  return out;
}

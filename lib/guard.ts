/**
 * Input/output guards: prompt-injection detection for untrusted documents,
 * PII masking for anything that leaves the server or enters the audit log.
 */

const INJECTION_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "ignore-instructions", re: /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(instructions|rules|policy|policies|prompt)\b/i },
  { id: "role-override", re: /\b(you are now|act as|pretend to be|new instructions)\b/i },
  { id: "system-tag", re: /(^|\n)\s*(system|assistant)\s*:|<\/?\s*(system|instructions?)\s*>/i },
  { id: "skip-confirmation", re: /\b(skip|bypass|without|no need for)\b[^.\n]{0,30}\b(confirm\w*|approv\w*|verification|limits?|checks?)\b/i },
  { id: "pre-approved-claim", re: /\b(pre-?approved|already (verified|approved)|whitelisted)\b/i },
  { id: "address-to-ai", re: /\b(note|message|instruction)s?\s+(to|for)\s+(the\s+)?(ai|assistant|agent|bot|llm)\b/i },
  { id: "urgency-pay", re: /\b(pay|transfer|send)\b[^.\n]{0,20}\b(immediately|right now|urgently|asap)\b/i }
];

export interface ScanResult {
  flagged: boolean;
  matches: string[];
}

export function scanUntrusted(text: string): ScanResult {
  const matches = INJECTION_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.id);
  return { flagged: matches.length > 0, matches };
}

/** Wrap untrusted text so the model sees an explicit data boundary. */
export function wrapUntrusted(source: string, text: string): string {
  const safe = text.replace(/<\/?untrusted[^>]*>/gi, "");
  return `<untrusted source="${source}">\n${safe}\n</untrusted>`;
}

/** Mask long digit runs (account / card numbers) and e-mail local parts. */
export function maskPII(input: string): string {
  return input
    .replace(/\b(?:\d[ -]?){8,}\d\b/g, (m) => {
      const digits = m.replace(/\D/g, "");
      return `••••${digits.slice(-4)}`;
    })
    .replace(/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, "$1•••@$2");
}

export function maskAccount(account: string): string {
  const digits = account.replace(/\D/g, "");
  return `••••${digits.slice(-4)}`;
}

export const MAX_USER_MESSAGE = 1500;

export function sanitizeUserMessage(text: unknown): string {
  if (typeof text !== "string") return "";
  // strip control chars except newlines/tabs, cap length
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, MAX_USER_MESSAGE).trim();
}

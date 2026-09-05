/**
 * Every external data/AI provider returns one of these — never a best-guess value.
 * See ENGINEERING_STANDARDS.md: no fake data, no silent fallbacks.
 */
export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "NOT_CONFIGURED" | "REQUEST_FAILED"; detail: string };

export function notConfigured<T>(detail: string): ProviderResult<T> {
  return { ok: false, reason: "NOT_CONFIGURED", detail };
}

export function requestFailed<T>(detail: string): ProviderResult<T> {
  return { ok: false, reason: "REQUEST_FAILED", detail };
}

export function ok<T>(data: T): ProviderResult<T> {
  return { ok: true, data };
}

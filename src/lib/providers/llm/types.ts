import type { ProviderResult } from "../types";

/**
 * V1 only ever runs "openai". This union — and the registry in index.ts — is the seam V2/V3
 * agents route through: adding Anthropic/Claude or another model for a specific agent task
 * means adding one factory here and one entry in the registry, not rewriting task logic.
 */
export type LlmProviderId = "openai";

export interface LlmCallResult {
  raw: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface LlmClient {
  readonly providerId: LlmProviderId;
  completeJson(prompt: string): Promise<ProviderResult<LlmCallResult>>;
}

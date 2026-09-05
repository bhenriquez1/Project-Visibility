import type { ProviderResult } from "../types";

export type LlmProviderId = "openai" | "anthropic";

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

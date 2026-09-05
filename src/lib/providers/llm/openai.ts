import OpenAI from "openai";
import { ok, requestFailed } from "../types";
import type { ProviderResult } from "../types";
import { costCentsFor } from "@/lib/aiPricing";
import type { LlmCallResult, LlmClient } from "./types";

class OpenAiClient implements LlmClient {
  readonly providerId = "openai" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async completeJson(prompt: string): Promise<ProviderResult<LlmCallResult>> {
    try {
      const client = new OpenAI({ apiKey: this.apiKey });
      const completion = await client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) return requestFailed("OpenAI returned an empty response.");

      const inputTokens = completion.usage?.prompt_tokens ?? 0;
      const outputTokens = completion.usage?.completion_tokens ?? 0;
      const pricing = costCentsFor("openai", this.model, inputTokens, outputTokens);
      if (!pricing.ok) return requestFailed(pricing.detail);

      return ok({ raw, model: this.model, inputTokens, outputTokens, costCents: pricing.costCents });
    } catch (err) {
      return requestFailed(err instanceof Error ? err.message : "OpenAI request failed.");
    }
  }
}

export function createOpenAiClient(): LlmClient | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  return new OpenAiClient(apiKey, model);
}

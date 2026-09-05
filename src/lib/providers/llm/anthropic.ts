import { costCentsFor } from "@/lib/aiPricing";
import { ok, requestFailed, type ProviderResult } from "../types";
import type { LlmCallResult, LlmClient } from "./types";

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: { message?: string };
}

class AnthropicClient implements LlmClient {
  readonly providerId = "anthropic" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async completeJson(prompt: string): Promise<ProviderResult<LlmCallResult>> {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2048,
          system: "Return only the valid JSON object requested by the user, with no markdown fences or commentary.",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = (await response.json()) as AnthropicMessageResponse;
      if (!response.ok) {
        return requestFailed(data.error?.message || `Anthropic request failed with status ${response.status}.`);
      }

      const responseText = data.content
        ?.filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("")
        .trim();
      if (!responseText) return requestFailed("Anthropic returned an empty response.");

      // Claude can occasionally fence JSON even when asked not to. Normalize only a complete
      // outer JSON fence; shape validation still happens in the shared provider layer.
      const raw = responseText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      const inputTokens = data.usage?.input_tokens ?? 0;
      const outputTokens = data.usage?.output_tokens ?? 0;
      const model = data.model || this.model;
      const pricing = costCentsFor("anthropic", model, inputTokens, outputTokens);
      if (!pricing.ok) return requestFailed(pricing.detail);

      return ok({ raw, model, inputTokens, outputTokens, costCents: pricing.costCents });
    } catch (error) {
      return requestFailed(error instanceof Error ? error.message : "Anthropic request failed.");
    }
  }
}

export function createAnthropicClient(): LlmClient | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  return new AnthropicClient(apiKey, model);
}

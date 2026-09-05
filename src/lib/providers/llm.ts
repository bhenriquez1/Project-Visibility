import OpenAI from "openai";
import { z } from "zod";
import { notConfigured, ok, requestFailed, type ProviderResult } from "./types";
import { costCentsFor } from "@/lib/aiPricing";
import type { WebsiteSignals } from "./website";
import type { PlaceSignals } from "./places";
import type { SerpSignals } from "./serp";

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function getModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export interface AiCallMeta {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

const scoreSchema = z.number().int().min(0).max(100).nullable();

const auditReasoningSchema = z.object({
  visibilityScore: scoreSchema,
  profileScore: scoreSchema,
  reputationScore: scoreSchema,
  websiteSeoScore: scoreSchema,
  competitorGapScore: scoreSchema,
  conversionScore: scoreSchema,
  narrative: z.string(),
});

export type AuditReasoningOutput = z.infer<typeof auditReasoningSchema> & { meta: AiCallMeta };

export interface AuditReasoningInput {
  businessName: string;
  city: string;
  website: WebsiteSignals | null;
  place: PlaceSignals | null;
  serp: SerpSignals | null;
  unavailableSources: string[];
}

export async function generateAuditReasoning(
  input: AuditReasoningInput
): Promise<ProviderResult<AuditReasoningOutput>> {
  const client = getClient();
  if (!client) return notConfigured("OPENAI_API_KEY is not set.");

  const model = getModel();

  const prompt = `You are auditing the local online visibility of "${input.businessName}" in ${input.city}.

Score ONLY the dimensions where real data is provided below (0-100, higher is better). For any
dimension whose underlying data source is listed as unavailable, you MUST return null — never
estimate or guess a score for missing data.

Unavailable data sources: ${input.unavailableSources.length ? input.unavailableSources.join(", ") : "none"}

Website signals (on-page SEO): ${input.website ? JSON.stringify(input.website) : "NOT AVAILABLE"}
Google Places signals (profile completeness + reputation): ${input.place ? JSON.stringify(input.place) : "NOT AVAILABLE"}
Search visibility signals (local pack + competitors): ${input.serp ? JSON.stringify(input.serp) : "NOT AVAILABLE"}

Score guidance:
- visibilityScore: derived from serp signals (local pack presence/position).
- profileScore: derived from place signals (completeness of listing — hours, photos, category, website).
- reputationScore: derived from place signals (rating, review count).
- websiteSeoScore: derived from website signals (title, meta description, schema markup, mobile viewport, https).
- competitorGapScore: derived from serp signals compared against place signals — how the business stacks up against what's ranking.
- conversionScore: derived from website signals — presence of clear contact info, calls to action, mobile-friendliness proxies.

Never imply or promise a specific Google search ranking. Write "narrative" as 3-4 sentences: a
plain-language summary and the top 2-3 concrete opportunities, grounded only in the data given.

Respond with JSON matching this exact shape:
{"visibilityScore": number|null, "profileScore": number|null, "reputationScore": number|null, "websiteSeoScore": number|null, "competitorGapScore": number|null, "conversionScore": number|null, "narrative": string}`;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return requestFailed("OpenAI returned an empty response.");

    const parsed = auditReasoningSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return requestFailed(`OpenAI response didn't match the expected shape: ${parsed.error.message}`);
    }

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    const pricing = costCentsFor(model, inputTokens, outputTokens);
    if (!pricing.ok) return requestFailed(pricing.detail);

    return ok({
      ...parsed.data,
      meta: { model, inputTokens, outputTokens, costCents: pricing.costCents },
    });
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "OpenAI request failed.");
  }
}

const draftSchema = z.object({ subject: z.string(), body: z.string() });
export type DraftOutput = z.infer<typeof draftSchema> & { meta: AiCallMeta };

export async function generateOutreachDraft(input: {
  businessName: string;
  contactEmail: string;
  auditNarrative: string;
  founderName?: string;
}): Promise<ProviderResult<DraftOutput>> {
  const client = getClient();
  if (!client) return notConfigured("OPENAI_API_KEY is not set.");
  const model = getModel();

  const prompt = `Write a short, specific, non-salesy cold email to "${input.businessName}" offering
the free local-visibility audit findings below as a conversation starter. Sign off as ${input.founderName ?? "Brian"}
from Local Visibility AI. No hype, no fake urgency, no guaranteed ranking claims. Reference at
least one concrete finding from the audit narrative. Keep the body under 150 words.

Audit narrative: ${input.auditNarrative}

Respond with JSON: {"subject": string, "body": string}`;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return requestFailed("OpenAI returned an empty response.");

    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return requestFailed(`OpenAI response didn't match the expected shape: ${parsed.error.message}`);
    }

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    const pricing = costCentsFor(model, inputTokens, outputTokens);
    if (!pricing.ok) return requestFailed(pricing.detail);

    return ok({ ...parsed.data, meta: { model, inputTokens, outputTokens, costCents: pricing.costCents } });
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "OpenAI request failed.");
  }
}

export async function generateReplyDraft(input: {
  businessName: string;
  conversationSoFar: { direction: "OUTBOUND" | "INBOUND"; body: string }[];
}): Promise<ProviderResult<DraftOutput>> {
  const client = getClient();
  if (!client) return notConfigured("OPENAI_API_KEY is not set.");
  const model = getModel();

  const thread = input.conversationSoFar
    .map((m) => `${m.direction === "OUTBOUND" ? "Us" : input.businessName}: ${m.body}`)
    .join("\n\n");

  const prompt = `Continue this email conversation with "${input.businessName}" naturally, addressing
their most recent message. No hype, no fake urgency, no guaranteed ranking claims. Keep it under
120 words.

${thread}

Respond with JSON: {"subject": string, "body": string}`;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return requestFailed("OpenAI returned an empty response.");

    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return requestFailed(`OpenAI response didn't match the expected shape: ${parsed.error.message}`);
    }

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    const pricing = costCentsFor(model, inputTokens, outputTokens);
    if (!pricing.ok) return requestFailed(pricing.detail);

    return ok({ ...parsed.data, meta: { model, inputTokens, outputTokens, costCents: pricing.costCents } });
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "OpenAI request failed.");
  }
}

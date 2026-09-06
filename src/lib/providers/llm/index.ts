import { z } from "zod";
import { notConfigured, ok, requestFailed, type ProviderResult } from "../types";
import { createAnthropicClient } from "./anthropic";
import { createOpenAiClient } from "./openai";
import type { LlmClient, LlmProviderId } from "./types";
import type { WebsiteSignals } from "../website";
import type { PlaceSignals } from "../places";
import type { SerpSignals } from "../serp";

/**
 * Provider registry — the seam V2/V3 route through. Adding a provider (e.g. Anthropic for a
 * specific agent task) means adding one factory here, not touching the task functions below.
 */
const REGISTRY: Record<LlmProviderId, () => LlmClient | null> = {
  openai: createOpenAiClient,
  anthropic: createAnthropicClient,
};

function configuredClient(): { client: LlmClient | null; detail: string } {
  const configured = (process.env.AI_PROVIDER || "openai").trim().toLowerCase();
  if (configured !== "openai" && configured !== "anthropic") {
    return {
      client: null,
      detail: `AI_PROVIDER must be "openai" or "anthropic"; received "${configured}".`,
    };
  }

  const providerId: LlmProviderId = configured;
  return {
    client: REGISTRY[providerId](),
    detail: `${providerId === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} is not set.`,
  };
}

export interface AiCallMeta {
  provider: LlmProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

async function completeAndParse<T>(
  client: LlmClient,
  prompt: string,
  schema: z.ZodType<T>
): Promise<ProviderResult<T & { meta: AiCallMeta }>> {
  const result = await client.completeJson(prompt);
  if (!result.ok) return result;

  function parse(raw: string): { success: true; data: T } | { success: false; detail: string } {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { success: false, detail: "invalid JSON" };
    }

    const parsed = schema.safeParse(json);
    return parsed.success
      ? { success: true, data: parsed.data }
      : { success: false, detail: parsed.error.message };
  }

  const initial = parse(result.data.raw);
  if (!initial.success) {
    // One repair attempt only. It receives the original evidence and the exact validation
    // failure, but is explicitly forbidden from inventing missing evidence or scores.
    const repair = await client.completeJson(`The prior response failed strict schema validation.

Original request and evidence:
${prompt}

Invalid response:
${result.data.raw}

Validation failure:
${initial.detail}

Return one corrected JSON object matching the original contract. Preserve the original evidence.
Do not invent facts or scores. A score may be null only where the original request says its data
source is unavailable. Return JSON only.`);

    if (!repair.ok) {
      return requestFailed(
        `${client.providerId} response didn't match the expected shape; controlled repair failed: ${repair.detail}`
      );
    }

    const repaired = parse(repair.data.raw);
    if (!repaired.success) {
      return requestFailed(
        `${client.providerId} response didn't match the expected shape after one controlled repair: ${repaired.detail}`
      );
    }

    return ok({
      ...repaired.data,
      meta: {
        provider: client.providerId,
        model: repair.data.model,
        inputTokens: result.data.inputTokens + repair.data.inputTokens,
        outputTokens: result.data.outputTokens + repair.data.outputTokens,
        costCents: result.data.costCents + repair.data.costCents,
      },
    });
  }

  return ok({
    ...initial.data,
    meta: {
      provider: client.providerId,
      model: result.data.model,
      inputTokens: result.data.inputTokens,
      outputTokens: result.data.outputTokens,
      costCents: result.data.costCents,
    },
  });
}

const numericScoreSchema = z.number().int().min(0).max(100);

function scoreSchema(sourceAvailable: boolean) {
  return sourceAvailable ? numericScoreSchema : z.null();
}

export interface AuditReasoningInput {
  businessName: string;
  city: string;
  website: WebsiteSignals | null;
  place: PlaceSignals | null;
  serp: SerpSignals | null;
  unavailableSources: string[];
}

function auditReasoningSchema(input: AuditReasoningInput) {
  return z.object({
    visibilityScore: scoreSchema(Boolean(input.serp)),
    profileScore: scoreSchema(Boolean(input.place)),
    reputationScore: scoreSchema(Boolean(input.place)),
    websiteSeoScore: scoreSchema(Boolean(input.website)),
    competitorGapScore: scoreSchema(Boolean(input.serp && input.place)),
    conversionScore: scoreSchema(Boolean(input.website)),
    narrative: z.string().min(1),
  }).strict();
}

export type AuditReasoningOutput = {
  visibilityScore: number | null;
  profileScore: number | null;
  reputationScore: number | null;
  websiteSeoScore: number | null;
  competitorGapScore: number | null;
  conversionScore: number | null;
  narrative: string;
  meta: AiCallMeta;
};

export async function generateAuditReasoning(
  input: AuditReasoningInput
): Promise<ProviderResult<AuditReasoningOutput>> {
  const { client, detail } = configuredClient();
  if (!client) return notConfigured(detail);

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

  return completeAndParse(client, prompt, auditReasoningSchema(input));
}

const draftSchema = z.object({ subject: z.string(), body: z.string() });
export type DraftOutput = z.infer<typeof draftSchema> & { meta: AiCallMeta };

export async function generateOutreachDraft(input: {
  businessName: string;
  contactEmail: string;
  auditNarrative: string;
  founderName?: string;
}): Promise<ProviderResult<DraftOutput>> {
  const { client, detail } = configuredClient();
  if (!client) return notConfigured(detail);

  const prompt = `Write a short, specific, non-salesy cold email to "${input.businessName}" offering
the free local-visibility audit findings below as a conversation starter. Sign off as ${input.founderName ?? "Brian"}
from Local Visibility AI. No hype, no fake urgency, no guaranteed ranking claims. Reference at
least one concrete finding from the audit narrative. Keep the body under 150 words.

Audit narrative: ${input.auditNarrative}

Respond with JSON: {"subject": string, "body": string}`;

  return completeAndParse(client, prompt, draftSchema);
}

export async function generateReplyDraft(input: {
  businessName: string;
  conversationSoFar: { direction: "OUTBOUND" | "INBOUND"; body: string }[];
}): Promise<ProviderResult<DraftOutput>> {
  const { client, detail } = configuredClient();
  if (!client) return notConfigured(detail);

  const thread = input.conversationSoFar
    .map((m) => `${m.direction === "OUTBOUND" ? "Us" : input.businessName}: ${m.body}`)
    .join("\n\n");

  const prompt = `Continue this email conversation with "${input.businessName}" naturally, addressing
their most recent message. No hype, no fake urgency, no guaranteed ranking claims. Keep it under
120 words.

${thread}

Respond with JSON: {"subject": string, "body": string}`;

  return completeAndParse(client, prompt, draftSchema);
}

export async function generateOnboardingNudge(input: {
  businessName: string;
  missing: "gbp_connection" | "objectives";
}): Promise<ProviderResult<DraftOutput>> {
  const { client, detail } = configuredClient();
  if (!client) return notConfigured(detail);

  const prompt =
    input.missing === "gbp_connection"
      ? `Write a short, friendly onboarding email to our new customer "${input.businessName}"
prompting them to sign in at their customer portal and connect their Google Business Profile —
that's what unlocks review syncing and reply drafts. No hype, no fake urgency. Keep it under
100 words.

Respond with JSON: {"subject": string, "body": string}`
      : `Write a short, friendly onboarding email to our new customer "${input.businessName}"
asking what their main goals are for working with us (e.g. more calls, more foot traffic, better
reviews) so we can focus on what matters to them. No hype, no fake urgency. Keep it under 100
words.

Respond with JSON: {"subject": string, "body": string}`;

  return completeAndParse(client, prompt, draftSchema);
}

export async function generateGrowthRecommendations(input: {
  businessName: string;
  opportunities: string[];
}): Promise<ProviderResult<DraftOutput>> {
  const { client, detail } = configuredClient();
  if (!client) return notConfigured(detail);

  const prompt = `Write a short, specific email to our customer "${input.businessName}" pointing
out concrete opportunities we noticed in their latest visibility audit, grounded only in the
list below — don't invent anything beyond it. No hype, no fake urgency, no guaranteed ranking
claims. These are areas to work on, not promises. Keep the body under 150 words.

Opportunities noticed: ${input.opportunities.join("; ")}

Respond with JSON: {"subject": string, "body": string}`;

  return completeAndParse(client, prompt, draftSchema);
}

const reviewReplySchema = z.object({ reply: z.string() });
export type ReviewReplyOutput = z.infer<typeof reviewReplySchema> & { meta: AiCallMeta };

export async function generateReviewReplyDraft(input: {
  businessName: string;
  reviewerName: string | null;
  starRating: number | null;
  reviewComment: string | null;
}): Promise<ProviderResult<ReviewReplyOutput>> {
  const { client, detail } = configuredClient();
  if (!client) return notConfigured(detail);

  const prompt = `Draft a short, genuine reply from "${input.businessName}" to this Google review.
Match the tone to the rating — grateful for positive reviews, calm and solution-oriented for
negative ones, never defensive or dismissive. No generic corporate language. Keep it under 80
words. Never make promises the business hasn't asked to make.

Reviewer: ${input.reviewerName ?? "Anonymous"}
Rating: ${input.starRating ?? "unknown"}/5
Review: ${input.reviewComment ?? "(no comment text)"}

Respond with JSON: {"reply": string}`;

  return completeAndParse(client, prompt, reviewReplySchema);
}

const answerSchema = z.object({ answer: z.string() });
export type AnswerOutput = z.infer<typeof answerSchema> & { meta: AiCallMeta };

/**
 * "Ask your AI Growth Manager" — grounded Q&A only. This must never be given the ability to
 * take actions; it answers questions about the customer's own data and nothing else. Adding
 * tool-calling/execution here would cross into V3 autonomy — don't.
 */
export async function answerGrowthManagerQuestion(input: {
  businessName: string;
  question: string;
  auditNarrative: string | null;
  reviewSummary: string;
}): Promise<ProviderResult<AnswerOutput>> {
  const { client, detail } = configuredClient();
  if (!client) return notConfigured(detail);

  const prompt = `You are a growth advisor answering one question for "${input.businessName}"
based only on the data below. If the data doesn't cover what they're asking, say so plainly
rather than guessing. Never promise a specific Google ranking. You can only answer questions —
you cannot take any action on their behalf.

Latest audit summary: ${input.auditNarrative ?? "No completed audit yet."}
Review summary: ${input.reviewSummary}

Question: ${input.question}

Respond with JSON: {"answer": string}`;

  return completeAndParse(client, prompt, answerSchema);
}

export async function generateRetentionOutreach(input: {
  businessName: string;
  reasons: string[];
}): Promise<ProviderResult<DraftOutput>> {
  const { client, detail } = configuredClient();
  if (!client) return notConfigured(detail);

  const prompt = `Write a short, genuine check-in email to our customer "${input.businessName}".
This is a relationship check-in, not a sales pitch — the goal is to see how things are going and
offer help, grounded only in the real observations below. Never use alarming language like
"at risk" or imply their account is in jeopardy. Never offer a discount, refund, or any other
promise we haven't authorized. No hype, no fake urgency. Keep the body under 130 words.

Observations: ${input.reasons.join("; ")}

Respond with JSON: {"subject": string, "body": string}`;

  return completeAndParse(client, prompt, draftSchema);
}

const analyticsDigestSchema = z.object({ narrative: z.string() });
export type AnalyticsDigestOutput = z.infer<typeof analyticsDigestSchema> & { meta: AiCallMeta };

/**
 * Turns computeEconomics()'s real numbers into a plain-language summary for Brian — same
 * narrative-from-structured-data shape as generateAuditReasoning, but every figure here is
 * already computed (never estimated), so the prompt only asks for phrasing, not scoring.
 */
export async function generateAnalyticsDigest(input: {
  mrrCents: number;
  arrCents: number;
  activeCustomerCount: number;
  churnRate: number | null;
  grossMarginPct: number | null;
  conversionRatePct: number | null;
  newCustomersLast7Days: number;
}): Promise<ProviderResult<AnalyticsDigestOutput>> {
  const { client, detail } = configuredClient();
  if (!client) return notConfigured(detail);

  const prompt = `Summarize the current state of a small local-business SaaS business in 2-4
plain-language sentences for the owner, grounded only in the real numbers below — never invent,
estimate, or round in a misleading direction. If a figure is null, say there isn't enough data
for it yet rather than guessing.

MRR: $${(input.mrrCents / 100).toFixed(2)}
ARR: $${(input.arrCents / 100).toFixed(2)}
Active customers: ${input.activeCustomerCount}
Churn rate: ${input.churnRate === null ? "not enough data" : `${(input.churnRate * 100).toFixed(1)}%`}
Gross margin: ${input.grossMarginPct === null ? "not enough data" : `${input.grossMarginPct.toFixed(1)}%`}
Prospect-to-customer conversion rate: ${input.conversionRatePct === null ? "not enough data" : `${input.conversionRatePct.toFixed(1)}%`}
New customers in the last 7 days: ${input.newCustomersLast7Days}

Respond with JSON: {"narrative": string}`;

  return completeAndParse(client, prompt, analyticsDigestSchema);
}

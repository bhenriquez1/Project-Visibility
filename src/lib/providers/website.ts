import * as cheerio from "cheerio";
import { ok, requestFailed, type ProviderResult } from "./types";

export interface PageSignal {
  url: string;
  statusCode: number;
  title: string | null;
  metaDescription: string | null;
  hasViewportTag: boolean;
  h1Count: number;
  hasLocalBusinessSchema: boolean;
  wordCount: number;
}

export interface WebsiteSignals extends PageSignal {
  finalUrl: string;
  isHttps: boolean;
  // Beyond the primary page above: a bounded crawl of same-origin internal links, so the audit
  // isn't blind to everything except whichever single URL Google Places happened to return.
  additionalPages: PageSignal[];
  pagesCrawled: number; // 1 (primary) + additionalPages.length
  pagesFailed: number; // secondary pages that errored/timed out — skipped, not fatal to the result
}

const MAX_CRAWL_PAGES = 4;
const LINK_PRIORITY_KEYWORDS = ["service", "about", "contact", "location", "pricing"];

interface FetchedPage {
  html: string;
  finalUrl: string;
  statusCode: number;
}

async function fetchHtml(url: string): Promise<ProviderResult<FetchedPage>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "LocalVisibilityAI-AuditBot/1.0" },
    });
    return ok({ html: await res.text(), finalUrl: res.url, statusCode: res.status });
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "Failed to fetch the page.");
  } finally {
    clearTimeout(timeout);
  }
}

function extractSignals(html: string, url: string, statusCode: number): PageSignal {
  const $ = cheerio.load(html);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const jsonLdBlocks = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).text())
    .get();

  const hasLocalBusinessSchema = jsonLdBlocks.some((block) => {
    try {
      const parsed = JSON.parse(block);
      const types = Array.isArray(parsed) ? parsed : [parsed];
      return types.some((entry) =>
        JSON.stringify(entry["@type"] ?? "").toLowerCase().includes("localbusiness")
      );
    } catch {
      return false;
    }
  });

  return {
    url,
    statusCode,
    title: $("title").first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr("content")?.trim() || null,
    hasViewportTag: $('meta[name="viewport"]').length > 0,
    h1Count: $("h1").length,
    hasLocalBusinessSchema,
    wordCount: bodyText.split(" ").filter(Boolean).length,
  };
}

/** Same-origin internal links from the primary page, deduped and prioritized by keyword. */
function selectCrawlCandidates(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const seen = new Set<string>([base.toString()]);
  const candidates: { url: string; priority: boolean }[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) return;
    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      return;
    }
    resolved.hash = "";
    if (resolved.hostname !== base.hostname) return;
    const normalized = resolved.toString();
    if (seen.has(normalized)) return;
    seen.add(normalized);

    const linkText = $(el).text().toLowerCase();
    const priority = LINK_PRIORITY_KEYWORDS.some(
      (keyword) => normalized.toLowerCase().includes(keyword) || linkText.includes(keyword)
    );
    candidates.push({ url: normalized, priority });
  });

  candidates.sort((a, b) => Number(b.priority) - Number(a.priority));
  return candidates.slice(0, MAX_CRAWL_PAGES).map((c) => c.url);
}

/**
 * Fetches the prospect's own website and extracts on-page SEO signals directly — no API key
 * required, so this provider is always "configured." It can still fail (site down, timeout,
 * blocked), and that failure is surfaced rather than papered over. Crawls a bounded set of
 * same-origin internal links alongside the primary page so the audit isn't blind to everything
 * except whichever single URL Google Places happened to return (often a deep service page, not
 * the homepage). A secondary page failing is skipped, not fatal — only the primary page's
 * failure fails the whole result, same as before this crawl was added.
 */
export async function analyzeWebsite(rawUrl: string): Promise<ProviderResult<WebsiteSignals>> {
  let url: URL;
  try {
    url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    return requestFailed(`"${rawUrl}" is not a valid URL.`);
  }

  const primary = await fetchHtml(url.toString());
  if (!primary.ok) return primary;

  const primarySignals = extractSignals(primary.data.html, primary.data.finalUrl, primary.data.statusCode);
  const crawlCandidates = selectCrawlCandidates(primary.data.html, primary.data.finalUrl);

  const secondaryResults = await Promise.allSettled(
    crawlCandidates.map(async (candidateUrl) => {
      const fetched = await fetchHtml(candidateUrl);
      if (!fetched.ok) throw new Error(fetched.detail);
      return extractSignals(fetched.data.html, fetched.data.finalUrl, fetched.data.statusCode);
    })
  );

  const additionalPages = secondaryResults
    .filter((r): r is PromiseFulfilledResult<PageSignal> => r.status === "fulfilled")
    .map((r) => r.value);
  const pagesFailed = secondaryResults.length - additionalPages.length;

  return ok({
    ...primarySignals,
    finalUrl: primary.data.finalUrl,
    isHttps: primary.data.finalUrl.startsWith("https://"),
    additionalPages,
    pagesCrawled: 1 + additionalPages.length,
    pagesFailed,
  });
}

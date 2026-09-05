import * as cheerio from "cheerio";
import { ok, requestFailed, type ProviderResult } from "./types";

export interface WebsiteSignals {
  finalUrl: string;
  isHttps: boolean;
  statusCode: number;
  title: string | null;
  metaDescription: string | null;
  hasViewportTag: boolean;
  h1Count: number;
  hasLocalBusinessSchema: boolean;
  wordCount: number;
}

/**
 * Fetches the prospect's own website and extracts on-page SEO signals directly — no API key
 * required, so this provider is always "configured." It can still fail (site down, timeout,
 * blocked), and that failure is surfaced rather than papered over.
 */
export async function analyzeWebsite(rawUrl: string): Promise<ProviderResult<WebsiteSignals>> {
  let url: URL;
  try {
    url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    return requestFailed(`"${rawUrl}" is not a valid URL.`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "LocalVisibilityAI-AuditBot/1.0" },
    });

    const html = await res.text();
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

    return ok({
      finalUrl: res.url,
      isHttps: res.url.startsWith("https://"),
      statusCode: res.status,
      title: $("title").first().text().trim() || null,
      metaDescription: $('meta[name="description"]').attr("content")?.trim() || null,
      hasViewportTag: $('meta[name="viewport"]').length > 0,
      h1Count: $("h1").length,
      hasLocalBusinessSchema,
      wordCount: bodyText.split(" ").filter(Boolean).length,
    });
  } catch (err) {
    return requestFailed(
      err instanceof Error ? err.message : "Failed to fetch the website."
    );
  } finally {
    clearTimeout(timeout);
  }
}

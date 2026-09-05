import { notConfigured, ok, requestFailed, type ProviderResult } from "./types";

export interface LocalPackEntry {
  position: number;
  title: string;
  rating: number | null;
  reviews: number | null;
  type: string | null;
}

export interface SerpSignals {
  query: string;
  localPack: LocalPackEntry[];
  organicTop10Domains: string[];
}

/**
 * Search visibility + competitor discovery via SerpAPI. Swappable: if you later prefer
 * DataForSEO or another SERP provider, implement the same searchLocalVisibility signature
 * here — nothing else in the audit pipeline needs to change.
 */
export async function searchLocalVisibility(
  query: string
): Promise<ProviderResult<SerpSignals>> {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    return notConfigured("SERP_API_KEY is not set.");
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      return requestFailed(`SerpAPI returned ${res.status}: ${body}`);
    }

    const json = (await res.json()) as {
      local_results?: {
        places?: Array<{
          position: number;
          title: string;
          rating?: number;
          reviews?: number;
          type?: string;
        }>;
      };
      organic_results?: Array<{ link?: string }>;
    };

    const localPack: LocalPackEntry[] =
      json.local_results?.places?.map((p) => ({
        position: p.position,
        title: p.title,
        rating: p.rating ?? null,
        reviews: p.reviews ?? null,
        type: p.type ?? null,
      })) ?? [];

    const organicTop10Domains = (json.organic_results ?? [])
      .slice(0, 10)
      .map((r) => {
        try {
          return r.link ? new URL(r.link).hostname : null;
        } catch {
          return null;
        }
      })
      .filter((d): d is string => Boolean(d));

    return ok({ query, localPack, organicTop10Domains });
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "SerpAPI request failed.");
  }
}

import { notConfigured, ok, requestFailed, type ProviderResult } from "./types";

export interface PlaceSignals {
  placeId: string;
  displayName: string;
  rating: number | null;
  userRatingCount: number | null;
  primaryType: string | null;
  formattedAddress: string | null;
  websiteUri: string | null;
  photoCount: number;
  hasOpeningHours: boolean;
  businessStatus: string | null;
}

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.rating",
  "places.userRatingCount",
  "places.primaryType",
  "places.formattedAddress",
  "places.websiteUri",
  "places.photos",
  "places.regularOpeningHours",
  "places.businessStatus",
].join(",");

/**
 * Looks up a business's PUBLIC Google Places listing (no OAuth, no owner authorization needed)
 * — appropriate for auditing a PROSPECT who hasn't authorized us yet. Google Business Profile
 * API (owner-authorized management) is intentionally reserved for V2 customers.
 */
export async function lookupPlace(
  businessName: string,
  city: string
): Promise<ProviderResult<PlaceSignals>> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return notConfigured("GOOGLE_PLACES_API_KEY is not set.");
  }

  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: `${businessName}, ${city}` }),
    });

    if (!res.ok) {
      const body = await res.text();
      return requestFailed(`Google Places API returned ${res.status}: ${body}`);
    }

    const json = (await res.json()) as {
      places?: Array<{
        id: string;
        displayName?: { text?: string };
        rating?: number;
        userRatingCount?: number;
        primaryType?: string;
        formattedAddress?: string;
        websiteUri?: string;
        photos?: unknown[];
        regularOpeningHours?: unknown;
        businessStatus?: string;
      }>;
    };

    const place = json.places?.[0];
    if (!place) {
      return requestFailed(`No Google Places listing found for "${businessName}" in ${city}.`);
    }

    return ok({
      placeId: place.id,
      displayName: place.displayName?.text ?? businessName,
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
      primaryType: place.primaryType ?? null,
      formattedAddress: place.formattedAddress ?? null,
      websiteUri: place.websiteUri ?? null,
      photoCount: place.photos?.length ?? 0,
      hasOpeningHours: Boolean(place.regularOpeningHours),
      businessStatus: place.businessStatus ?? null,
    });
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "Google Places request failed.");
  }
}

export interface NearbyBusiness {
  placeId: string;
  businessName: string;
  website: string;
  city: string;
}

const NEARBY_FIELD_MASK = ["places.id", "places.displayName", "places.websiteUri"].join(",");

/**
 * Public category+city business search — used by the Scout Agent (V3) to find NEW prospects.
 * Only returns businesses with a public website, since Prospect.website is required to run the
 * audit pipeline. No OAuth needed (same public-data justification as lookupPlace above).
 */
export async function searchNearbyBusinesses(
  category: string,
  city: string
): Promise<ProviderResult<NearbyBusiness[]>> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return notConfigured("GOOGLE_PLACES_API_KEY is not set.");
  }

  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": NEARBY_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: `${category} in ${city}` }),
    });

    if (!res.ok) {
      const body = await res.text();
      return requestFailed(`Google Places API returned ${res.status}: ${body}`);
    }

    const json = (await res.json()) as {
      places?: Array<{ id: string; displayName?: { text?: string }; websiteUri?: string }>;
    };

    const businesses = (json.places ?? [])
      .filter((p): p is typeof p & { websiteUri: string } => Boolean(p.websiteUri))
      .map((p) => ({
        placeId: p.id,
        businessName: p.displayName?.text ?? "Unknown business",
        website: p.websiteUri,
        city,
      }));

    return ok(businesses);
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "Google Places request failed.");
  }
}

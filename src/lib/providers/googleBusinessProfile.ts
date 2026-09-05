import { notConfigured, ok, requestFailed, type ProviderResult } from "./types";

/**
 * OAuth-based Google Business Profile access — reviews only, for a customer who has already
 * connected their account (see GoogleBusinessConnection / src/lib/auth.ts). This is distinct
 * from lib/providers/places.ts, which does unauthenticated public lookups for prospecting.
 *
 * Endpoints verified against Google's current (split) Business Profile API surface as of this
 * writing — Account Management + Business Information APIs for account/location discovery,
 * legacy v4 mybusiness.googleapis.com for reviews (reviews were not migrated to the newer split
 * APIs). If Google restructures this again, only this file needs to change.
 *
 * Note for whoever configures the Google Cloud project (see INFRASTRUCTURE.md): the Account
 * Management API has shipped with a default quota of 0 for new projects — enabling it in the
 * console is not sufficient, a quota increase must be requested from Google before accounts.list
 * will return anything.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const REVIEWS_BASE_URL = "https://mybusiness.googleapis.com/v4";

async function getAccessToken(refreshToken: string): Promise<ProviderResult<string>> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return notConfigured("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET is not set.");
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      return requestFailed(`Google token refresh returned ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) return requestFailed("Google token refresh returned no access_token.");
    return ok(json.access_token);
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "Google token refresh failed.");
  }
}

export interface GoogleReview {
  // Full resource name, shaped like "accounts/{id}/locations/{id}/reviews/{id}" — required to post a reply.
  resourceName: string;
  reviewId: string;
  reviewerName: string | null;
  starRating: number | null;
  comment: string | null;
  createTime: string | null;
  hasReply: boolean;
}

/** Returns the first (account, location) pair for this connection — V2 assumes one location. */
async function getPrimaryLocationName(accessToken: string): Promise<ProviderResult<string>> {
  try {
    const accountsRes = await fetch(ACCOUNTS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!accountsRes.ok) {
      return requestFailed(`Account Management API returned ${accountsRes.status}: ${await accountsRes.text()}`);
    }
    const accountsJson = (await accountsRes.json()) as { accounts?: Array<{ name: string }> };
    const account = accountsJson.accounts?.[0];
    if (!account) return requestFailed("No Google Business accounts found for this connection.");

    const locationsRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!locationsRes.ok) {
      return requestFailed(`Business Information API returned ${locationsRes.status}: ${await locationsRes.text()}`);
    }
    const locationsJson = (await locationsRes.json()) as { locations?: Array<{ name: string }> };
    const location = locationsJson.locations?.[0];
    if (!location) return requestFailed("No locations found under this Google Business account.");

    // v4 review endpoints want "accounts/{id}/locations/{id}", the split APIs return the same shape.
    return ok(`${account.name}/${location.name}`);
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "Failed to resolve the business location.");
  }
}

export async function listReviews(refreshToken: string): Promise<ProviderResult<GoogleReview[]>> {
  const accessToken = await getAccessToken(refreshToken);
  if (!accessToken.ok) return accessToken;

  const locationName = await getPrimaryLocationName(accessToken.data);
  if (!locationName.ok) return locationName;

  try {
    const res = await fetch(`${REVIEWS_BASE_URL}/${locationName.data}/reviews`, {
      headers: { Authorization: `Bearer ${accessToken.data}` },
    });
    if (!res.ok) {
      return requestFailed(`Reviews API returned ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as {
      reviews?: Array<{
        name: string;
        reviewId: string;
        reviewer?: { displayName?: string };
        starRating?: string;
        comment?: string;
        createTime?: string;
        reviewReply?: unknown;
      }>;
    };

    const STAR_RATING: Record<string, number> = {
      ONE: 1,
      TWO: 2,
      THREE: 3,
      FOUR: 4,
      FIVE: 5,
    };

    return ok(
      (json.reviews ?? []).map((r) => ({
        resourceName: r.name,
        reviewId: r.reviewId,
        reviewerName: r.reviewer?.displayName ?? null,
        starRating: r.starRating ? (STAR_RATING[r.starRating] ?? null) : null,
        comment: r.comment ?? null,
        createTime: r.createTime ?? null,
        hasReply: Boolean(r.reviewReply),
      }))
    );
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "Reviews API request failed.");
  }
}

export async function postReviewReply(
  refreshToken: string,
  reviewResourceName: string,
  replyText: string
): Promise<ProviderResult<{ posted: true }>> {
  const accessToken = await getAccessToken(refreshToken);
  if (!accessToken.ok) return accessToken;

  try {
    const res = await fetch(`${REVIEWS_BASE_URL}/${reviewResourceName}/reply`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken.data}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment: replyText }),
    });

    if (!res.ok) {
      return requestFailed(`Reply API returned ${res.status}: ${await res.text()}`);
    }

    return ok({ posted: true });
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "Reply API request failed.");
  }
}

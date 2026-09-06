import { describe, expect, it } from "vitest";
import { isEligibleUsBusiness } from "./places";

const validPlace = {
  id: "place-1",
  displayName: { text: "Real Local Business" },
  websiteUri: "https://real-local-business.example",
  formattedAddress: "123 Main St, Miami, FL 33101, USA",
  addressComponents: [{ types: ["country"], shortText: "US" }],
  businessStatus: "OPERATIONAL",
};

describe("isEligibleUsBusiness", () => {
  it("accepts an operational US Google Places listing with a public website", () => {
    expect(isEligibleUsBusiness(validPlace)).toBe(true);
  });

  it("rejects a business outside the United States", () => {
    expect(
      isEligibleUsBusiness({
        ...validPlace,
        addressComponents: [{ types: ["country"], shortText: "CA" }],
      })
    ).toBe(false);
  });

  it("rejects closed or unverified-status listings", () => {
    expect(isEligibleUsBusiness({ ...validPlace, businessStatus: "CLOSED_PERMANENTLY" })).toBe(false);
    expect(isEligibleUsBusiness({ ...validPlace, businessStatus: undefined })).toBe(false);
  });

  it("rejects listings without a valid public website or address", () => {
    expect(isEligibleUsBusiness({ ...validPlace, websiteUri: "not-a-url" })).toBe(false);
    expect(isEligibleUsBusiness({ ...validPlace, formattedAddress: undefined })).toBe(false);
  });
});

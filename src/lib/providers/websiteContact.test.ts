import { describe, expect, it } from "vitest";
import { extractPublishedEmails } from "./website";

describe("public website contact discovery", () => {
  it("extracts and normalizes addresses the business publishes", () => {
    expect(extractPublishedEmails('<body>Questions: Sales@Business.com <a href="mailto:hello@business.com?subject=Hi">Email</a></body>'))
      .toEqual(["hello@business.com", "sales@business.com"]);
  });

  it("rejects placeholder addresses", () => {
    expect(extractPublishedEmails("email@example.com test@example.com")).toEqual([]);
  });

  it("does not invent an address when none is present", () => {
    expect(extractPublishedEmails("Contact us using this form.")).toEqual([]);
  });
});

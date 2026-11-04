// covers: FR-026
import { describe, expect, it } from "vitest";
import { profileWarning } from "../../src/client/warning.js";

describe("profileWarning", () => {
  it("warns when client-routing is configured and the page has no router", () => {
    expect(profileWarning("client-routing", false)).toMatch(/"client-routing" but this page has no ClientRouter/);
  });
  it("warns when multi-page is configured and the page has the router", () => {
    expect(profileWarning("multi-page", true)).toMatch(/"multi-page" but this page has ClientRouter/);
  });
  it("is silent when they agree", () => {
    expect(profileWarning("client-routing", true)).toBeNull();
    expect(profileWarning("multi-page", false)).toBeNull();
  });
});

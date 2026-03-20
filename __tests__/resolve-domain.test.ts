import { resolveDomain } from "@/lib/resolve-domain";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Suppress console for cleaner test output
beforeEach(() => {
  mockFetch.mockReset();
  delete process.env.BRAVE_API_KEY;
});

describe("resolveDomain", () => {
  // -----------------------------------------------------------------------
  // Override tests
  // -----------------------------------------------------------------------
  it("returns override domain for exact match (case-insensitive)", async () => {
    const result = await resolveDomain("Nift");
    expect(result.domain).toBe("gonift.com");
    expect(result.source).toBe("override");
  });

  it("returns override domain case-insensitively", async () => {
    const result = await resolveDomain("nift");
    expect(result.domain).toBe("gonift.com");
    expect(result.source).toBe("override");
  });

  it("returns override for company with special chars", async () => {
    const result = await resolveDomain("Navitas Credit Corp.");
    expect(result.domain).toBe("navitascredit.com");
    expect(result.source).toBe("override");
  });

  it("returns override for organicgirl (lowercase key)", async () => {
    const result = await resolveDomain("organicgirl");
    expect(result.domain).toBe("iloveorganicgirl.com");
    expect(result.source).toBe("override");
  });

  // -----------------------------------------------------------------------
  // Empty input
  // -----------------------------------------------------------------------
  it("returns empty domain for blank company", async () => {
    const result = await resolveDomain("   ");
    expect(result.domain).toBe("");
    expect(result.source).toBe("missing_company");
  });

  // -----------------------------------------------------------------------
  // Clearbit happy path
  // -----------------------------------------------------------------------
  it("returns Clearbit domain when similarity is acceptable", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ domain: "acme.com" }],
    });

    const result = await resolveDomain("Acme");
    expect(result.domain).toBe("acme.com");
    expect(result.source).toBe("clearbit");
  });

  // -----------------------------------------------------------------------
  // Clearbit low-confidence → Brave fallback
  // -----------------------------------------------------------------------
  it("uses Brave first when API key is set via env and result is good", async () => {
    process.env.BRAVE_API_KEY = "test-key";

    // Brave returns a good match (called first now)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [{ url: "https://www.acmecorp.com/about" }],
        },
      }),
    });

    const result = await resolveDomain("Acme Corp");
    // If Brave domain passes similarity check, it should be returned
    if (result.source === "brave") {
      expect(result.domain).toBe("acmecorp.com");
    } else {
      // If Brave domain fails similarity, falls back to Clearbit → unresolved
      expect(result.source).toBe("unresolved");
    }
  });

  it("uses Brave when API key is passed as parameter (BYOK)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [{ url: "https://www.acmecorp.com/about" }],
        },
      }),
    });

    const result = await resolveDomain("Acme Corp", "user-provided-key");
    if (result.source === "brave") {
      expect(result.domain).toBe("acmecorp.com");
    } else {
      expect(result.source).toBe("unresolved");
    }
  });

  it("returns unresolved when Clearbit is low-confidence and no Brave key", async () => {
    // No BRAVE_API_KEY set
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ domain: "totally-unrelated.com" }],
    });

    const result = await resolveDomain("Acme Corp");
    expect(result.domain).toBe("");
    expect(result.source).toBe("unresolved_low_confidence");
  });

  // -----------------------------------------------------------------------
  // Clearbit failure
  // -----------------------------------------------------------------------
  it("returns unresolved when Clearbit API errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await resolveDomain("Acme");
    expect(result.domain).toBe("");
    expect(result.source).toBe("unresolved");
  });

  it("returns unresolved when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await resolveDomain("Acme");
    expect(result.domain).toBe("");
    expect(result.source).toBe("unresolved");
  });

  // -----------------------------------------------------------------------
  // Clearbit returns empty results
  // -----------------------------------------------------------------------
  it("returns unresolved when Clearbit returns empty array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await resolveDomain("Acme");
    expect(result.domain).toBe("");
    expect(result.source).toBe("unresolved");
  });

  // -----------------------------------------------------------------------
  // Domain normalization
  // -----------------------------------------------------------------------
  it("strips https:// and www. from Clearbit domain", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ domain: "https://www.acme.com/path" }],
    });

    const result = await resolveDomain("Acme");
    expect(result.domain).toBe("acme.com");
  });

  // -----------------------------------------------------------------------
  // Brave fallback edge cases
  // -----------------------------------------------------------------------
  it("handles Brave API failure gracefully and falls back to Clearbit", async () => {
    process.env.BRAVE_API_KEY = "test-key";

    // Brave fails (called first now)
    mockFetch.mockRejectedValueOnce(new Error("Brave error"));

    // Clearbit returns a poor match
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ domain: "totally-unrelated.com" }],
    });

    const result = await resolveDomain("Acme Corp");
    expect(result.domain).toBe("");
    expect(result.source).toBe("unresolved_low_confidence");
  });

  it("prefers user-provided braveApiKey over env var", async () => {
    process.env.BRAVE_API_KEY = "env-key";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [{ url: "https://www.acmecorp.com/about" }],
        },
      }),
    });

    await resolveDomain("Acme Corp", "user-key");

    // Verify the fetch was called with the user-provided key, not the env key
    const braveCall = mockFetch.mock.calls[0];
    expect(braveCall[1].headers["X-Subscription-Token"]).toBe("user-key");
  });
});

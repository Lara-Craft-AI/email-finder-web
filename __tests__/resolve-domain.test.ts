import { resolveDomain } from "@/lib/resolve-domain";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock DNS resolveMx
const mockResolveMx = jest.fn();
jest.mock("node:dns/promises", () => ({
  resolveMx: (...args: unknown[]) => mockResolveMx(...args),
}));

beforeEach(() => {
  mockFetch.mockReset();
  mockResolveMx.mockReset();
  delete process.env.BRAVE_API_KEY;
});

describe("resolveDomain", () => {
  // -----------------------------------------------------------------------
  // Step 1: Override tests
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
  // Step 2: Slug guess with MX check
  // -----------------------------------------------------------------------
  it("resolves via slug guess when MX records exist for joined slug", async () => {
    mockResolveMx.mockResolvedValueOnce([{ exchange: "mx.example.com", priority: 10 }]);

    const result = await resolveDomain("Barefoot Books");
    expect(result.domain).toBe("barefootbooks.com");
    expect(result.source).toBe("slug_guess");
    // Should not call fetch (no Clearbit/Brave needed)
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("resolves via hyphenated slug when joined slug has no MX", async () => {
    // First candidate (joined) fails
    mockResolveMx.mockRejectedValueOnce(new Error("ENOTFOUND"));
    // Second candidate (hyphenated) succeeds
    mockResolveMx.mockResolvedValueOnce([{ exchange: "mx.example.com", priority: 10 }]);

    const result = await resolveDomain("Barefoot Books");
    expect(result.domain).toBe("barefoot-books.com");
    expect(result.source).toBe("slug_guess");
  });

  it("resolves via first-word slug when other slugs fail", async () => {
    // Joined fails
    mockResolveMx.mockRejectedValueOnce(new Error("ENOTFOUND"));
    // Hyphenated fails
    mockResolveMx.mockRejectedValueOnce(new Error("ENOTFOUND"));
    // First-word succeeds
    mockResolveMx.mockResolvedValueOnce([{ exchange: "mx.example.com", priority: 10 }]);

    const result = await resolveDomain("Barefoot Books");
    expect(result.domain).toBe("barefoot.com");
    expect(result.source).toBe("slug_guess");
  });

  it("strips common suffixes from slug candidates", async () => {
    mockResolveMx.mockResolvedValueOnce([{ exchange: "mx.example.com", priority: 10 }]);

    const result = await resolveDomain("Acme Corp");
    expect(result.domain).toBe("acme.com");
    expect(result.source).toBe("slug_guess");
    // "corp" stripped, single word → only 1 candidate
  });

  it("falls through slug guess when no MX records found", async () => {
    // All slug candidates fail
    mockResolveMx.mockRejectedValue(new Error("ENOTFOUND"));

    // Clearbit returns a good match
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ domain: "acme.com" }],
    });

    const result = await resolveDomain("Acme");
    expect(result.domain).toBe("acme.com");
    expect(result.source).toBe("clearbit");
  });

  // -----------------------------------------------------------------------
  // Step 3: Clearbit happy path
  // -----------------------------------------------------------------------
  it("returns Clearbit domain when similarity >= 0.6", async () => {
    mockResolveMx.mockRejectedValue(new Error("ENOTFOUND"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ domain: "acme.com" }],
    });

    const result = await resolveDomain("Acme");
    expect(result.domain).toBe("acme.com");
    expect(result.source).toBe("clearbit");
  });

  it("falls through Clearbit when similarity < 0.6", async () => {
    mockResolveMx.mockRejectedValue(new Error("ENOTFOUND"));

    // Clearbit returns a poor match
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ domain: "totally-unrelated.com" }],
    });

    const result = await resolveDomain("Acme Corp");
    // No Brave key, so unresolved
    expect(result.domain).toBe("");
    expect(result.source).toBe("unresolved");
  });

  it("returns unresolved when Clearbit API errors and no Brave key", async () => {
    mockResolveMx.mockRejectedValue(new Error("ENOTFOUND"));
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await resolveDomain("Acme");
    expect(result.domain).toBe("");
    expect(result.source).toBe("unresolved");
  });

  it("returns unresolved when Clearbit returns empty array", async () => {
    mockResolveMx.mockRejectedValue(new Error("ENOTFOUND"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await resolveDomain("Acme");
    expect(result.domain).toBe("");
    expect(result.source).toBe("unresolved");
  });

  // -----------------------------------------------------------------------
  // Step 4: Brave API (last resort)
  // -----------------------------------------------------------------------
  it("uses Brave as last resort when slug and Clearbit fail", async () => {
    process.env.BRAVE_API_KEY = "test-key";
    mockResolveMx.mockRejectedValue(new Error("ENOTFOUND"));

    // Clearbit returns empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    // Brave returns a good match (acme.com has high similarity to "Acme")
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: { results: [{ url: "https://www.acme.com/about" }] },
      }),
    });

    const result = await resolveDomain("Acme");
    expect(result.source).toBe("brave");
    expect(result.domain).toBe("acme.com");
  });

  it("uses user-provided braveApiKey over env var", async () => {
    process.env.BRAVE_API_KEY = "env-key";
    mockResolveMx.mockRejectedValue(new Error("ENOTFOUND"));

    // Clearbit returns empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    // Brave returns a result
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: { results: [{ url: "https://www.acmecorp.com/about" }] },
      }),
    });

    await resolveDomain("Acme Corp", "user-key");

    // Brave call is the second fetch (after Clearbit)
    const braveCall = mockFetch.mock.calls[1];
    expect(braveCall[1].headers["X-Subscription-Token"]).toBe("user-key");
  });

  it("returns unresolved when Brave similarity < 0.5", async () => {
    process.env.BRAVE_API_KEY = "test-key";
    mockResolveMx.mockRejectedValue(new Error("ENOTFOUND"));

    // Clearbit empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    // Brave returns unrelated domain
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: { results: [{ url: "https://www.totally-unrelated-xyz.com" }] },
      }),
    });

    const result = await resolveDomain("Acme Corp");
    expect(result.domain).toBe("");
    expect(result.source).toBe("unresolved");
  });

  it("handles Brave API failure gracefully", async () => {
    process.env.BRAVE_API_KEY = "test-key";
    mockResolveMx.mockRejectedValue(new Error("ENOTFOUND"));

    // Clearbit empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    // Brave fails
    mockFetch.mockRejectedValueOnce(new Error("Brave error"));

    const result = await resolveDomain("Acme Corp");
    expect(result.domain).toBe("");
    expect(result.source).toBe("unresolved");
  });

  // -----------------------------------------------------------------------
  // Domain normalization
  // -----------------------------------------------------------------------
  it("strips https:// and www. from Clearbit domain", async () => {
    mockResolveMx.mockRejectedValue(new Error("ENOTFOUND"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ domain: "https://www.acme.com/path" }],
    });

    const result = await resolveDomain("Acme");
    expect(result.domain).toBe("acme.com");
  });

  // -----------------------------------------------------------------------
  // Network error
  // -----------------------------------------------------------------------
  it("returns unresolved when fetch throws", async () => {
    mockResolveMx.mockRejectedValue(new Error("ENOTFOUND"));
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await resolveDomain("Acme");
    expect(result.domain).toBe("");
    expect(result.source).toBe("unresolved");
  });
});

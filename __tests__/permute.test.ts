import { permuteEmails, splitName } from "@/lib/permute";

describe("splitName", () => {
  it("splits simple two-part name", () => {
    expect(splitName("John Smith")).toEqual({ first: "john", last: "smith" });
  });

  it("uses last token as last name for multi-part names", () => {
    expect(splitName("Mary Jane Watson")).toEqual({ first: "mary", last: "watson" });
  });

  it("handles single name — last should be empty", () => {
    expect(splitName("Madonna")).toEqual({ first: "madonna", last: "" });
  });

  it("strips accented characters", () => {
    expect(splitName("José García")).toEqual({ first: "jose", last: "garcia" });
  });

  it("strips special characters like apostrophes and hyphens", () => {
    expect(splitName("O'Brien Smith-Jones")).toEqual({ first: "obrien", last: "smithjones" });
  });

  it("handles extra whitespace", () => {
    expect(splitName("  John   Smith  ")).toEqual({ first: "john", last: "smith" });
  });
});

describe("permuteEmails", () => {
  it("generates standard 6 patterns for two-part name", () => {
    const results = permuteEmails("John Smith", "acme.com");
    const emails = results.map((r) => r.email);

    expect(emails).toContain("john.smith@acme.com");
    expect(emails).toContain("jsmith@acme.com");
    expect(emails).toContain("johnsmith@acme.com");
    expect(emails).toContain("john@acme.com");
    expect(emails).toContain("smith@acme.com");
    expect(emails).toContain("john_smith@acme.com");
    expect(results).toHaveLength(6);
  });

  it("generates extended patterns when extended=true", () => {
    const results = permuteEmails("John Smith", "acme.com", true);
    const emails = results.map((r) => r.email);

    expect(emails).toContain("j.smith@acme.com");
    expect(emails).toContain("smith.john@acme.com");
    expect(emails).toContain("smithjohn@acme.com");
    expect(emails).toContain("sjohn@acme.com");
    expect(results.length).toBeGreaterThan(6);
  });

  it("returns empty array when domain is missing", () => {
    expect(permuteEmails("John Smith", "")).toEqual([]);
  });

  it("returns empty array when name is empty", () => {
    expect(permuteEmails("", "acme.com")).toEqual([]);
  });

  it("produces no duplicates even for single-name input", () => {
    // Single name: first="madonna", last=""
    // Patterns like "first.last" → "madonna." → trimmed to "madonna"
    // "first" → "madonna" — would duplicate
    const results = permuteEmails("Madonna", "acme.com");
    const emails = results.map((r) => r.email);
    const unique = new Set(emails);
    expect(emails.length).toBe(unique.size);
  });

  it("handles names with accents — strips diacritics", () => {
    const results = permuteEmails("José García", "acme.com");
    const emails = results.map((r) => r.email);
    expect(emails).toContain("jose.garcia@acme.com");
    expect(emails).toContain("jgarcia@acme.com");
    // Should not contain accented characters
    expect(emails.every((e) => /^[a-z0-9._@]+$/.test(e))).toBe(true);
  });

  it("handles names with apostrophes and hyphens", () => {
    const results = permuteEmails("O'Brien Smith-Jones", "acme.com");
    const emails = results.map((r) => r.email);
    expect(emails).toContain("obrien.smithjones@acme.com");
    expect(emails).toContain("obriensmithjones@acme.com");
  });

  it("all emails are lowercase", () => {
    const results = permuteEmails("JOHN SMITH", "ACME.COM");
    expect(results.every((r) => r.email === r.email.toLowerCase())).toBe(true);
  });

  it("strips leading/trailing dots and underscores from local part", () => {
    // Single name: patterns that produce ".madonna" or "madonna." should be trimmed
    const results = permuteEmails("Madonna", "acme.com");
    for (const r of results) {
      const local = r.email.split("@")[0];
      expect(local).not.toMatch(/^[._]/);
      expect(local).not.toMatch(/[._]$/);
    }
  });

  it("each result includes the pattern name", () => {
    const results = permuteEmails("John Smith", "acme.com");
    expect(results[0]).toHaveProperty("pattern");
    expect(results[0]).toHaveProperty("email");
    const patterns = results.map((r) => r.pattern);
    expect(patterns).toContain("first.last");
    expect(patterns).toContain("flast");
  });
});

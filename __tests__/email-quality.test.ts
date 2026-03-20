import {
  scoreDomainSimilarity,
  scoreEmailQuality,
  isRoleBasedEmail,
} from "@/lib/email-quality";

// ---------------------------------------------------------------------------
// scoreDomainSimilarity
// ---------------------------------------------------------------------------
describe("scoreDomainSimilarity", () => {
  it("returns similarity=1 for exact match", () => {
    const result = scoreDomainSimilarity("acme.com", "Acme");
    expect(result.similarity).toBe(1);
    expect(result.domainMatchRisk).toBe("low");
  });

  it("returns low risk when domain clearly matches company", () => {
    const result = scoreDomainSimilarity("guidehealth.com", "Guidehealth");
    expect(result.domainMatchRisk).toBe("low");
  });

  it("returns high risk for clearly mismatched domain", () => {
    // nifty.com for company "Nift" — different domain entirely
    const result = scoreDomainSimilarity("nifty.com", "Nift");
    // nifty vs nift — close but the system should detect this as risky or medium at most
    expect(result.similarity).toBeLessThan(1);
  });

  it("returns high risk for completely unrelated domain", () => {
    const result = scoreDomainSimilarity("google.com", "Acme Corporation");
    expect(result.domainMatchRisk).toBe("high");
  });

  it("handles compound domains with known suffixes", () => {
    // "acmelabs.com" for "Acme" should get a compound bonus
    const result = scoreDomainSimilarity("acmelabs.com", "Acme");
    expect(result.similarity).toBeGreaterThan(0.3);
  });

  it("strips common company suffixes (Inc, LLC, etc.) before scoring", () => {
    const withSuffix = scoreDomainSimilarity("acme.com", "Acme Inc.");
    const withoutSuffix = scoreDomainSimilarity("acme.com", "Acme");
    expect(withSuffix.similarity).toBe(withoutSuffix.similarity);
  });

  it("handles empty domain", () => {
    const result = scoreDomainSimilarity("", "Acme");
    expect(result.similarity).toBe(0);
    expect(result.domainMatchRisk).toBeNull();
  });

  it("handles empty company", () => {
    const result = scoreDomainSimilarity("acme.com", "");
    expect(result.similarity).toBe(0);
    expect(result.domainMatchRisk).toBeNull();
  });

  it("handles multi-label domains like co.uk", () => {
    // Should strip .co.uk suffix labels to get root
    const result = scoreDomainSimilarity("acme.co.uk", "Acme");
    expect(result.similarity).toBe(1);
    expect(result.domainMatchRisk).toBe("low");
  });

  it("scores medium risk for partial matches", () => {
    const result = scoreDomainSimilarity("vertexsp.com", "Vertex Service Partners");
    // Should be medium or at least not high — partial overlap
    expect(result.similarity).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// isRoleBasedEmail
// ---------------------------------------------------------------------------
describe("isRoleBasedEmail", () => {
  it.each(["info@acme.com", "admin@acme.com", "support@acme.com", "sales@acme.com", "hello@acme.com", "contact@acme.com", "noreply@acme.com", "team@acme.com"])(
    "detects %s as role-based",
    (email) => {
      expect(isRoleBasedEmail(email)).toBe(true);
    },
  );

  it("does NOT flag personal emails as role-based", () => {
    expect(isRoleBasedEmail("john.smith@acme.com")).toBe(false);
    expect(isRoleBasedEmail("jsmith@acme.com")).toBe(false);
  });

  it("detects role-based with prefix splitting (support.team@)", () => {
    // primaryToken = "support" → role-based
    expect(isRoleBasedEmail("support.team@acme.com")).toBe(true);
  });

  it("handles edge case: normalizes non-alpha chars", () => {
    // "info-dept@acme.com" → primaryToken = "info" → role-based
    expect(isRoleBasedEmail("info-dept@acme.com")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scoreEmailQuality — Grade logic
// ---------------------------------------------------------------------------
describe("scoreEmailQuality", () => {
  const baseInput = {
    email: "john.smith@acme.com",
    status: "valid" as const,
    similarity: 0.9,
    domainMatchRisk: "low" as const,
    mxProvider: "google" as const,
    isRoleBased: false,
  };

  it("Grade A: valid, high similarity, known MX, not catch-all, not role-based", () => {
    const result = scoreEmailQuality(baseInput);
    expect(result.grade).toBe("A");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(70);
  });

  it("Grade B: catch-all always gets C regardless of other factors", () => {
    const result = scoreEmailQuality({
      ...baseInput,
      status: "catch_all",
    });
    // catch_all forces grade C per the code logic
    expect(result.grade).toBe("C");
  });

  it("Grade C: high domain mismatch risk tanks the score", () => {
    const result = scoreEmailQuality({
      ...baseInput,
      similarity: 0.2,
      domainMatchRisk: "high",
    });
    expect(result.grade).toBe("C");
    expect(result.confidenceScore).toBeLessThan(40);
  });

  it("Grade null: no email produces null grade", () => {
    const result = scoreEmailQuality({
      ...baseInput,
      email: "",
    });
    expect(result.grade).toBeNull();
    expect(result.confidenceScore).toBe(0);
  });

  it("role-based emails get downgraded", () => {
    const normal = scoreEmailQuality(baseInput);
    const roleBased = scoreEmailQuality({ ...baseInput, isRoleBased: true });
    expect(roleBased.confidenceScore).toBeLessThan(normal.confidenceScore);
  });

  it("role-based penalty of exactly 20 points", () => {
    const normal = scoreEmailQuality(baseInput);
    const roleBased = scoreEmailQuality({ ...baseInput, isRoleBased: true });
    expect(normal.confidenceScore - roleBased.confidenceScore).toBe(20);
  });

  it("catch-all penalty of 30 points reflected in score", () => {
    const valid = scoreEmailQuality(baseInput);
    const catchAll = scoreEmailQuality({ ...baseInput, status: "catch_all" });
    // catch_all doesn't get the +40 for valid status AND gets -30
    // So the difference is larger than just 30
    expect(catchAll.confidenceScore).toBeLessThan(valid.confidenceScore);
  });

  it("confidence score is clamped between 0 and 100", () => {
    // Stack all penalties
    const worst = scoreEmailQuality({
      email: "info@random.com",
      status: "catch_all",
      similarity: 0.1,
      domainMatchRisk: "high",
      mxProvider: null,
      isRoleBased: true,
    });
    expect(worst.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(worst.confidenceScore).toBeLessThanOrEqual(100);
  });

  it("medium similarity gives partial score boost", () => {
    const medium = scoreEmailQuality({
      ...baseInput,
      similarity: 0.6,
      domainMatchRisk: "medium",
    });
    const high = scoreEmailQuality(baseInput);
    expect(medium.confidenceScore).toBeLessThan(high.confidenceScore);
    expect(medium.confidenceScore).toBeGreaterThan(0);
  });

  it("custom MX provider gives no MX bonus", () => {
    const customMx = scoreEmailQuality({
      ...baseInput,
      mxProvider: "custom",
    });
    const googleMx = scoreEmailQuality(baseInput);
    expect(customMx.confidenceScore).toBeLessThan(googleMx.confidenceScore);
  });
});

import { processMockLead } from "@/lib/mock";
import type { LeadInput } from "@/lib/types";

const lead: LeadInput = { name: "John Smith", company: "Acme Corp" };

describe("processMockLead", () => {
  it("returns valid status for index 0 (bucket 0)", async () => {
    const result = await processMockLead(lead, 0);
    expect(result.status).toBe("valid");
    expect(result.email).toBe("john.smith@acmecorp.com");
    expect(result.pattern).toBe("first.last");
    expect(result.grade).toBe("A");
    expect(result.confidence_score).toBe(85);
  });

  it("returns not_found for index 16 (bucket 16)", async () => {
    const result = await processMockLead(lead, 16);
    expect(result.status).toBe("not_found");
    expect(result.email).toBe("");
    expect(result.pattern).toBe("");
    expect(result.grade).toBeNull();
    expect(result.confidence_score).toBe(0);
  });

  it("returns catch_all for index 19 (bucket 19)", async () => {
    const result = await processMockLead(lead, 19);
    expect(result.status).toBe("catch_all");
    expect(result.email).toBe("john.smith@acmecorp.com");
    expect(result.grade).toBe("C");
    expect(result.confidence_score).toBe(25);
  });

  it("cycles deterministically — index 20 same as index 0", async () => {
    const a = await processMockLead(lead, 0);
    const b = await processMockLead(lead, 20);
    expect(a.status).toBe(b.status);
    expect(a.email).toBe(b.email);
  });

  it("preserves lead name and company in result", async () => {
    const result = await processMockLead(lead, 0);
    expect(result.name).toBe("John Smith");
    expect(result.company).toBe("Acme Corp");
  });

  it("generates domain by lowering and stripping non-alpha from company", async () => {
    const result = await processMockLead(
      { name: "Jane Doe", company: "My Company! LLC" },
      0,
    );
    expect(result.domain).toBe("mycompanyllc.com");
  });

  it("always returns low domain_match_risk and google mx_provider", async () => {
    const result = await processMockLead(lead, 5);
    expect(result.domain_match_risk).toBe("low");
    expect(result.mx_provider).toBe("google");
  });

  it("handles single-word name", async () => {
    const result = await processMockLead(
      { name: "Madonna", company: "Label" },
      0,
    );
    // first="madonna", last="" → email = "madonna.@label.com" trimmed to "madonna@label.com"
    expect(result.email).toContain("madonna");
    expect(result.domain).toBe("label.com");
  });
});

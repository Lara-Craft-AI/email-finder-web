import type { EmailResult, EmailStatus, LeadInput } from "@/lib/types";
import { splitName } from "@/lib/permute";

function mockDomain(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
}

export async function processMockLead(lead: LeadInput, index: number): Promise<EmailResult> {
  // 2ms artificial delay per lead
  await new Promise((resolve) => setTimeout(resolve, 2));

  const { first, last } = splitName(lead.name);
  const domain = mockDomain(lead.company);

  // Deterministic status based on index % 20:
  // 0-15 (80%) → valid, 16-18 (15%) → not_found, 19 (5%) → catch_all
  const bucket = index % 20;
  let status: EmailStatus;
  let email: string;
  let pattern: string;

  if (bucket < 16) {
    status = "valid";
    email = `${first}.${last}@${domain}`;
    pattern = "first.last";
  } else if (bucket < 19) {
    status = "not_found";
    email = "";
    pattern = "";
  } else {
    status = "catch_all";
    email = `${first}.${last}@${domain}`;
    pattern = "first.last";
  }

  return {
    name: lead.name,
    company: lead.company,
    domain,
    email,
    pattern,
    status,
    domain_match_risk: "low",
    mx_provider: "google",
    grade: status === "valid" ? "A" : status === "catch_all" ? "C" : null,
    confidence_score: status === "valid" ? 85 : status === "catch_all" ? 25 : 0,
  };
}

import { DOMAIN_OVERRIDES } from "@/lib/domains-override";
import { scoreDomainSimilarity } from "@/lib/email-quality";

function normalizeDomain(input: string) {
  return input.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
}

export async function resolveDomain(company: string) {
  const trimmed = company.trim();

  if (!trimmed) {
    return { domain: "", source: "missing_company" };
  }

  const override = DOMAIN_OVERRIDES[trimmed];
  if (override) {
    return { domain: override, source: "override" };
  }

  try {
    const response = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(trimmed)}`,
      {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Clearbit request failed with ${response.status}`);
    }

    const payload = (await response.json()) as Array<{ domain?: string }>;
    const domain = payload[0]?.domain ? normalizeDomain(payload[0].domain) : "";

    if (domain) {
      const { domainMatchRisk } = scoreDomainSimilarity(domain, trimmed);
      if (domainMatchRisk === "high") {
        return { domain: "", source: "unresolved_low_confidence" as const };
      }
    }

    return { domain, source: domain ? "clearbit" : "unresolved" };
  } catch {
    return { domain: "", source: "unresolved" };
  }
}

import { DOMAIN_OVERRIDES } from "@/lib/domains-override";
import { scoreDomainSimilarity } from "@/lib/email-quality";

function normalizeDomain(input: string) {
  return input.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
}

export async function resolveDomain(company: string, braveApiKey?: string) {
  const trimmed = company.trim();

  if (!trimmed) {
    return { domain: "", source: "missing_company" };
  }

  const overrideKey = Object.keys(DOMAIN_OVERRIDES).find(k => k.toLowerCase() === trimmed.toLowerCase());
  const override = overrideKey ? DOMAIN_OVERRIDES[overrideKey] : undefined;
  if (override) {
    return { domain: override, source: "override" };
  }

  // Try Brave first if API key is available (user-provided or env fallback)
  const effectiveBraveKey = braveApiKey || process.env.BRAVE_API_KEY;
  if (effectiveBraveKey) {
    try {
      const braveRes = await fetch(
        "https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(trimmed + " official website") + "&count=3",
        { headers: { "X-Subscription-Token": effectiveBraveKey, "Accept": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) },
      );
      if (braveRes.ok) {
        const braveData = await braveRes.json() as { web?: { results?: Array<{ url?: string }> } };
        const firstUrl = braveData?.web?.results?.[0]?.url;
        if (firstUrl) {
          const braveDomain = normalizeDomain(firstUrl);
          if (braveDomain) {
            const braveScore = scoreDomainSimilarity(braveDomain, trimmed);
            if (braveScore.domainMatchRisk !== "high") {
              return { domain: braveDomain, source: "brave" };
            }
          }
        }
      }
    } catch (error) {
      console.error(`[resolve-domain] Brave search failed for "${trimmed}":`, error instanceof Error ? error.message : error);
    }
  }

  // Fall back to Clearbit
  try {
    const response = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(trimmed)}`,
      {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
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

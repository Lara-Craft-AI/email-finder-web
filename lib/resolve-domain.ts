import { resolveMx } from "node:dns/promises";

import { DOMAIN_OVERRIDES } from "@/lib/domains-override";
import { scoreDomainSimilarity } from "@/lib/email-quality";

function normalizeDomain(input: string) {
  return input.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
}

const STRIP_SUFFIXES = new Set([
  "inc", "llc", "corp", "co", "ltd", "group", "services", "solutions",
]);

/**
 * Step 2: Generate slug candidates from the company name and check MX records.
 * Returns the first domain that has valid MX records, or null.
 */
async function trySlugGuess(company: string): Promise<string | null> {
  // Normalize: lowercase, strip punctuation, remove common suffixes
  const words = company
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STRIP_SUFFIXES.has(w));

  if (words.length === 0) return null;

  // Generate slug candidates
  const candidates: string[] = [];
  candidates.push(words.join("") + ".com");           // barefootbooks.com
  if (words.length > 1) {
    candidates.push(words.join("-") + ".com");         // barefoot-books.com
    candidates.push(words[0] + ".com");                // barefoot.com
  }

  for (const domain of candidates) {
    try {
      const records = await resolveMx(domain);
      if (records && records.length > 0) {
        return domain;
      }
    } catch {
      // No MX records or DNS failure — skip this candidate
    }
  }

  return null;
}

export async function resolveDomain(company: string, braveApiKey?: string) {
  const trimmed = company.trim();

  if (!trimmed) {
    return { domain: "", source: "missing_company" };
  }

  // ── Step 1: Domain override map (case-insensitive) ──
  const overrideKey = Object.keys(DOMAIN_OVERRIDES).find(k => k.toLowerCase() === trimmed.toLowerCase());
  const override = overrideKey ? DOMAIN_OVERRIDES[overrideKey] : undefined;
  if (override) {
    return { domain: override, source: "override" };
  }

  // ── Step 2: Slug guess with MX check (free) ──
  try {
    const slugDomain = await trySlugGuess(trimmed);
    if (slugDomain) {
      return { domain: slugDomain, source: "slug_guess" };
    }
  } catch {
    // slug guess failed entirely, continue
  }

  // ── Step 3: Clearbit autocomplete (free) ──
  try {
    const response = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(trimmed)}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (response.ok) {
      const payload = (await response.json()) as Array<{ domain?: string }>;
      const domain = payload[0]?.domain ? normalizeDomain(payload[0].domain) : "";

      if (domain) {
        const { similarity } = scoreDomainSimilarity(domain, trimmed);
        if (similarity >= 0.6) {
          return { domain, source: "clearbit" };
        }
        // similarity too low — fall through to Brave
      }
    }
  } catch {
    // Clearbit failed, continue to Brave
  }

  // ── Step 4: Brave API (paid, last resort) ──
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
            const { similarity } = scoreDomainSimilarity(braveDomain, trimmed);
            if (similarity >= 0.5) {
              return { domain: braveDomain, source: "brave" };
            }
          }
        }
      }
    } catch (error) {
      console.error(`[resolve-domain] Brave search failed for "${trimmed}":`, error instanceof Error ? error.message : error);
    }
  }

  // ── Step 5: Return null (unresolved) ──
  return { domain: "", source: "unresolved" };
}

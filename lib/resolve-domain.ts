import { resolveMx } from "node:dns/promises";

import { DOMAIN_OVERRIDES } from "@/lib/domains-override";
import { scoreDomainSimilarity } from "@/lib/email-quality";
import type { DomainMatchRisk } from "@/lib/types";

export type DomainResolution = {
  domain: string;
  source: string;
  similarity?: number;
  domainMatchRisk?: DomainMatchRisk | null;
};

function normalizeDomain(input: string) {
  return input.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
}

const STRIP_SUFFIXES = new Set([
  "inc", "llc", "corp", "co", "ltd", "group", "services", "solutions",
]);

// Pre-built lowercase lookup map for O(1) override lookup instead of O(n) linear scan
const DOMAIN_OVERRIDES_LOWER = new Map<string, string>(
  Object.entries(DOMAIN_OVERRIDES).map(([k, v]) => [k.toLowerCase(), v])
);

/**
 * Step 2: Generate slug candidates from the company name and check MX records.
 * All DNS lookups are fired in parallel; returns the first domain (by priority order)
 * that has valid MX records, or null.
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

  // Generate slug candidates in priority order
  const candidates: string[] = [];
  candidates.push(words.join("") + ".com");           // barefootbooks.com
  if (words.length > 1) {
    candidates.push(words.join("-") + ".com");         // barefoot-books.com
    candidates.push(words[0] + ".com");                // barefoot.com
  }

  // Fire all DNS lookups in parallel for speed
  const checks = candidates.map(async (domain) => {
    try {
      const records = await resolveMx(domain);
      return records && records.length > 0 ? domain : null;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(checks);

  // Return highest-priority candidate that resolved
  for (const result of results) {
    if (result) return result;
  }

  return null;
}

export async function resolveDomain(company: string, braveApiKey?: string): Promise<DomainResolution> {
  const trimmed = company.trim();

  if (!trimmed) {
    return { domain: "", source: "missing_company" };
  }

  // ── Step 1: Domain override map (O(1) lookup via pre-built lowercase Map) ──
  const override = DOMAIN_OVERRIDES_LOWER.get(trimmed.toLowerCase());
  if (override) {
    return { domain: override, source: "override" };
  }

  // ── Steps 2-4: Race slug guess (free DNS) with Clearbit (free HTTP) in parallel ──
  // Previously slug guess blocked Clearbit; now they run concurrently so a slow/failing
  // slug guess doesn't add latency before we try API-based resolution.
  const effectiveBraveKey = braveApiKey || process.env.BRAVE_API_KEY;

  const slugPromise = trySlugGuess(trimmed)
    .then((domain) => domain ? { domain, source: "slug_guess" as const } : null)
    .catch(() => null);

  const clearbitPromise = (async () => {
    try {
      const response = await fetch(
        `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(trimmed)}`,
        {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as Array<{ domain?: string }>;
      const domain = payload[0]?.domain ? normalizeDomain(payload[0].domain) : "";
      if (!domain) return null;
      const { similarity, domainMatchRisk } = scoreDomainSimilarity(domain, trimmed);
      return similarity >= 0.6 ? { domain, source: "clearbit" as const, similarity, domainMatchRisk } : null;
    } catch {
      return null;
    }
  })();

  const [slugResult, clearbitResult] = await Promise.all([slugPromise, clearbitPromise]);

  // Prefer slug guess (free, no API dependency) over Clearbit
  if (slugResult) {
    return slugResult;
  }

  if (clearbitResult) {
    return clearbitResult;
  }

  // ── Step 5: Brave fallback (paid) — only if free methods failed ──
  if (effectiveBraveKey) {
    try {
      const braveRes = await fetch(
        "https://api.search.brave.com/res/v1/web/search?q=" +
          encodeURIComponent(trimmed + " official website") +
          "&count=3",
        {
          headers: { "X-Subscription-Token": effectiveBraveKey, Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (braveRes.ok) {
        const braveData = (await braveRes.json()) as {
          web?: { results?: Array<{ url?: string }> };
        };
        const firstUrl = braveData?.web?.results?.[0]?.url;
        if (firstUrl) {
          const braveDomain = normalizeDomain(firstUrl);
          if (braveDomain) {
            const { similarity, domainMatchRisk } = scoreDomainSimilarity(braveDomain, trimmed);
            if (similarity >= 0.5) {
              return { domain: braveDomain, source: "brave" as const, similarity, domainMatchRisk };
            }
          }
        }
      }
    } catch (error) {
      console.error(
        `[resolve-domain] Brave search failed for "${trimmed}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // ── Step 5: Return null (unresolved) ──
  return { domain: "", source: "unresolved" };
}

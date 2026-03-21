import type { EmailStatus } from "@/lib/types";

const WINNING_STATUSES = new Set<EmailStatus>(["valid", "safe_to_send", "catch_all"]);

export type ReoonVerification = {
  status?: string;
  [key: string]: unknown;
};

export function normalizeReoonStatus(status?: string): EmailStatus {
  if (status === "catchall" || status === "catch_all") {
    return "catch_all";
  }

  if (status === "valid" || status === "safe_to_send" || status === "invalid") {
    return status;
  }

  return status === "unknown" || status === "error" ? status : "unknown";
}

export async function verifyEmail(email: string, apiKey: string) {
  const url = new URL("https://emailverifier.reoon.com/api/v1/verify");
  url.searchParams.set("email", email);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("mode", "quick");

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Reoon request failed with ${response.status}`);
  }

  return (await response.json()) as ReoonVerification;
}

// Maximum number of Reoon verifications to run concurrently per lead.
// Firing all candidates at once would waste API credits when the first is valid,
// so we use a small wave size: start WAVE_SIZE requests concurrently, and as soon
// as any wave contains a winning status we skip the remaining waves entirely.
const VERIFY_WAVE_SIZE = 2;

export async function verifyCandidates(
  candidates: Array<{ email: string; pattern: string }>,
  apiKey: string,
) {
  const results: Array<{ email: string; pattern: string; status: EmailStatus; verification: ReoonVerification | null }> = [];

  // Process candidates in waves: fire up to VERIFY_WAVE_SIZE at once.
  // If a winner is found in a wave, skip the remaining waves entirely.
  for (let i = 0; i < candidates.length; i += VERIFY_WAVE_SIZE) {
    const wave = candidates.slice(i, i + VERIFY_WAVE_SIZE);

    const waveResults = await Promise.all(
      wave.map(async (candidate) => {
        try {
          const verification = await verifyEmail(candidate.email, apiKey);
          const status = normalizeReoonStatus(verification.status);
          return { ...candidate, status, verification };
        } catch {
          return {
            ...candidate,
            status: "error" as EmailStatus,
            verification: null,
          };
        }
      }),
    );

    results.push(...waveResults);

    // Early exit: stop burning API credits once we find a valid email
    const hasWinner = waveResults.some(
      (r) => r.status === "valid" || r.status === "safe_to_send",
    );
    if (hasWinner) {
      break;
    }

    // Early exit: if every result in this wave is catch_all, the domain
    // accepts all addresses — remaining candidates will also be catch_all.
    const allCatchAll = waveResults.length > 0 && waveResults.every(
      (r) => r.status === "catch_all",
    );
    if (allCatchAll) {
      break;
    }
  }

  return results;
}

const STATUS_PRIORITY: Record<string, number> = { valid: 0, safe_to_send: 1, catch_all: 2 };

export function pickBestVerification(
  results: Array<{ email: string; pattern: string; status: EmailStatus }>,
) {
  let best: (typeof results)[number] | null = null;
  let bestPriority = Infinity;

  for (const result of results) {
    const priority = STATUS_PRIORITY[result.status];
    if (priority != null && priority < bestPriority) {
      best = result;
      bestPriority = priority;
      if (priority === 0) break; // Can't do better than "valid"
    }
  }

  return best;
}

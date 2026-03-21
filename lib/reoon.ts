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
  }

  return results;
}

export function pickBestVerification(
  results: Array<{ email: string; pattern: string; status: EmailStatus }>,
) {
  for (const status of WINNING_STATUSES) {
    const winner = results.find((result) => result.status === status);
    if (winner) {
      return winner;
    }
  }

  return null;
}

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

export async function verifyCandidates(
  candidates: Array<{ email: string; pattern: string }>,
  apiKey: string,
) {
  const results: Array<{ email: string; pattern: string; status: EmailStatus; verification: ReoonVerification | null }> = [];

  for (const candidate of candidates) {
    try {
      const verification = await verifyEmail(candidate.email, apiKey);
      const status = normalizeReoonStatus(verification.status);
      results.push({ ...candidate, status, verification });

      // Early exit: stop burning API credits once we find a valid email
      if (status === "valid" || status === "safe_to_send") {
        break;
      }
    } catch {
      results.push({
        ...candidate,
        status: "error" as EmailStatus,
        verification: null,
      });
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

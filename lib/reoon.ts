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
  return Promise.all(
    candidates.map(async (candidate) => {
      try {
        const verification = await verifyEmail(candidate.email, apiKey);
        return {
          ...candidate,
          status: normalizeReoonStatus(verification.status),
          verification,
        };
      } catch {
        return {
          ...candidate,
          status: "error" as EmailStatus,
          verification: null,
        };
      }
    }),
  );
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

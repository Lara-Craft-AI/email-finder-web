const WINNING_STATUSES = new Set(["valid", "safe_to_send", "catchall"]);

export type ReoonVerification = {
  status?: string;
  [key: string]: unknown;
};

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
          status: verification.status ?? "unknown",
          verification,
        };
      } catch {
        return {
          ...candidate,
          status: "error",
          verification: null,
        };
      }
    }),
  );
}

export function pickBestVerification(
  results: Array<{ email: string; pattern: string; status: string }>,
) {
  for (const status of WINNING_STATUSES) {
    const winner = results.find((result) => result.status === status);
    if (winner) {
      return winner;
    }
  }

  return null;
}

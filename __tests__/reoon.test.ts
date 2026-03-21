// jest globals (describe, it, expect, beforeEach) are available automatically
const vi = {
  fn: jest.fn.bind(jest),
  stubGlobal: (name: string, val: unknown) => { (global as Record<string, unknown>)[name] = val; },
  restoreAllMocks: jest.restoreAllMocks.bind(jest),
};
import {
  normalizeReoonStatus,
  pickBestVerification,
  verifyEmail,
  verifyCandidates,
} from "@/lib/reoon";
import type { EmailStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// normalizeReoonStatus
// ---------------------------------------------------------------------------
describe("normalizeReoonStatus", () => {
  it.each([
    ["catchall", "catch_all"],
    ["catch_all", "catch_all"],
    ["valid", "valid"],
    ["safe_to_send", "safe_to_send"],
    ["invalid", "invalid"],
    ["unknown", "unknown"],
    ["error", "error"],
    [undefined, "unknown"],
    ["some_random_string", "unknown"],
  ] as const)("normalizes %s → %s", (input, expected) => {
    expect(normalizeReoonStatus(input as string | undefined)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// pickBestVerification
// ---------------------------------------------------------------------------
describe("pickBestVerification", () => {
  const make = (email: string, status: EmailStatus) => ({
    email,
    pattern: "first.last",
    status,
  });

  it("returns valid over safe_to_send and catch_all", () => {
    const results = [
      make("a@x.com", "catch_all"),
      make("b@x.com", "safe_to_send"),
      make("c@x.com", "valid"),
    ];
    expect(pickBestVerification(results)?.email).toBe("c@x.com");
  });

  it("returns safe_to_send over catch_all", () => {
    const results = [
      make("a@x.com", "catch_all"),
      make("b@x.com", "safe_to_send"),
    ];
    expect(pickBestVerification(results)?.email).toBe("b@x.com");
  });

  it("returns catch_all when no valid or safe_to_send", () => {
    const results = [
      make("a@x.com", "unknown"),
      make("b@x.com", "catch_all"),
    ];
    expect(pickBestVerification(results)?.email).toBe("b@x.com");
  });

  it("returns null when no winning status exists", () => {
    const results = [
      make("a@x.com", "unknown"),
      make("b@x.com", "error"),
      make("c@x.com", "invalid"),
    ];
    expect(pickBestVerification(results)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(pickBestVerification([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// verifyEmail
// ---------------------------------------------------------------------------
describe("verifyEmail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    const payload = { status: "valid", email: "a@x.com" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
      }),
    );

    const result = await verifyEmail("a@x.com", "key123");

    expect(result).toEqual(payload);
    expect(fetch).toHaveBeenCalledTimes(1);
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.get("email")).toBe("a@x.com");
    expect(calledUrl.searchParams.get("key")).toBe("key123");
    expect(calledUrl.searchParams.get("mode")).toBe("quick");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    );

    await expect(verifyEmail("a@x.com", "key")).rejects.toThrow(
      "Reoon request failed with 429",
    );
  });
});

// ---------------------------------------------------------------------------
// verifyCandidates
// ---------------------------------------------------------------------------
describe("verifyCandidates", () => {
  const candidates = [
    { email: "a@x.com", pattern: "first.last" },
    { email: "b@x.com", pattern: "flast" },
    { email: "c@x.com", pattern: "first" },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("stops early on valid", async () => {
    // Wave size is 2: candidates 0+1 fire in parallel, winner found → candidate 2 skipped.
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: "catch_all" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: "valid" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: "valid" }),
        }),
    );

    const results = await verifyCandidates(candidates, "key");

    // Wave 1 fires candidates 0+1; "valid" in wave 1 → wave 2 (candidate 2) skipped.
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("catch_all");
    expect(results[1].status).toBe("valid");
    // third candidate should never have been called
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops early on safe_to_send", async () => {
    // Wave size is 2: candidates 0+1 fire in parallel, winner found → candidate 2 skipped.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "safe_to_send" }),
      }),
    );

    const results = await verifyCandidates(candidates, "key");

    // Wave 1 fires candidates 0+1; both are safe_to_send winners → wave 2 skipped.
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("safe_to_send");
    expect(results[1].status).toBe("safe_to_send");
    // Only the first wave (2 candidates) should have been called
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("continues on catch_all and unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: "catch_all" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: "unknown" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: "invalid" }),
        }),
    );

    const results = await verifyCandidates(candidates, "key");

    expect(results).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("catches errors and records status as error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: "valid" }),
        }),
    );

    const results = await verifyCandidates(candidates.slice(0, 2), "key");

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("error");
    expect(results[0].verification).toBeNull();
    expect(results[1].status).toBe("valid");
  });
});

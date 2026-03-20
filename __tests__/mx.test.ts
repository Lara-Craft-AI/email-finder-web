import { getMxProfile } from "@/lib/mx";

// Mock the dns/promises module
jest.mock("node:dns/promises", () => ({
  resolveMx: jest.fn(),
}));

import { resolveMx } from "node:dns/promises";

const mockResolveMx = resolveMx as jest.MockedFunction<typeof resolveMx>;

beforeEach(() => {
  mockResolveMx.mockReset();
});

describe("getMxProfile", () => {
  it("detects Google MX provider", async () => {
    mockResolveMx.mockResolvedValueOnce([
      { exchange: "aspmx.l.google.com", priority: 1 },
      { exchange: "alt1.aspmx.l.google.com", priority: 5 },
    ]);

    const result = await getMxProfile("acme.com");
    expect(result.hasMx).toBe(true);
    expect(result.mxProvider).toBe("google");
  });

  it("detects Microsoft MX provider", async () => {
    mockResolveMx.mockResolvedValueOnce([
      { exchange: "acme-com.mail.protection.outlook.com", priority: 0 },
    ]);

    const result = await getMxProfile("acme.com");
    expect(result.hasMx).toBe(true);
    expect(result.mxProvider).toBe("microsoft");
  });

  it("detects Google via googlemail.com marker", async () => {
    mockResolveMx.mockResolvedValueOnce([
      { exchange: "mx.googlemail.com", priority: 10 },
    ]);

    const result = await getMxProfile("example.com");
    expect(result.hasMx).toBe(true);
    expect(result.mxProvider).toBe("google");
  });

  it("returns custom for non-Google/Microsoft MX", async () => {
    mockResolveMx.mockResolvedValueOnce([
      { exchange: "mx1.protonmail.ch", priority: 10 },
      { exchange: "mx2.protonmail.ch", priority: 20 },
    ]);

    const result = await getMxProfile("example.com");
    expect(result.hasMx).toBe(true);
    expect(result.mxProvider).toBe("custom");
  });

  it("returns hasMx=false when DNS lookup fails", async () => {
    mockResolveMx.mockRejectedValueOnce(new Error("ENOTFOUND"));

    const result = await getMxProfile("nonexistent.example");
    expect(result.hasMx).toBe(false);
    expect(result.mxProvider).toBeNull();
  });

  it("returns hasMx=false for empty domain", async () => {
    const result = await getMxProfile("");
    expect(result.hasMx).toBe(false);
    expect(result.mxProvider).toBeNull();
    // Should not even call resolveMx
    expect(mockResolveMx).not.toHaveBeenCalled();
  });

  it("returns hasMx=false for whitespace-only domain", async () => {
    const result = await getMxProfile("   ");
    expect(result.hasMx).toBe(false);
    expect(result.mxProvider).toBeNull();
    expect(mockResolveMx).not.toHaveBeenCalled();
  });

  it("is case-insensitive for MX exchange matching", async () => {
    mockResolveMx.mockResolvedValueOnce([
      { exchange: "ASPMX.L.GOOGLE.COM", priority: 1 },
    ]);

    const result = await getMxProfile("example.com");
    expect(result.mxProvider).toBe("google");
  });

  it("handles empty MX records array", async () => {
    mockResolveMx.mockResolvedValueOnce([]);

    const result = await getMxProfile("example.com");
    // records.length > 0 check — empty array means no MX
    expect(result.hasMx).toBe(false);
    expect(result.mxProvider).toBe("custom");
    // Note: The code returns mxProvider="custom" even for empty records
    // because it falls through the provider checks. hasMx is false though.
  });
});

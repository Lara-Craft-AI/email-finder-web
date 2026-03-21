import {
  processLeadBatch,
  createBatchProcessingContext,
  MAX_BATCH_SIZE,
  MAX_REOON_CONCURRENCY,
} from "@/lib/find-emails";
import type { LeadInput } from "@/lib/types";

describe("constants", () => {
  it("MAX_BATCH_SIZE is 20", () => {
    expect(MAX_BATCH_SIZE).toBe(20);
  });

  it("MAX_REOON_CONCURRENCY is 25", () => {
    expect(MAX_REOON_CONCURRENCY).toBe(25);
  });
});

describe("createBatchProcessingContext", () => {
  it("returns empty domain and mx caches", () => {
    const ctx = createBatchProcessingContext();
    expect(ctx.domainCache).toBeInstanceOf(Map);
    expect(ctx.mxCache).toBeInstanceOf(Map);
    expect(ctx.domainCache.size).toBe(0);
    expect(ctx.mxCache.size).toBe(0);
  });
});

describe("processLeadBatch (mock mode)", () => {
  const leads: LeadInput[] = [
    { name: "Alice Smith", company: "Acme" },
    { name: "Bob Jones", company: "Acme" },
    { name: "Carol Brown", company: "Globex" },
  ];

  it("returns one result per lead", async () => {
    const results = await processLeadBatch({
      leads,
      reoonApiKey: "",
      mockMode: true,
    });
    expect(results).toHaveLength(3);
  });

  it("preserves lead order in results", async () => {
    const results = await processLeadBatch({
      leads,
      reoonApiKey: "",
      mockMode: true,
    });
    expect(results[0].name).toBe("Alice Smith");
    expect(results[1].name).toBe("Bob Jones");
    expect(results[2].name).toBe("Carol Brown");
  });

  it("calls onResult callback for each lead", async () => {
    const received: number[] = [];
    await processLeadBatch({
      leads,
      reoonApiKey: "",
      mockMode: true,
      onResult: (_result, index) => {
        received.push(index);
      },
    });
    expect(received.sort()).toEqual([0, 1, 2]);
  });

  it("applies offset to mock mode determinism", async () => {
    // index 19 mod 20 = 19 → catch_all
    const results = await processLeadBatch({
      leads: [leads[0]],
      reoonApiKey: "",
      mockMode: true,
      offset: 19,
    });
    expect(results[0].status).toBe("catch_all");
  });

  it("shares context across calls for domain caching", async () => {
    const ctx = createBatchProcessingContext();
    await processLeadBatch({
      leads: [leads[0]],
      reoonApiKey: "",
      mockMode: true,
      context: ctx,
    });
    await processLeadBatch({
      leads: [leads[1]],
      reoonApiKey: "",
      mockMode: true,
      context: ctx,
    });
    // Context was passed but mock mode doesn't use domain cache,
    // just verify it doesn't throw
    expect(ctx.domainCache).toBeInstanceOf(Map);
  });

  it("handles empty leads array", async () => {
    const results = await processLeadBatch({
      leads: [],
      reoonApiKey: "",
      mockMode: true,
    });
    expect(results).toHaveLength(0);
  });
});

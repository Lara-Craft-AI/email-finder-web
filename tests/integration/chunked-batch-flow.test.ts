import { POST } from "@/app/api/find-emails/batch/route";
import { POST as POST_STREAM } from "@/app/api/find-emails/route";
import type { EmailResult, LeadInput } from "@/lib/types";

const BATCH_SIZE = 20;

function generateLeads(count: number): LeadInput[] {
  const firstNames = [
    "Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Hank",
    "Ivy", "Jack", "Karen", "Leo", "Mona", "Nate", "Olive", "Paul",
    "Quinn", "Rita", "Sam", "Tina",
  ];
  const lastNames = [
    "Smith", "Jones", "Brown", "Davis", "Wilson", "Moore", "Taylor",
    "Anderson", "Thomas", "Jackson",
  ];
  const companies = [
    "Acme", "Globex", "Initech", "Hooli", "Pied Piper",
  ];

  return Array.from({ length: count }, (_, i) => ({
    name: `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
    company: companies[i % companies.length],
  }));
}

function chunkLeads(leads: LeadInput[], size: number): LeadInput[][] {
  const chunks: LeadInput[][] = [];
  for (let i = 0; i < leads.length; i += size) {
    chunks.push(leads.slice(i, i + size));
  }
  return chunks;
}

type SseMessage = { event: string; data: unknown };

async function readSseStream(response: Response): Promise<SseMessage[]> {
  const messages: SseMessage[] = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop()!;

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const lines = chunk.split("\n");
      let event = "";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (event && data) {
        messages.push({ event, data: JSON.parse(data) });
      }
    }
  }

  if (buffer.trim()) {
    const lines = buffer.split("\n");
    let event = "";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (event && data) {
      messages.push({ event, data: JSON.parse(data) });
    }
  }

  return messages;
}

const LEAD_COUNT = 100;

describe("Chunked batch flow – 100 leads", () => {
  const leads = generateLeads(LEAD_COUNT);

  it("processes all 100 leads through chunked batch requests", async () => {
    const chunks = chunkLeads(leads, BATCH_SIZE);
    expect(chunks).toHaveLength(5);

    const allResults: EmailResult[] = [];
    const progressSnapshots: number[] = [];

    for (const [batchIndex, chunk] of chunks.entries()) {
      const request = new Request("http://localhost/api/find-emails/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: chunk,
          mock: true,
          offset: batchIndex * BATCH_SIZE,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const results = (await response.json()) as EmailResult[];
      expect(results).toHaveLength(chunk.length);

      allResults.push(...results);
      progressSnapshots.push(allResults.length);
    }

    // All 100 leads processed
    expect(allResults).toHaveLength(LEAD_COUNT);

    // Progress incremented smoothly (20, 40, 60, 80, 100)
    expect(progressSnapshots).toEqual([20, 40, 60, 80, 100]);

    // No leads stuck with empty name/company
    for (const result of allResults) {
      expect(result.name).toBeTruthy();
      expect(result.company).toBeTruthy();
    }

    // Every lead has a resolved status (not stuck in processing)
    const validStatuses = ["valid", "not_found", "catch_all", "safe_to_send", "invalid", "unresolved_domain", "unknown", "error"];
    for (const result of allResults) {
      expect(validStatuses).toContain(result.status);
    }

    // Status distribution matches mock expectations
    const validCount = allResults.filter((r) => r.status === "valid").length;
    const notFoundCount = allResults.filter((r) => r.status === "not_found").length;
    const catchAllCount = allResults.filter((r) => r.status === "catch_all").length;

    expect(validCount).toBe(80); // 80% of 100
    expect(notFoundCount).toBe(15); // 15% of 100
    expect(catchAllCount).toBe(5); // 5% of 100
  });

  it("SSE streaming delivers continuous per-lead progress events", async () => {
    const request = new Request("http://localhost/api/find-emails?mock=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads, mock: true }),
    });

    const response = await POST_STREAM(request);
    expect(response.status).toBe(200);

    const messages = await readSseStream(response);

    const progressEvents = messages.filter((m) => m.event === "progress");
    const resultEvents = messages.filter((m) => m.event === "result");
    const completeEvents = messages.filter((m) => m.event === "complete");
    const errorEvents = messages.filter((m) => m.event === "error");

    // No errors
    expect(errorEvents).toHaveLength(0);

    // One progress event per lead (continuous, not batch-level)
    expect(progressEvents).toHaveLength(LEAD_COUNT);

    // One result per lead
    expect(resultEvents).toHaveLength(LEAD_COUNT);

    // Progress counter increments smoothly (never skips)
    let prev = 0;
    for (const msg of progressEvents) {
      const p = msg.data as { current: number; total: number; name: string };
      expect(p.current).toBeGreaterThan(prev - 1); // allows concurrent out-of-order but never backwards
      expect(p.current).toBeGreaterThanOrEqual(1);
      expect(p.current).toBeLessThanOrEqual(LEAD_COUNT);
      expect(p.total).toBe(LEAD_COUNT);
      expect(p.name).toBeTruthy(); // every progress event includes the lead name
      prev = p.current;
    }

    // Final progress event reaches 100
    const lastProgress = progressEvents[progressEvents.length - 1].data as { current: number };
    expect(lastProgress.current).toBe(LEAD_COUNT);

    // Complete event fires exactly once
    expect(completeEvents).toHaveLength(1);

    // Complete event contains all results
    const completeData = completeEvents[0].data as { results: EmailResult[] };
    expect(completeData.results).toHaveLength(LEAD_COUNT);

    // No leads stuck in "Processing batch" state — all have final statuses
    for (const msg of resultEvents) {
      const r = msg.data as EmailResult;
      expect(r.status).toBeDefined();
      expect(["valid", "not_found", "catch_all"]).toContain(r.status);
    }
  }, 30_000);
});

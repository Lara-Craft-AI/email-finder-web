import { POST } from "@/app/api/find-emails/route";
import type { EmailResult, LeadInput } from "@/lib/types";

function generateLeads(count: number): LeadInput[] {
  const firstNames = [
    "Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Hank",
    "Ivy", "Jack", "Karen", "Leo", "Mona", "Nate", "Olive", "Paul",
    "Quinn", "Rita", "Sam", "Tina", "Uma", "Vic", "Wendy", "Xander",
    "Yuki", "Zane",
  ];
  const lastNames = [
    "Smith", "Jones", "Brown", "Davis", "Wilson", "Moore", "Taylor",
    "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin",
    "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Lewis",
    "Lee", "Walker", "Hall", "Allen", "Young", "King", "Wright",
  ];
  const companies = [
    "Acme", "Globex", "Initech", "Hooli", "Pied Piper", "Stark Industries",
    "Wayne Enterprises", "Umbrella Corp", "Cyberdyne", "Soylent",
    "Weyland Yutani", "Tyrell Corp", "Oscorp", "LexCorp", "Massive Dynamic",
    "Aperture Science", "Black Mesa", "Abstergo", "Vought International",
    "Delos", "InGen", "Wonka Industries", "Prestige Worldwide", "Vandelay",
    "Sterling Cooper", "Dunder Mifflin", "Sabre", "Athlead", "Bluth Company",
    "Bluths Original Frozen Banana", "Arrested Development", "Paddy's Pub",
    "Wernham Hogg", "Scofield Enterprises", "Oceanic Airlines", "Dharma Initiative",
    "Hanso Foundation", "Luthor Corp", "Queen Consolidated", "Palmer Technologies",
  ];

  const leads: LeadInput[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count; i++) {
    // Generate unique name+company combos deterministically
    const fi = i % firstNames.length;
    const li = Math.floor(i / firstNames.length) % lastNames.length;
    const ci = Math.floor(i / (firstNames.length * lastNames.length)) % companies.length;
    // Add numeric suffix to guarantee uniqueness for large counts
    const suffix = Math.floor(i / (firstNames.length * lastNames.length * companies.length));
    const name = suffix > 0 ? `${firstNames[fi]} ${lastNames[li]} ${suffix}` : `${firstNames[fi]} ${lastNames[li]}`;
    const company = companies[ci];

    const key = `${name}::${company}`;
    if (seen.has(key)) {
      // Fallback: use index-based unique name
      const uniqueName = `Lead${i} Person${i}`;
      const uniqueCompany = `Company${i}`;
      leads.push({ name: uniqueName, company: uniqueCompany });
    } else {
      seen.add(key);
      leads.push({ name, company });
    }
  }

  return leads;
}

type SseMessage = {
  event: string;
  data: unknown;
};

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
    // Keep the last (possibly incomplete) chunk in the buffer
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

  // Process any remaining buffer
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

const LEAD_COUNT = 4000;

describe("Large batch mock integration", () => {
  const leads = generateLeads(LEAD_COUNT);

  it(`processes ${LEAD_COUNT} leads via mock mode`, async () => {
    const request = new Request("http://localhost/api/find-emails?mock=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads, mock: true }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const messages = await readSseStream(response);

    // Extract events by type
    const startEvents = messages.filter((m) => m.event === "start");
    const progressEvents = messages.filter((m) => m.event === "progress");
    const resultEvents = messages.filter((m) => m.event === "result");
    const completeEvents = messages.filter((m) => m.event === "complete");
    const errorEvents = messages.filter((m) => m.event === "error");

    // No error events
    expect(errorEvents).toHaveLength(0);

    // Total result events should equal LEAD_COUNT
    expect(resultEvents).toHaveLength(LEAD_COUNT);

    // No duplicate name+company combos in results
    const resultKeys = new Set<string>();
    for (const msg of resultEvents) {
      const r = msg.data as EmailResult;
      const key = `${r.name}::${r.company}`;
      expect(resultKeys.has(key)).toBe(false);
      resultKeys.add(key);
    }

    // Progress counter never goes backwards
    let maxProgress = 0;
    for (const msg of progressEvents) {
      const p = msg.data as { current: number; total: number };
      expect(p.current).toBeGreaterThanOrEqual(maxProgress);
      maxProgress = p.current;
    }

    // Complete event fires exactly once
    expect(completeEvents).toHaveLength(1);

    // Start event fires exactly once with correct total
    expect(startEvents).toHaveLength(1);
    expect((startEvents[0].data as { total: number }).total).toBe(LEAD_COUNT);

    // Verify status distribution is roughly correct (with some tolerance)
    const statuses = resultEvents.map((m) => (m.data as EmailResult).status);
    const validCount = statuses.filter((s) => s === "valid").length;
    const notFoundCount = statuses.filter((s) => s === "not_found").length;
    const catchAllCount = statuses.filter((s) => s === "catch_all").length;

    // Allow ±10% tolerance on distribution
    expect(validCount).toBeGreaterThan(LEAD_COUNT * 0.6);
    expect(validCount).toBeLessThan(LEAD_COUNT * 0.95);
    expect(notFoundCount + catchAllCount + validCount).toBe(LEAD_COUNT);
  }, 120_000);
});

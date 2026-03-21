import { POST } from "@/app/api/find-emails/route";

function makeRequest(body: unknown, queryString = "") {
  return new Request(
    `http://localhost/api/find-emails${queryString}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

async function readSseEvents(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<{ event: string; data: unknown }> = [];

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
      if (event && data) events.push({ event, data: JSON.parse(data) });
    }
  }
  return events;
}

describe("POST /api/find-emails — validation", () => {
  it("returns 400 when leads is empty", async () => {
    const res = await POST(makeRequest({ leads: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least one lead/i);
  });

  it("returns 400 when leads is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when reoonApiKey missing and not mock", async () => {
    const leads = [{ name: "A", company: "B" }];
    const res = await POST(makeRequest({ leads }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/reoon api key/i);
  });

  it("returns SSE stream with correct content-type in mock mode", async () => {
    const leads = [{ name: "John Smith", company: "Acme" }];
    const res = await POST(makeRequest({ leads, mock: true }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  });

  it("accepts mock=true via query string", async () => {
    const leads = [{ name: "John Smith", company: "Acme" }];
    const res = await POST(makeRequest({ leads }, "?mock=true"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  });
});

describe("POST /api/find-emails — SSE events (mock)", () => {
  it("emits start, progress, result, and complete events", async () => {
    const leads = [
      { name: "Alice Smith", company: "Acme" },
      { name: "Bob Jones", company: "Globex" },
    ];
    const res = await POST(makeRequest({ leads, mock: true }));
    const events = await readSseEvents(res);

    const types = events.map((e) => e.event);
    expect(types).toContain("start");
    expect(types).toContain("progress");
    expect(types).toContain("result");
    expect(types).toContain("complete");
    expect(types).not.toContain("error");
  });

  it("start event contains total count", async () => {
    const leads = [{ name: "A B", company: "C" }];
    const res = await POST(makeRequest({ leads, mock: true }));
    const events = await readSseEvents(res);

    const start = events.find((e) => e.event === "start");
    expect(start).toBeDefined();
    expect((start!.data as { total: number }).total).toBe(1);
  });

  it("complete event contains all results", async () => {
    const leads = [
      { name: "A B", company: "C" },
      { name: "D E", company: "F" },
    ];
    const res = await POST(makeRequest({ leads, mock: true }));
    const events = await readSseEvents(res);

    const complete = events.find((e) => e.event === "complete");
    expect(complete).toBeDefined();
    const results = (complete!.data as { results: unknown[] }).results;
    expect(results).toHaveLength(2);
  });

  it("progress events include lead name", async () => {
    const leads = [{ name: "Jane Doe", company: "Widget" }];
    const res = await POST(makeRequest({ leads, mock: true }));
    const events = await readSseEvents(res);

    const progress = events.filter((e) => e.event === "progress");
    expect(progress).toHaveLength(1);
    expect((progress[0].data as { name: string }).name).toBe("Jane Doe");
  });
});

import { POST } from "@/app/api/find-emails/batch/route";

function makeRequest(body: unknown, queryString = "") {
  return new Request(
    `http://localhost/api/find-emails/batch${queryString}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/find-emails/batch — validation", () => {
  it("returns 400 when leads is empty", async () => {
    const res = await POST(makeRequest({ leads: [], mock: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least one lead/i);
  });

  it("returns 400 when leads is missing", async () => {
    const res = await POST(makeRequest({ mock: true }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when leads is not an array", async () => {
    const res = await POST(makeRequest({ leads: "not-array", mock: true }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when batch exceeds MAX_BATCH_SIZE", async () => {
    const leads = Array.from({ length: 21 }, (_, i) => ({
      name: `N${i}`,
      company: `C${i}`,
    }));
    const res = await POST(makeRequest({ leads, mock: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at most 20/);
  });

  it("returns 400 when reoonApiKey missing and not mock mode", async () => {
    const leads = [{ name: "A", company: "B" }];
    const res = await POST(makeRequest({ leads }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/reoon api key/i);
  });

  it("accepts mock=true via query string", async () => {
    const leads = [{ name: "A B", company: "C" }];
    const res = await POST(makeRequest({ leads }, "?mock=true"));
    expect(res.status).toBe(200);
  });

  it("returns 200 with results for valid mock batch", async () => {
    const leads = [{ name: "John Smith", company: "Acme" }];
    const res = await POST(makeRequest({ leads, mock: true }));
    expect(res.status).toBe(200);
    const results = await res.json();
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("John Smith");
  });

  it("passes extended flag through to processLeadBatch", async () => {
    const leads = [{ name: "John Smith", company: "Acme" }];
    const res = await POST(
      makeRequest({ leads, mock: true, extended: true }),
    );
    expect(res.status).toBe(200);
  });

  it("handles offset parameter", async () => {
    const leads = [{ name: "John Smith", company: "Acme" }];
    // offset=19 → bucket 19 → catch_all
    const res = await POST(
      makeRequest({ leads, mock: true, offset: 19 }),
    );
    expect(res.status).toBe(200);
    const [result] = await res.json();
    expect(result.status).toBe("catch_all");
  });

  it("defaults offset to 0 for negative values", async () => {
    const leads = [{ name: "John Smith", company: "Acme" }];
    const res = await POST(
      makeRequest({ leads, mock: true, offset: -5 }),
    );
    expect(res.status).toBe(200);
    const [result] = await res.json();
    // offset defaults to 0, bucket 0 → valid
    expect(result.status).toBe("valid");
  });
});

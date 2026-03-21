import { POST } from "@/app/api/find-emails/batch/route";
import type { EmailResult, LeadInput } from "@/lib/types";

function generateLeads(count: number): LeadInput[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Lead ${index}`,
    company: `Company ${index}`,
  }));
}

describe("Batch route", () => {
  it("returns mock results for a valid batch", async () => {
    const leads = generateLeads(20);
    const request = new Request("http://localhost/api/find-emails/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads, mock: true }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);

    const results = (await response.json()) as EmailResult[];
    expect(results).toHaveLength(20);
    expect(results[0].name).toBe(leads[0].name);
    expect(results[0].company).toBe(leads[0].company);
  });

  it("rejects batches larger than 20 leads", async () => {
    const request = new Request("http://localhost/api/find-emails/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads: generateLeads(21), mock: true }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A batch can include at most 20 leads.",
    });
  });

  it("keeps mock mode deterministic across chunk offsets", async () => {
    const leads = generateLeads(1);
    const request = new Request("http://localhost/api/find-emails/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads, mock: true, offset: 19 }),
    });

    const response = await POST(request);
    const [result] = (await response.json()) as EmailResult[];

    expect(response.status).toBe(200);
    expect(result.status).toBe("catch_all");
  });
});

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns 200 with ok: true", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
  });
});

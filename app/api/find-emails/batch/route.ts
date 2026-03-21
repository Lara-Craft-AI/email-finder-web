import { MAX_BATCH_SIZE, processLeadBatch } from "@/lib/find-emails";
import type { LeadInput } from "@/lib/types";

export const maxDuration = 300;

type BatchRequestBody = {
  leads?: LeadInput[];
  reoonApiKey?: string;
  braveApiKey?: string;
  mock?: boolean;
  extended?: boolean;
  offset?: number;
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json()) as BatchRequestBody;

  const leads = Array.isArray(body.leads) ? body.leads : [];
  const mockMode = body.mock === true || url.searchParams.get("mock") === "true" || process.env.MOCK_API === "true";
  const reoonApiKey = body.reoonApiKey?.trim() ?? "";
  const braveApiKey = body.braveApiKey?.trim() || undefined;
  const extended = body.extended === true;
  const offset = Number.isInteger(body.offset) && (body.offset ?? 0) >= 0 ? (body.offset ?? 0) : 0;

  if (!leads.length) {
    return Response.json({ error: "At least one lead is required." }, { status: 400 });
  }

  if (leads.length > MAX_BATCH_SIZE) {
    return Response.json(
      { error: `A batch can include at most ${MAX_BATCH_SIZE} leads.` },
      { status: 400 },
    );
  }

  if (!mockMode && !reoonApiKey) {
    return Response.json({ error: "Reoon API key is required." }, { status: 400 });
  }

  try {
    const results = await processLeadBatch({
      leads,
      reoonApiKey,
      braveApiKey,
      mockMode,
      extended,
      offset,
    });

    return Response.json(results);
  } catch (error) {
    console.error("[find-emails/batch] Batch error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}

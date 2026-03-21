import { createBatchProcessingContext, processLeadBatch } from "@/lib/find-emails";
import type { EmailResult, LeadInput } from "@/lib/types";

export const maxDuration = 300; // 5 minutes — required for large CSV processing on Vercel

const encoder = new TextEncoder();

function sseEvent(type: string, data: unknown) {
  return encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json()) as {
    leads?: LeadInput[];
    reoonApiKey?: string;
    braveApiKey?: string;
    mock?: boolean;
  };

  const leads = Array.isArray(body.leads) ? body.leads : [];
  const mockMode = body.mock === true || url.searchParams.get("mock") === "true" || process.env.MOCK_API === "true";
  const reoonApiKey = body.reoonApiKey?.trim() ?? "";
  const braveApiKey = body.braveApiKey?.trim() || undefined;

  if (!leads.length) {
    return Response.json({ error: "At least one lead is required." }, { status: 400 });
  }

  if (!mockMode && !reoonApiKey) {
    return Response.json({ error: "Reoon API key is required." }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const results: EmailResult[] = new Array(leads.length);
      const context = createBatchProcessingContext();
      let completed = 0;

      try {
        controller.enqueue(sseEvent("start", { total: leads.length }));

        if (mockMode) {
          await processLeadBatch({
            leads,
            reoonApiKey,
            mockMode: true,
            onResult: (result, index) => {
              results[index] = result;
              completed += 1;

              controller.enqueue(
                sseEvent("progress", {
                  current: completed,
                  total: leads.length,
                  name: leads[index].name,
                }),
              );
              controller.enqueue(sseEvent("result", result));
            },
          });
        } else {
          await processLeadBatch({
            leads,
            reoonApiKey,
            braveApiKey,
            context,
            onResult: (result, index) => {
              results[index] = result;
              completed += 1;

              controller.enqueue(
                sseEvent("progress", {
                  current: completed,
                  total: leads.length,
                  name: leads[index].name,
                }),
              );
              controller.enqueue(sseEvent("result", result));
            },
          });

          // Second pass: retry not_found leads with extended permutations
          const notFoundIndices = results
            .map((r, i) => (r.status === "not_found" ? i : -1))
            .filter((i) => i !== -1);

          if (notFoundIndices.length > 0) {
            controller.enqueue(
              sseEvent("second_pass_start", { count: notFoundIndices.length }),
            );

            let secondCompleted = 0;
            const secondPassLeads = notFoundIndices.map((index) => leads[index]);

            await processLeadBatch({
              leads: secondPassLeads,
              reoonApiKey,
              braveApiKey,
              extended: true,
              context,
              onResult: (result, secondIndex) => {
                const originalIndex = notFoundIndices[secondIndex];
                results[originalIndex] = result;
                secondCompleted += 1;

                controller.enqueue(
                  sseEvent("progress", {
                    current: secondCompleted,
                    total: notFoundIndices.length,
                    name: leads[originalIndex].name,
                  }),
                );
                controller.enqueue(sseEvent("result", result));
              },
            });
          }
        }

        controller.enqueue(sseEvent("complete", { results }));
        controller.close();
      } catch (error) {
        console.error("[find-emails] Stream error:", error);
        try {
          controller.enqueue(
            sseEvent("error", {
              message: error instanceof Error ? error.message : "Unexpected error",
            }),
          );
        } catch {
          // Client likely disconnected — enqueue failed, nothing to send
        }
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

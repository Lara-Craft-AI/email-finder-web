import { permuteEmails } from "@/lib/permute";
import { pickBestVerification, verifyCandidates } from "@/lib/reoon";
import { resolveDomain } from "@/lib/resolve-domain";
import type { EmailResult, LeadInput } from "@/lib/types";

const encoder = new TextEncoder();
const MAX_CONCURRENCY = 25;

function sseEvent(type: string, data: unknown) {
  return encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

function createLimiter(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  return async function limit<T>(task: () => Promise<T>) {
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    }

    activeCount += 1;

    try {
      return await task();
    } finally {
      activeCount -= 1;
      queue.shift()?.();
    }
  };
}

async function processLead(
  lead: LeadInput,
  reoonApiKey: string,
  domainCache: Map<string, Promise<string>>,
  extended = false,
) {
  const trimmedCompany = lead.company.trim();
  let domainPromise = domainCache.get(trimmedCompany);

  if (!domainPromise) {
    domainPromise = resolveDomain(lead.company).then((resolution) => resolution.domain);
    domainCache.set(trimmedCompany, domainPromise);
  }

  const domain = await domainPromise;
  const candidates = permuteEmails(lead.name, domain, extended);
  const verifications = candidates.length ? await verifyCandidates(candidates, reoonApiKey) : [];
  const winner = pickBestVerification(verifications);
  const fallbackStatus = domain ? "not_found" : "unresolved_domain";

  return {
    name: lead.name,
    company: lead.company,
    domain,
    email: winner?.email ?? "",
    pattern: winner?.pattern ?? "",
    status: winner?.status ?? fallbackStatus,
  } satisfies EmailResult;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    leads?: LeadInput[];
    reoonApiKey?: string;
  };

  const leads = Array.isArray(body.leads) ? body.leads : [];
  const reoonApiKey = body.reoonApiKey?.trim() ?? "";

  if (!leads.length) {
    return Response.json({ error: "At least one lead is required." }, { status: 400 });
  }

  if (!reoonApiKey) {
    return Response.json({ error: "Reoon API key is required." }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const results: EmailResult[] = new Array(leads.length);
      const domainCache = new Map<string, Promise<string>>();
      const limit = createLimiter(MAX_CONCURRENCY);
      let completed = 0;

      try {
        controller.enqueue(sseEvent("start", { total: leads.length }));

        await Promise.all(
          leads.map((lead, index) =>
            limit(async () => {
              const result = await processLead(lead, reoonApiKey, domainCache);
              results[index] = result;
              completed += 1;

              controller.enqueue(
                sseEvent("progress", {
                  current: completed,
                  total: leads.length,
                  name: lead.name,
                }),
              );
              controller.enqueue(sseEvent("result", result));
            }),
          ),
        );

        // Second pass: retry not_found leads with extended permutations
        const notFoundIndices = results
          .map((r, i) => (r.status === "not_found" ? i : -1))
          .filter((i) => i !== -1);

        if (notFoundIndices.length > 0) {
          controller.enqueue(
            sseEvent("second_pass_start", { count: notFoundIndices.length }),
          );

          let secondCompleted = 0;

          await Promise.all(
            notFoundIndices.map((index) =>
              limit(async () => {
                const lead = leads[index];
                const result = await processLead(lead, reoonApiKey, domainCache, true);
                results[index] = result;
                secondCompleted += 1;

                controller.enqueue(
                  sseEvent("progress", {
                    current: secondCompleted,
                    total: notFoundIndices.length,
                    name: lead.name,
                  }),
                );
                controller.enqueue(sseEvent("result", result));
              }),
            ),
          );
        }

        controller.enqueue(sseEvent("complete", { results }));
        controller.close();
      } catch (error) {
        controller.enqueue(
          sseEvent("error", {
            message: error instanceof Error ? error.message : "Unexpected error",
          }),
        );
        controller.close();
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

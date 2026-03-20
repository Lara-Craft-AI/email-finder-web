import { permuteEmails } from "@/lib/permute";
import { pickBestVerification, verifyCandidates } from "@/lib/reoon";
import { resolveDomain } from "@/lib/resolve-domain";
import type { EmailResult, LeadInput } from "@/lib/types";

const encoder = new TextEncoder();

function sseEvent(type: string, data: unknown) {
  return encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
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
      const results: EmailResult[] = [];
      const domainCache = new Map<string, string>();

      try {
        controller.enqueue(sseEvent("start", { total: leads.length }));

        for (let index = 0; index < leads.length; index += 1) {
          const lead = leads[index];

          controller.enqueue(
            sseEvent("progress", {
              current: index + 1,
              total: leads.length,
              name: lead.name,
            }),
          );

          let domain = domainCache.get(lead.company) ?? "";
          if (!domain) {
            const resolution = await resolveDomain(lead.company);
            domain = resolution.domain;
            if (domain) {
              domainCache.set(lead.company, domain);
            }
          }

          const candidates = permuteEmails(lead.name, domain);
          const verifications = candidates.length
            ? await verifyCandidates(candidates, reoonApiKey)
            : [];
          const winner = pickBestVerification(verifications);
          const fallbackStatus = domain ? "not_found" : "unresolved_domain";

          const result: EmailResult = {
            name: lead.name,
            company: lead.company,
            domain,
            email: winner?.email ?? "",
            pattern: winner?.pattern ?? "",
            status: winner?.status ?? fallbackStatus,
          };

          results.push(result);
          controller.enqueue(sseEvent("result", result));
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

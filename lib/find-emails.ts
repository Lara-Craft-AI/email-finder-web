import { isRoleBasedEmail, scoreDomainSimilarity, scoreEmailQuality } from "@/lib/email-quality";
import { processMockLead } from "@/lib/mock";
import { getMxProfile } from "@/lib/mx";
import { permuteEmails } from "@/lib/permute";
import { pickBestVerification, verifyCandidates } from "@/lib/reoon";
import { resolveDomain } from "@/lib/resolve-domain";
import type { EmailResult, LeadInput } from "@/lib/types";

export const MAX_REOON_CONCURRENCY = 25;
export const MAX_BATCH_SIZE = 20;

type DomainCache = Map<string, Promise<string>>;
type MxCache = Map<string, Promise<Awaited<ReturnType<typeof getMxProfile>>>>;

export type BatchProcessingContext = {
  domainCache: DomainCache;
  mxCache: MxCache;
};

type ProcessLeadBatchOptions = {
  leads: LeadInput[];
  reoonApiKey: string;
  braveApiKey?: string;
  mockMode?: boolean;
  extended?: boolean;
  offset?: number;
  context?: BatchProcessingContext;
  onResult?: (result: EmailResult, index: number) => void | Promise<void>;
};

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
  domainCache: DomainCache,
  mxCache: MxCache,
  extended = false,
  braveApiKey?: string,
) {
  const trimmedCompany = lead.company.trim();
  let domainPromise = domainCache.get(trimmedCompany);

  if (!domainPromise) {
    domainPromise = resolveDomain(lead.company, braveApiKey).then((resolution) => resolution.domain);
    domainCache.set(trimmedCompany, domainPromise);
  }

  const domain = await domainPromise;
  let mxPromise = mxCache.get(domain);

  if (!mxPromise) {
    mxPromise = getMxProfile(domain);
    mxCache.set(domain, mxPromise);
  }

  const mxProfile = await mxPromise;
  const { similarity, domainMatchRisk } = scoreDomainSimilarity(domain, lead.company);
  const fallbackStatus = !domain || !mxProfile.hasMx ? "unresolved_domain" : "not_found";

  if (!domain || !mxProfile.hasMx) {
    return {
      name: lead.name,
      company: lead.company,
      domain,
      email: "",
      pattern: "",
      status: fallbackStatus,
      domain_match_risk: domainMatchRisk,
      mx_provider: mxProfile.mxProvider,
      grade: null,
      confidence_score: 0,
    } satisfies EmailResult;
  }

  const candidates = permuteEmails(lead.name, domain, extended);
  const verifications = candidates.length ? await verifyCandidates(candidates, reoonApiKey) : [];
  const winner = pickBestVerification(verifications);
  const email = winner?.email ?? "";
  const status = winner?.status ?? fallbackStatus;
  const { confidenceScore, grade } = scoreEmailQuality({
    email,
    status,
    similarity,
    domainMatchRisk,
    mxProvider: mxProfile.mxProvider,
    isRoleBased: isRoleBasedEmail(email),
  });

  return {
    name: lead.name,
    company: lead.company,
    domain,
    email,
    pattern: winner?.pattern ?? "",
    status,
    domain_match_risk: domainMatchRisk,
    mx_provider: mxProfile.mxProvider,
    grade,
    confidence_score: confidenceScore,
  } satisfies EmailResult;
}

export function createBatchProcessingContext(): BatchProcessingContext {
  return {
    domainCache: new Map<string, Promise<string>>(),
    mxCache: new Map<string, Promise<Awaited<ReturnType<typeof getMxProfile>>>>(),
  };
}

export async function processLeadBatch({
  leads,
  reoonApiKey,
  braveApiKey,
  mockMode = false,
  extended = false,
  offset = 0,
  context = createBatchProcessingContext(),
  onResult,
}: ProcessLeadBatchOptions) {
  const results: EmailResult[] = new Array(leads.length);
  const limit = createLimiter(MAX_REOON_CONCURRENCY);

  await Promise.all(
    leads.map((lead, index) =>
      limit(async () => {
        const result = mockMode
          ? await processMockLead(lead, offset + index)
          : await processLead(
              lead,
              reoonApiKey,
              context.domainCache,
              context.mxCache,
              extended,
              braveApiKey,
            );

        results[index] = result;
        await onResult?.(result, index);
      }),
    ),
  );

  return results;
}

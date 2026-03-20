import type { DomainMatchRisk, EmailGrade, EmailStatus, MxProvider } from "@/lib/types";

const COMPANY_SUFFIXES = new Set([
  "and",
  "co",
  "company",
  "corp",
  "corporation",
  "group",
  "health",
  "holdings",
  "inc",
  "incorporated",
  "international",
  "llc",
  "limited",
  "ltd",
  "partners",
  "plc",
  "solutions",
  "systems",
  "technologies",
  "technology",
  "the",
  "ventures",
]);

const DOMAIN_SUFFIX_LABELS = new Set(["co", "com", "edu", "gov", "net", "org"]);
const ROLE_BASED_LOCALS = new Set([
  "admin",
  "contact",
  "hello",
  "info",
  "noreply",
  "sales",
  "support",
  "team",
]);

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim();
}

function compact(value: string) {
  return value.replace(/[^a-z0-9]/g, "");
}

function getCompanyTokens(company: string) {
  return normalizeText(company)
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((token) => !COMPANY_SUFFIXES.has(token));
}

function getDomainRoot(domain: string) {
  const labels = domain
    .toLowerCase()
    .split(".")
    .map((label) => label.trim())
    .filter(Boolean);

  if (labels.length <= 1) {
    return labels[0] ?? "";
  }

  const rootLabels = labels.slice(0, -1);
  while (rootLabels.length > 1 && DOMAIN_SUFFIX_LABELS.has(rootLabels[rootLabels.length - 1])) {
    rootLabels.pop();
  }

  return rootLabels.join(" ");
}

function levenshteinDistance(left: string, right: string) {
  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;

    for (let column = 1; column <= right.length; column += 1) {
      const temporary = previous[column];
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + substitutionCost,
      );
      diagonal = temporary;
    }
  }

  return previous[right.length];
}

function exactTokenOverlap(domainTokens: string[], companyTokens: string[]) {
  if (!domainTokens.length || !companyTokens.length) {
    return 0;
  }

  const domainSet = new Set(domainTokens);
  const companySet = new Set(companyTokens);
  let matches = 0;

  for (const token of companySet) {
    if (domainSet.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(domainSet.size, companySet.size);
}

const KNOWN_DOMAIN_SEGMENTS = new Set([
  "ai","hub","hq","io","labs","media","works",
  "health","group","partners","solutions","systems","tech","digital","global","online",
]);

function isCompoundDomain(domainRoot: string, tokens: string[]): boolean {
  function consume(remaining: string, available: string[]): boolean {
    if (remaining.length === 0) return true;
    for (let i = 0; i < available.length; i++) {
      const token = available[i];
      if (remaining.startsWith(token)) {
        const rest = remaining.slice(token.length);
        const next = [...available.slice(0, i), ...available.slice(i + 1)];
        if (consume(rest, next)) return true;
        if (KNOWN_DOMAIN_SEGMENTS.has(rest)) return true;
      }
    }
    return false;
  }
  return consume(domainRoot, tokens);
}

export function scoreDomainSimilarity(domain: string, company: string) {
  if (!domain.trim() || !company.trim()) {
    return {
      similarity: 0,
      domainMatchRisk: null,
    } as const;
  }

  const companyTokens = getCompanyTokens(company);
  const companyCompact = compact(companyTokens.join(" "));
  const domainRoot = getDomainRoot(domain);
  const domainTokens = normalizeText(domainRoot).split(/[\s-]+/).filter(Boolean);
  const domainCompact = compact(domainRoot);

  if (!companyCompact || !domainCompact) {
    return {
      similarity: 0,
      domainMatchRisk: null,
    } as const;
  }

  const compactSimilarity =
    1 - levenshteinDistance(companyCompact, domainCompact) / Math.max(companyCompact.length, domainCompact.length);
  const overlap = exactTokenOverlap(domainTokens, companyTokens);
  const compoundBonus = isCompoundDomain(domainCompact, companyTokens) ? 0.35 : 0;
  const similarity =
    companyCompact === domainCompact
      ? 1
      : Number(Math.max(0, Math.min(1, compactSimilarity * 0.5 + overlap * 0.3 + compoundBonus)).toFixed(2));

  const domainMatchRisk: DomainMatchRisk =
    similarity >= 0.7 ? "low" : similarity >= 0.5 ? "medium" : "high";

  return {
    similarity,
    domainMatchRisk,
  } as const;
}

export function isRoleBasedEmail(email: string) {
  const localPart = email.split("@")[0]?.toLowerCase() ?? "";
  const normalizedLocal = localPart.replace(/[^a-z]/g, "");
  const primaryToken = localPart.split(/[._+-]+/)[0] ?? "";

  return ROLE_BASED_LOCALS.has(localPart) || ROLE_BASED_LOCALS.has(primaryToken) || ROLE_BASED_LOCALS.has(normalizedLocal);
}

export function scoreEmailQuality({
  email,
  status,
  similarity,
  domainMatchRisk,
  mxProvider,
  isRoleBased,
}: {
  email: string;
  status: EmailStatus;
  similarity: number;
  domainMatchRisk: DomainMatchRisk | null;
  mxProvider: MxProvider | null;
  isRoleBased: boolean;
}) {
  const isCatchAll = status === "catch_all";

  if (!email) {
    return {
      confidenceScore: 0,
      grade: null as EmailGrade | null,
    };
  }

  let score = 0;

  if (status === "valid" || status === "safe_to_send") {
    score += 40;
  }

  if (similarity >= 0.7) {
    score += 30;
  } else if (similarity >= 0.5) {
    score += 15;
  }

  if (mxProvider === "google" || mxProvider === "microsoft") {
    score += 15;
  }

  if (isCatchAll) {
    score -= 30;
  }

  if (domainMatchRisk === "high") {
    score -= 40;
  }

  if (isRoleBased) {
    score -= 20;
  }

  const confidenceScore = Math.max(0, Math.min(100, score));
  const grade: EmailGrade =
    isCatchAll || confidenceScore < 40 ? "C" : confidenceScore >= 70 ? "A" : "B";

  return {
    confidenceScore,
    grade,
  };
}

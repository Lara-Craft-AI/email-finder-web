export type LeadInput = {
  name: string;
  company: string;
};

export type EmailStatus =
  | "valid"
  | "safe_to_send"
  | "catch_all"
  | "invalid"
  | "unresolved_domain"
  | "not_found"
  | "unknown"
  | "error";

export type DomainMatchRisk = "low" | "medium" | "high";
export type MxProvider = "google" | "microsoft" | "custom";
export type EmailGrade = "A" | "B" | "C";

export type EmailResult = LeadInput & {
  email: string;
  status: EmailStatus;
  domain: string;
  pattern: string;
  domain_match_risk: DomainMatchRisk | null;
  mx_provider: MxProvider | null;
  grade: EmailGrade | null;
  confidence_score: number;
};

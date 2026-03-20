export type LeadInput = {
  name: string;
  company: string;
};

export type EmailResult = LeadInput & {
  email: string;
  status: string;
  domain: string;
  pattern: string;
};

const normalizeNamePart = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

export function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  return {
    first: normalizeNamePart(parts[0] ?? ""),
    last: normalizeNamePart(parts.length > 1 ? parts[parts.length - 1] : ""),
  };
}

export function permuteEmails(fullName: string, domain: string) {
  const { first, last } = splitName(fullName);

  if (!domain || !first) {
    return [];
  }

  const localParts = [
    { pattern: "first.last", localPart: `${first}.${last}` },
    { pattern: "flast", localPart: `${first[0] ?? ""}${last}` },
    { pattern: "firstlast", localPart: `${first}${last}` },
    { pattern: "first", localPart: first },
    { pattern: "last", localPart: last },
    { pattern: "first_last", localPart: `${first}_${last}` },
  ];

  const seen = new Set<string>();

  return localParts
    .map((candidate) => ({
      ...candidate,
      localPart: candidate.localPart.replace(/^[._]+|[._]+$/g, ""),
    }))
    .filter((candidate) => candidate.localPart)
    .filter((candidate) => {
      if (seen.has(candidate.localPart)) {
        return false;
      }

      seen.add(candidate.localPart);
      return true;
    })
    .map((candidate) => ({
      email: `${candidate.localPart}@${domain}`.toLowerCase(),
      pattern: candidate.pattern,
    }));
}

# PRD: Email Quality Check Before Display

## Goal
Before surfacing any email result to the user, run a fast quality gate that catches bad/mismatched emails so users only see high-confidence results (or can clearly distinguish good vs. suspect).

---

## Problem
Current flow: domain resolve → generate permutations → Reoon SMTP verify → show result.

Reoon validates SMTP existence but doesn't catch:
- **Domain mismatches** (e.g. `@nifty.com` resolved from "Nift" → wrong company entirely)
- **Low-confidence domain resolutions** (single Brave result, ambiguous company name)
- **Generic/catch-all servers** that accept any address (true positive rate ~50%)
- **Disposable/role-based addresses** (info@, admin@, etc.)

---

## Quality Checks (ordered by impact)

### 1. Domain–Company Name Match Score
After resolving domain, compare the domain against the company name:
- Strip TLD and common suffixes (inc, llc, corp, group, health, etc.)
- Levenshtein distance or token overlap between domain root and company name tokens
- **Flag** if similarity < 0.5 (e.g. "Nift" vs "nifty" → low, "Barefoot Books" vs "barefootbooks" → high)
- **Label:** `domain_mismatch_risk: low | medium | high`

### 2. MX Record Validation
Check that the resolved domain has valid MX records before generating/verifying permutations.
- Skip Reoon call entirely if no MX → mark as `unresolved_domain` (already partially done)
- Bonus: classify MX provider (Google Workspace, Microsoft 365, custom) — corpo providers = higher confidence

### 3. Catch-All Detection
Reoon returns `catch_all` status for some domains. These accept any email → SMTP verify is meaningless.
- Surface these separately: `catch_all` badge instead of `valid`
- Don't count them in the "verified" headline stat

### 4. Role-Based / Generic Email Filter
If the generated email starts with: `info`, `admin`, `contact`, `hello`, `support`, `sales`, `team`, `noreply` → auto-flag as generic, deprioritize.

### 5. Confidence Score (composite)
Combine checks into a single score per lead:

| Signal | Weight |
|---|---|
| Reoon status = valid | +40 |
| Domain-company similarity ≥ 0.7 | +30 |
| Domain similarity 0.5–0.7 | +15 |
| MX provider = Google/Microsoft | +15 |
| Catch-all domain | -30 |
| Domain mismatch risk = high | -40 |
| Role-based email | -20 |

Score → **A** (≥70), **B** (40–69), **C** (<40 or catch-all)

---

## UI Changes

### Results Table
- Add **Grade** column: `A` (green), `B` (yellow), `C` (red)
- Add **Domain** column (small, secondary)
- Filter tabs: `All` | `Grade A` | `Grade B` | `Grade C / Suspect`
- Default view: show all, sorted A→C

### Export
- Export respects active filter (e.g. export only Grade A)
- CSV includes: `first_name, last_name, company, email, grade, domain_match_risk`

### Second Pass (already planned)
- `not_found` leads → retry with extra patterns (already in scope)
- After retry, apply same quality gate

---

## API Route Changes

### `/api/find-email` response shape (add fields)
```ts
{
  email: string | null,
  status: "valid" | "invalid" | "catch_all" | "unresolved_domain" | "not_found",
  domain: string | null,
  domain_match_risk: "low" | "medium" | "high" | null,
  mx_provider: "google" | "microsoft" | "custom" | null,
  grade: "A" | "B" | "C" | null,
  confidence_score: number // 0–100
}
```

---

## Success Criteria
- No more nifty.com-style emails surfaced silently as "valid"
- User can filter to Grade A only → high-confidence list for cold outreach
- Catch-all emails clearly labeled (not counted as verified)
- Processing speed not significantly impacted (all checks except MX are in-memory/fast)
- Export includes grade column

---

## Out of Scope
- LinkedIn cross-reference (separate project)
- Human review queue
- Reoon alternative providers

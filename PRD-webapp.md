# PRD — Email Finder: Web App (Vercel)
**Status:** Approved by Mathis
**Created:** 2026-03-19
**Project folder:** `projects/email-finder/`

---

## Goal

Ship a public-facing web app so non-technical users can find and verify emails from a CSV upload — zero code required, no CLI, no Google account needed.

---

## Design Direction

- **Framework:** Next.js 15 (App Router) — deploys to Vercel natively
- **UI:** shadcn/ui (latest) + Tailwind CSS
- **Style:** Light mode only. Vercel-style minimalism — crisp white, subtle gray borders, tight spacing, clean typography. No dark mode.
- **Vibe:** Looks like a Vercel internal tool. Not a SaaS marketing page. Functional beauty.

---

## User Flow

1. **Landing page** — one headline, one CTA ("Upload your CSV")
2. **Upload step** — drag & drop CSV with `name` and `company` columns
3. **Config step** — user pastes their Reoon API key (never stored server-side)
4. **Run step** — progress bar as emails are found + verified in real time (SSE/streaming)
5. **Results step** — table with name, company, email, status (valid / not found)
6. **Download** — one button: "Download CSV"

---

## UI Components (shadcn)

- `Button` — primary actions
- `Card` — step containers
- `Input` — API key field
- `Progress` — live progress bar during processing
- `Table` — results display
- `Badge` — status labels (valid = green, not_found = gray, catchall = yellow)
- `Separator` — section dividers
- File dropzone (use `react-dropzone`)

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| UI | shadcn/ui + Tailwind CSS v4 |
| API routes | Next.js Route Handlers (Edge-compatible) |
| Domain resolution | Clearbit autocomplete (free, no key) + `domains-override.json` fallback |
| Email verification | Reoon API (user provides key) |
| Deployment | Vercel (zero config) |
| Repo | New repo: `Lara-Craft-AI/email-finder-web` |

---

## API Routes

### `POST /api/find-emails`
- Accepts: JSON `{ leads: [{name, company}], reoonApiKey: string }`
- Streams SSE events: `{ type: "progress", current, total, name }` and `{ type: "result", name, email, status }`
- Returns final `{ results: [...] }` on completion

### `GET /api/health`
- Returns `{ ok: true }` — for Vercel deployment checks

---

## Privacy / Security

- Reoon API key: never logged, never stored, only used server-side for the duration of the request
- CSV data: processed in memory, never persisted
- No database, no auth, no accounts

---

## Pages / Routes

```
/              ← landing + upload + run (single-page flow)
/api/find-emails
/api/health
```

---

## Design Specs

- **Font:** Geist (Vercel's font, available via `next/font`)
- **Colors:** white background, `zinc-900` text, `zinc-200` borders, `emerald-500` for success badges
- **Radius:** `rounded-lg` on cards, `rounded-md` on buttons/inputs
- **Shadows:** minimal — `shadow-sm` only
- **Max width:** `max-w-2xl` centered — tight, focused, not full-width
- **Spacing:** generous vertical rhythm (py-12 sections)

---

## Success Criteria

- [ ] Upload a CSV → see results in the browser in <60s for 25 leads
- [ ] Download enriched CSV with name, company, email, status columns
- [ ] Works on Vercel with zero env vars (user provides their own Reoon key)
- [ ] Mobile-responsive (basic — tablet+ is fine)
- [ ] No console errors in production build
- [ ] `vercel deploy` works first try

---

## Out of Scope (v1)

- Google Sheets integration (separate flow)
- User accounts / saved lists
- Dark mode
- Bulk lists >500 rows

---

## Estimated Cost to Run

- Hosting: Free (Vercel hobby)
- Domain resolution: Free (Clearbit)
- Verification: User's own Reoon key (~$0.001/email — their cost, not ours)

---

## Files to Create

```
projects/email-finder-web/
  app/
    page.tsx              ← main single-page flow
    layout.tsx            ← Geist font + metadata
    api/
      find-emails/
        route.ts          ← SSE streaming endpoint
      health/
        route.ts
  components/
    FileDropzone.tsx
    ResultsTable.tsx
    ProgressStep.tsx
  lib/
    permute.ts            ← email pattern generation
    resolve-domain.ts     ← Clearbit + override lookup
    reoon.ts              ← Reoon API client
  public/
  .gitignore
  package.json
  tailwind.config.ts
  next.config.ts
  vercel.json
  README.md
```

---

## Ralph Loop Instructions for Codex

1. Bootstrap Next.js 15 app with `npx create-next-app@latest` (TypeScript, Tailwind, App Router, no src dir)
2. Install shadcn: `npx shadcn@latest init` — use "default" style, zinc base color, CSS variables ON
3. Add components: `npx shadcn@latest add button card input progress table badge separator`
4. Install extras: `react-dropzone`, `papaparse`, `@types/papaparse`
5. Port `resolve-domain.ts` and `permute.ts` from the existing `index.js`
6. Build the streaming API route
7. Build the single-page UI with all 5 steps
8. Run `npm run build` — fix all TypeScript/lint errors
9. Test locally: upload a small CSV, verify the flow works end-to-end
10. Create GitHub repo `Lara-Craft-AI/email-finder-web` and push
11. Run `vercel deploy --prod` — confirm deployment URL
12. Notify: `openclaw system event --text "Done: email-finder-web deployed to Vercel" --mode now`

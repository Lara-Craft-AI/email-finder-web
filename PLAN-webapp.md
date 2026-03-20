# PLAN — Email Finder Web App
**Status:** Ready for Codex
**Created:** 2026-03-19

## Checklist

- [x] 1. Create project dir `projects/email-finder-web/`, run `npx create-next-app@latest email-finder-web` (TypeScript, Tailwind, App Router, no src dir)
- [ ] 2. Init shadcn: `npx shadcn@latest init` — style: default, base color: zinc, CSS variables: yes
- [x] 3. Add shadcn components: button, card, input, progress, table, badge, separator
- [ ] 4. Install deps: `react-dropzone papaparse @types/papaparse`
- [x] 5. Create `lib/permute.ts` — generates 6 email patterns from first+last+domain
- [x] 6. Create `lib/resolve-domain.ts` — Clearbit autocomplete lookup, returns domain string
- [x] 7. Create `lib/reoon.ts` — Reoon API client (single verify + batch)
- [x] 8. Create `app/api/find-emails/route.ts` — POST, streams SSE: progress events + final results
- [x] 9. Create `app/api/health/route.ts` — GET returns `{ ok: true }`
- [x] 10. Create `components/FileDropzone.tsx` — react-dropzone, accepts .csv, parses with papaparse, emits `{ name, company }[]`
- [x] 11. Create `components/ProgressStep.tsx` — shows Progress bar + current lead name being processed
- [x] 12. Create `components/ResultsTable.tsx` — Table with name, company, email, status Badge; Download CSV button
- [x] 13. Create `app/layout.tsx` — Geist font, metadata, white bg
- [x] 14. Create `app/page.tsx` — full single-page 5-step flow (upload → apikey → run → results → download). Max-w-2xl centered.
- [x] 15. Run `npm run build` — fix all errors until clean build
- [ ] 16. Test locally: `npm run dev`, upload a test CSV with 3 rows, verify SSE streaming works
- [x] 17. Add `.gitignore` (node_modules, .env*, .next, .vercel)
- [x] 18. Write `README.md` — how to deploy on Vercel
- [ ] 19. Init git, create GitHub repo `Lara-Craft-AI/email-finder-web`, push
- [ ] 20. Run `vercel deploy --prod` from project dir
- [ ] 21. Notify: `openclaw system event --text "Done: email-finder-web live at <url>" --mode now`

## Notes
- Working dir: `/data/.openclaw/workspace/projects/email-finder-web/`
- Reoon API key in `/data/.openclaw/credentials/reoon-api-key.txt` (for local testing)
- git config: `user.name "matgj"` + `user.email "58981465+matgj@users.noreply.github.com"`
- Vercel token: `$VERCEL_TOKEN` env var
- No dark mode. Light only. Vercel aesthetic.
- `npm run build` passes with webpack. Turbopack failed in this sandbox due blocked helper-process port binding.
- Local `npm run dev` is blocked by sandbox `EPERM` on listening sockets, so step 16 could not be completed here.
- `gh` and `vercel` CLIs are unavailable in this environment, so steps 19-21 remain blocked until those tools exist.

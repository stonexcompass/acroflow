# AcroFlow — Handoff Notes

Last updated: 2026-09-17. The user resumed AcroFlow work — per-element Notes feature added (see below).
This file has everything needed to pick feature work back up later.

## Project snapshot

- **What:** AcroFlow, an installable offline-first PWA for acro-yoga training
  (pose/transition library, flow + washing-machine library, Flow Builder,
  per-role progress, training shortlist, goals, Practice planner, practice logs,
  per-element notes, Jam partner comparison, JSON import/export, Supabase cloud sync).
- **Code:** `~/workspace/acro-app/` (this repo)
- **Live:** https://stonexcompass.github.io/acroflow/
- **Repo:** `stonexcompass/acroflow`, branch `main`, served via GitHub Pages.
- **Latest published commit:** `a8424b0` (2026-09-16).
- **Data:** 19 poses, 27 transitions, 15 seed flows + user-created flows.
- **Service-worker cache:** `acroflow-v6`. Bump the version in `sw.js` whenever
  `app.js` (or any cached asset) changes in a user-visible way.

## Publishing

```bash
cd ~/workspace/acro-app
# token via env only — never commit it, never put it in .git/config
AUTH=$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 -w0)
git -c http.extraHeader="Authorization: Basic $AUTH" push origin main
```

- **GitHub token:** classic PAT with **`repo` scope only**. The original
  over-scoped token was deleted 2026-09-16; replacement (repo-only) was
  provided in chat 2026-09-16, verified working (`X-OAuth-Scopes: repo`),
  and is **not stored anywhere** — ask the user for it again at next publish.
- After push, GitHub Pages redeploys automatically (usually < 1 min).
- **Users get updates without logging out**, but the PWA caches aggressively:
  tell them to force-close/reopen the installed app (twice if needed), or
  hard-refresh (`Ctrl/Cmd+Shift+R`) in the browser.

## Architecture & key files

- `index.html` — shell; `app.js` — all UI + state (large); `sw.js` — service worker.
- `supabase-adapter.js` — sync layer (localStorage-first, Supabase layered on top).
- `supabase-schema.sql` — full schema for fresh installs.
- `supabase-migration-v1.1.sql` — ran fine 2026-09-16 (training/goal flow columns).
- `supabase-migration-v1.2.sql` — **rewritten 2026-09-16, the LAST migration.**
  Adds only `meta jsonb` catch-all columns (see Schema rule). The user had this
  file open 2026-09-16 — **confirm whether they ran it**; sync of flow extras
  stays local-only until they do.
- `README.md` — user-facing docs, incl. "Schema evolution rule" section.

## Schema rule (important)

**NEW FIELDS GO IN `meta` — never add another column.** `user_flows.meta` and
`profiles.meta` are `jsonb` catch-alls; the adapter round-trips unknown keys
verbatim and `flowSigs` change-detection covers `meta`. This was built
2026-09-16 specifically so the user never runs another SQL script. The rule is
documented in `supabase-adapter.js` (top comment), the v1.2 migration header,
and README.

## Validation

Harness lives in `~/workspace/acro-app-validation/`, run with `node`:

- `validate-flows.cjs` — seed data integrity: **218/218**
- `validate-ytflow.cjs` — YouTube-import feature: **90/90**
- `validate-meta.cjs` — meta jsonb sync round-trip: **50/50**
- Plus `node --check` on all JS and a credential sweep before every publish.

## Open / unresolved items

1. **v1.2 migration run unconfirmed** (see above). Ask before assuming sync works.
2. **Sign-in "invalid credentials"** after account creation appeared to work
   (2026-09-16). Likely email-confirmation not completed; check Supabase
   Auth → email templates/confirmations. Unresolved.
3. **Cross-device sync unverified in real use.** Test plan: change progress/goal
   on device A → Sync now → sign in on device B → confirm it appears.
4. **Minor UI bug:** typing in Library search while the YouTube import form is
   open re-renders the form and loses its input.
5. **Drive-by fix 2026-09-16:** `mergeBoth` was silently dropping
   `training_flow_ids`/`goal_flow_ids` on the merge path — fixed with generic
   key-copy. Worth a sync test per item 3.

## Product decisions (don't re-litigate)

- **Practice tab = the plan; Log tab = the record.** Practice is the default
  landing tab; Library is second.
- **"Training" = the user's active shortlist**, not the whole library. Only
  training flows drive recommendations and can become goals. (Naming questioned,
  kept.)
- **Incomplete flows** (e.g. fresh YouTube imports): grayscale thumbnail,
  italic name, dashed border, "Needs steps" label, "Add steps in Builder"
  action. Excluded from readiness math and "Flows to drill"; still usable as
  training items, goals, log entries. Saving 2+ steps in Builder clears it.
- **Built-in flows are immutable** — "Make my own version" copies them for
  editing. User flows edit in place.
- **YouTube import:** paste-a-link (no search API), via oEmbed; works offline
  as a bare draft.
- **Deliberate tutorial gaps** (Couch, Secretary, High Flying Whale, some
  transitions): do not invent steps or attach vague videos to claim coverage.
- Several seed flows are intentionally sequence-unverified rather than guessed.

## Working agreements with the user

- Terse, action-first replies. For builds: front-load anything needing them,
  then work autonomously.
- After two failed troubleshooting routes, plainly declare the route broken —
  no more variants.
- Do not call them "Stephen" (seen on accounts/calendar, never confirmed).
- Token hygiene: least-privilege, revoking broad tokens (established 2026-09-16).

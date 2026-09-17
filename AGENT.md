# AGENT.md — AcroFlow

> Machine-readable project context. Any model or agent picking up AcroFlow
> work should read this file first, then `HANDOFF.md` for session history.
> The user speaks in one-liners and corrects instead of explaining: verify
> current UIs/docs rather than reciting stale instructions, and front-load
> every touch-point that needs him before working solo.

## What it is

AcroFlow is an offline-first PWA for tracking acro-yoga / partner-acrobatics
training: a skill graph of poses and transitions, flows and washing machines,
per-role progress levels, practice planning, session logging, and video
tutorials. Built for one user (the owner), who is learning acro yoga.

- **Repo:** `stonexcompass/acroflow`, branch `main`
- **Live:** https://stonexcompass.github.io/acroflow/ (GitHub Pages, serves `main`)
- **Local:** `~/workspace/acro-app/` on the agent VM
- **Stack:** vanilla HTML/CSS/JS. No framework, no build step, no bundler.
  Edit files directly; the service worker cache-busts via version bump.

## File map

| File | Role |
|---|---|
| `index.html` | App shell, tab bar (Practice, Log, Builder, Library, Jam, Data) |
| `app.js` | All UI + state logic (~1400 lines) |
| `data.js` | `window.SEED`: built-in poses, transitions, flows (static curriculum) |
| `styles.css` | All styling |
| `sw.js` | Service worker, cache-first app shell. **Bump `CACHE_VERSION` on every ship** (`acroflow-v8` as of 2026-09-17) |
| `supabase-adapter.js` | Cloud sync (Supabase REST). Local-first; `LocalAdapter` fallback |
| `supabase-schema.sql` | Original schema (historical — do not rerun blindly) |
| `supabase-migration-v1.1.sql` | Ran successfully 2026-09-16 |
| `supabase-migration-v1.2.sql` | **Idempotent, adds `meta` JSONB columns. User must run once — still unconfirmed as of 2026-09-17** |
| `HANDOFF.md` | Session-by-session history, decisions, open issues |
| `~/workspace/acro-app-validation/` | Test harnesses (`validate-*.cjs`), run with `node` |

## The data model

**Elements** (user's term): poses, transitions, flows, washing machines
(washing machines are flows with `washingMachine: true`).

- **Seed data** (`data.js`, `window.SEED`): 19 poses, 27 transitions, 15 flows.
  Never mutate at runtime. Built-ins get "Make my own version", never edits.
- **User data**: flows (`user_flows`), practice logs, progress bags
  (`{skillId: {role: level}}`), settings, element notes.
- **Custom poses/transitions** (added 2026-09-17, in flight): stored at
  `state.settings.meta.customSkills`, registered into the in-memory `byId` /
  `pairToTrans` maps at load. IDs look like `u-p-slug-ab12`.
- **Element notes**: free text per element at
  `state.settings.meta.notes`, keyed `pose:<id>` / `trans:<id>` / `flow:<id>`.

## THE META RULE (hardest constraint in this repo)

> **New fields go in `meta` (JSONB). Never add another column. Never write
> another migration.**

`user_flows.meta` carries flow extras (incomplete/draft state, tutorials).
`profiles.meta` carries settings extras (notes, custom skills, future
settings). Both round-trip opaquely through `supabase-adapter.js`. The user
was promised: no more SQL scripts, ever.

## Sync

Local-first. `DB.save(state)` persists locally on every change; Supabase
sync pushes/pulls with per-record timestamps, local↔UUID id maps, and
tombstones (see `supabase-adapter.js` header comment — it documents itself
well). Merge is last-write-wins per record/field. Cross-device sync verified
only after auth works (see open issues).

## Conventions

- **Tabs:** Practice (the plan, default) · Log (the record) · Builder ·
  Library · Jam · Data. "Training" = the active shortlist, not the library.
- **Never invent** tutorial videos or flow steps to fill gaps. Intentional
  gaps exist (Couch, Secretary, High Flying Whale, some transitions) — leave
  them; the UI marks them honestly ("sequence not recorded", "?").
- **Tutorial curation:** when attaching/finding videos, prefer a video that
  isolates the single skill over one where it's buried in a flow/compilation.
- **Long option lists** get a search-as-you-type picker, never exhaustive
  radio buttons/checkboxes (user's explicit preference).
- **YouTube imports** ("＋ Add from YouTube" in Library → Flows): standard /
  youtu.be / Shorts / embed / live URLs; oEmbed fills title/creator/thumb;
  saved as visibly-incomplete drafts ("Needs steps", grayscale, dashed) until
  ≥2 steps are mapped in the Builder.
- **Arrow forgiveness:** transition names display as `→` but all search
  inputs and the add-transition parser accept `>`, `to`, `→`
  interchangeably (`normArrow()`); "Foot to Hand to Bird" splits on the LAST
  separator.
- **Errors:** after two failed troubleshooting routes, say the route is
  broken and offer one fallback — not more variants.
- **Replies to the user:** terse, action-first. No "Great question!".

## Validation & deploy workflow

1. `node --check` every changed JS file.
2. Run/extend the harness: `node ~/workspace/acro-app-validation/validate-*.cjs`
   (flows, ytflow, meta, notes, logskills, customskills). Add a new
   `validate-<feature>.cjs` for new features; update counts in HANDOFF.md.
3. Credential sweep: `grep -ri 'ghp_\|sk-\|secret\|token' --include='*.js'`
   must be clean before publish.
4. Bump `sw.js` `CACHE_VERSION`.
5. Commit locally. **Do NOT push until the user pastes a fresh repo-scoped
   GitHub PAT in chat** (classic token, `repo` scope only — state the scope
   upfront; a past over-scoped token was deleted). Tokens are never stored;
   ask again per publish.
6. Push to `main` → GitHub Pages rebuilds in ~1–2 min. Verify with
   `curl -s https://stonexcompass.github.io/acroflow/sw.js | grep CACHE_VERSION`.
7. Update `HANDOFF.md` ("Latest published commit", feature list, validation
   counts) and push that too.

## Current state (2026-09-17)

- Latest published: `6ae75ea` (2026-09-17) — custom poses/transitions add-to-library + arrow-forgiving search + YouTube attach (`9ec1502`), AGENT.md (`acroflow-v8`).
- Content: 19 poses, 27 transitions, 15 seed flows + user flows (+ user-added custom skills).
- Content: 19 poses, 27 transitions, 15 seed flows + user flows.
- Element notes shipped 2026-09-17 (`a423ba4`, v6): notes box on every
  element detail, syncs via `profiles.meta`.
- Log tab type-ahead shipped 2026-09-17 (`b99020f`, v7).

## Open issues

1. `supabase-migration-v1.2.sql` — user may never have run it. Confirm before
   assuming `meta` columns exist; adapter tolerates absence.
2. Supabase auth: account creation seemed to work, sign-in returned
   "invalid credentials" (2026-09-16). Email confirmation unverified.
   Cross-device sync unverified.
3. Minor bug: typing in Library search while the YouTube import form is open
   re-renders the form and loses its input.
4. Known edge: deleting your last element note removes `settings.meta`
   locally, so the push omits `meta` (never clobber unseen server meta) — a
   stale server copy could resurrect it on fresh pull. Accepted; matches
   adapter semantics.

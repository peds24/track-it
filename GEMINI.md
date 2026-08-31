# AGENTS.md

Guidance and rules for Antigravity agents working in the `track-it` repository.

## 1. Git Trees, Staging & Co-Authorship Protocol

When creating, modifying, or committing code:

### Co-Author Attribution (Mandatory)
Every git commit created or assisted by an Antigravity agent MUST include the Antigravity co-author trailer in the commit message body:

```
Co-authored-by: Google Antigravity <242056456+google-antigravity@users.noreply.github.com>
```

### Commit Message Structure
Follow the standard conventional format with imperative mood (summary <= 72 characters):

```
<type>: <short imperative summary under 72 chars>

Why this change exists — the problem, the constraint, or the behavior that
was addressed. Diff shows what changed; body explains why.

- Bullet points for notable specifics if needed

Co-authored-by: Google Antigravity <242056456+google-antigravity@users.noreply.github.com>
```

### Git Tree & Branching Discipline
1. **Orient First**: Run `git status`, `git log --oneline -5`, `git branch --show-current`. Note that this repo maintains active work on feature branches (e.g. `feat/v1-implementation` or stacked feature branches); always verify your base branch before starting.
2. **Branch for Work**: Isolate feature work on dedicated branches (`<type>-<subject>`).
3. **Stage Deliberately**: NEVER use `git add .` or `git add -A` blindly. Explicitly stage modified files (`git add src/domain/tracker.ts`). Always review `git diff --staged` before committing.
4. **One Commit, One Reason**: Keep commits atomic, clean, and revertible.
5. **Linear History**: Rebase local commits onto the upstream base before pushing; never create unnecessary merge commits on local branches.
6. **No Destructive Operations**: Never run `git reset --hard`, `git clean -fd`, `git push --force`, or `git branch -D` without explicit user permission. Use `--force-with-lease` when authorized.

---

## 2. Project Overview & Architecture (`track-it`)

A local-only mobile app for tracking shows, movies, books, comics, and manga built with React Native (Expo SDK 57), TypeScript (strict), Expo Router, and `expo-sqlite`.

### Architectural Layers
- `src/domain/`: Pure TypeScript business logic (status transitions, progress calculation, shelf classification). **Zero I/O, no UI imports, no database calls.**
- `src/db/`: SQLite schema, migrations, raw queries (`expo-sqlite`).
- `src/data/`: Repositories mapping database rows to domain entities.
- `src/providers/`: MetadataProvider interfaces (manual entry v1, external providers v2).
- `src/ui/`: Reusable theme tokens, hooks, supporting UI components.
- `app/`: Expo Router file-based screens (tabs, modals).

---

## 3. Development & Verification Commands

**Before claiming completion or creating commits, run fresh verification:**

```bash
# Type check (mandatory before completion)
npm run typecheck     # tsc --noEmit

# Run unit tests
npm test              # jest

# Start development server
npm start             # expo start
```

---

## 4. Core Engineering Disciplines

- **Verification Before Completion**: Evidence before claims, always. Execute `npm run typecheck` and `npm test` and inspect real output before stating that tasks are complete.
- **Test-Driven Development (TDD)**: Write the failing test first (RED), verify the failure, write minimal passing code (GREEN), and refactor.
- **Systematic Debugging**: Find root cause before attempting fixes. Trace data flow backward from symptoms.
- **Devlog**: When implementing significant architecture or design trade-offs, document the rationale in `DEVLOG.md`.

---

## 5. Working Alongside Claude Code

This repository is actively developed by both Google Antigravity and Claude Code, often on parallel branches. Follow this protocol so the two don't collide or silently diverge:

- **Branch ownership is visible by name.** Antigravity's branches follow `<type>-<subject>` (`feat/...`, `fix/...`, `chore/...`). Claude Code's own branches are `worktree-<slug>`, under `.claude/worktrees/<slug>`. Run `git branch -a` before starting — the naming alone tells you which agent is driving a branch, no need to ask.
- **Split by feature area, not by whichever agent is free.** The costliest merge in this repo's history came from both agents rewriting the same UI surface — a Material 3 redesign on one side, a features branch on the other — independently, for weeks, before anyone merged them. Prefer handing ownership of a layer (the shared design system in `src/ui/theme.ts`, one screen family, one provider) to a single agent for the duration of a change, rather than having both touch it at once.
- **Read before you write.** Before any nontrivial change, read `docs/HANDOFF.md` (session-to-session state) and `docs/superpowers/specs/2026-08-12-track-it-design.md` (the numbered decision record, D1–D12 plus amendments A1 onward). Both exist so an agent picking up mid-project doesn't have to reverse-engineer intent from a diff.
- **Write before you hand off.** After a change substantial enough to matter to whoever works here next — a new screen, a reversed decision, a new architectural rule — update `docs/HANDOFF.md`. If it reverses or fulfills a numbered decision, add the next `A<n>` amendment to the design spec instead of letting the record go stale.
- **Sync early against a moving target, not at merge time.** If a branch touches shared UI/theme files and lives more than a day or two, periodically check `git log --oneline main..<branch>` and diff against current `main`. Don't let two independent rewrites of the same screen accumulate for weeks before the conflict surfaces.
- **Co-author trailers stay distinct per agent**, so `git log` shows who actually did what: Antigravity uses `Co-authored-by: Google Antigravity <242056456+google-antigravity@users.noreply.github.com>` (§1); Claude Code uses `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (`CLAUDE.md` §1). Never drop or merge the two when a commit had input from both agents.

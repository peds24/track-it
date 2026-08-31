# AGENTS.md

Guidance and rules for Antigravity agents working in the `track-it` repository.

## 1. Git Trees, Staging & Co-Authorship Protocol

When creating, modifying, or committing code:

### Co-Author Attribution (Mandatory)
Every git commit created or assisted by an Antigravity agent MUST include the Antigravity co-author trailer in the commit message body:

```
Co-authored-by: Antigravity <antigravity@google.com>
```

### Commit Message Structure
Follow the standard conventional format with imperative mood (summary <= 72 characters):

```
<type>: <short imperative summary under 72 chars>

Why this change exists — the problem, the constraint, or the behavior that
was addressed. Diff shows what changed; body explains why.

- Bullet points for notable specifics if needed

Co-authored-by: Antigravity <antigravity@google.com>
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

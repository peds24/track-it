---
name: porting-android-changes-to-web
description: Use when an Android PR has merged or is open and its changes need to reach the `web` branch — syncing android and web, "port this to web", "does web have this fix yet", or reviewing a PR against android that touches src/domain, src/data, src/ui, or app/.
---

# Porting Android Changes to Web

## Overview

`android` is the primary dev platform for track-it; `web` is a React Native Web
port with its own diverged files. A change merged on `android` does not appear
on `web` automatically — it has to be read from the PR and ported file by
file, respecting which files `web` has intentionally diverged for the web
platform.

## When to Use

- A PR against `android` just merged or is open, and it touches `src/domain/`,
  `src/data/`, `src/ui/`, or `app/`.
- The user asks to "port this to web," "sync android and web," or whether a
  fix/feature has reached web yet.

## Process

1. **Read the PR, not just the title.**

   ```bash
   gh pr view <n> --repo peds24/track-it --json title,body,files -q '.files[].path'
   gh pr diff <n> --repo peds24/track-it
   ```

   No PR yet, working from a branch name instead? Use
   `git log android..<branch> --oneline` and `git diff android...<branch>`.

2. **Sort every changed file into one of three buckets before touching
   anything:**

   | Bucket | Examples | What to do |
   | --- | --- | --- |
   | Shared, safe to port directly | `src/domain/*`, most of `src/data/*`, pure logic `web` hasn't diverged | Cherry-pick or hand-apply as-is |
   | Shared, but `web` has its own version | `app/(tabs)/*.tsx`, `src/ui/TrackRow.tsx`, `src/ui/SwipeableTrackRow.tsx`, `src/ui/theme.ts` | Read `git diff android web -- <path>` first to see how `web` already diverged, then hand-merge the android change into web's version — never overwrite the file wholesale |
   | Web-only, never touch from an android port | `metro.config.js`, `public/*`, `vercel.json`, `app/+html.tsx`, `src/ui/IosInstallPrompt.tsx`, `.env.example` | Leave untouched |

   Unsure which bucket a file is in? `git diff android web -- <path>` — no
   output means identical and safe to port directly; output means `web`
   diverged and needs a hand-merge, not an overwrite.

3. **Branch off `web`** (per `CLAUDE.md` §6 — never commit the port directly
   to `web`):

   ```bash
   git checkout web && git pull origin web --ff-only
   git checkout -b worktree-port-pr-<n>-to-web
   ```

4. **Apply the change.** Prefer `git cherry-pick <commit>` for bucket-1
   files — shared history usually makes this clean. For bucket-2 files,
   apply the change by hand into web's version, keeping every web-specific
   addition intact (`Platform.OS === 'web'` branches, the web alert bridge,
   native-only guards).

5. **Verify on `web` specifically** — a change that typechecks on `android`
   is not guaranteed to typecheck on `web` (different platform code,
   `expo-sqlite`'s web backend, `react-native-web`):

   ```bash
   npm run typecheck
   npm test
   npm run web    # boot it and actually look — tests alone have missed real UI bugs here before
   ```

6. **Flag anything with no web equivalent yet** rather than dropping it
   silently or faking it — e.g. `expo-camera` barcode scanning has no web
   implementation. Port the surrounding logic and note the gap in the
   commit message.

7. **Merge into `web` with a real `git merge`** (§6), push, and report: what
   ported directly, what needed a hand-merge and why, what was skipped and
   why.

## Quick Reference

| Need | Command |
| --- | --- |
| Files changed in a PR | `gh pr view <n> --repo peds24/track-it --json files -q '.files[].path'` |
| Full diff of a PR | `gh pr diff <n> --repo peds24/track-it` |
| Diff without a PR | `git diff android...<branch>` |
| Has `web` already diverged on this file? | `git diff android web -- <path>` |
| Cherry-pick one commit | `git cherry-pick <sha>` |

## Common Mistakes

- **`git merge android` into `web` wholesale.** Resolves every diverged file
  by whichever side git or the merge strategy picks, and will silently
  clobber web-only work (the PWA install prompt, the web alert bridge,
  `metro.config.js`). Always port file-by-file per the bucket table above.
- **Trusting `android`'s typecheck/test result for `web`.** They're
  different platform builds — always re-run verification on `web` itself.
- **Dropping a native-only feature silently.** If the ported change depends
  on `expo-camera` or another native-only API, say so in the port's commit
  message and PR description rather than leaving a silent gap.

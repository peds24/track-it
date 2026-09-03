---
name: version-release
description: Use when starting work on an upcoming roadmap milestone, releasing a new version, bumping app versions, or updating CHANGELOG.md and DEVLOG.md across the android/web/gh-pages pipeline.
---

# Feature Milestone & Version Release Workflow

## Overview

This skill establishes the standard protocol for picking up an upcoming feature from [`ROADMAP.md`](../../ROADMAP.md), implementing it, bumping version numbers consistently across configurations, updating the project changelog and devlog, and synchronizing across the 3-branch pipeline (`android` → `web` → `gh-pages`).

---

## When to Use

- Starting work on a roadmap idea/feature (e.g., Status Undo, Stats Page, Track Details, Iris Rebrand).
- Preparing a feature branch for release and bumping project version numbers.
- Updating `CHANGELOG.md` with release notes and `DEVLOG.md` with architectural context.
- Porting release changes across branches.

---

## Semantic Versioning Strategy

This project strictly adheres to [Semantic Versioning](https://semver.org/):

* **PATCH (`1.0.x`)**: Bug fixes, minor visual refinements, provider edge cases, or backwards-compatible patches.
* **MINOR (`1.x.0`)**: Substantial new feature milestones from the roadmap:
  * **v1.1.0**: Action Feedback, Undo Engine & Finish Celebrations
  * **v1.2.0**: Individual Track Details, Cover Artwork & Formatted Metadata
  * **v1.3.0**: Insights & Stats Page with Shareable Visuals
* **MAJOR (`2.0.0`)**: Fundamental paradigm shifts, breaking changes, or major rebrands (e.g., **Iris Evolution**).

---

## The 7-Step Version Release Protocol

```
1. Orient & Branch ──> 2. TDD Implementation ──> 3. Verify
       │                                            │
       ▼                                            ▼
6. Commit & Co-Author <── 5. Devlog Update <── 4. Version Bump
       │
       ▼
7. Pipeline Sync (`android` ──> `web` ──> `gh-pages`)
```

### Step 1: Orient & Create Dedicated Feature Branch

1. Always verify working tree is clean and check out `android` (the source of truth):
   ```bash
   git checkout android
   git pull origin android --ff-only
   git status
   ```
2. Create a dedicated branch following agent naming conventions:
   * **Antigravity**: `<type>-<version>-<feature-slug>` (e.g., `feat-v1.1.0-undo-feedback`)
   * **Claude Code**: `worktree-v<version>-<feature-slug>` under `.claude/worktrees/`

### Step 2: Test-Driven Development (TDD)

Follow the Red-Green-Refactor cycle:
1. **Red**: Write a failing unit test in `src/domain/__tests__/` or `src/data/__tests__/` confirming expected behavior.
2. **Green**: Write the minimal domain/data code necessary to pass the test.
3. **Refactor**: Clean up implementation without altering external contracts.
4. **UI**: Wire into `src/ui/` components and `app/` screens.

### Step 3: Mandatory Pre-Flight Verification

Execute both checks and inspect actual terminal output before touching version numbers:

```bash
# Ensure Node 22 is active
source ~/.nvm/nvm.sh && nvm use 22

# 1. Strict TypeScript check (0 errors permitted)
npm run typecheck

# 2. Complete unit test suite
npm test
```

> [!IMPORTANT]
> Passing tests is necessary but not sufficient for UI work. Always launch the development server (`npm start` / `npm run android`) and visually inspect the screen before marking a version complete.

### Step 4: Version Bump Protocol

When a milestone is complete and verified, update the version string in **both** files simultaneously:

1. **`package.json`**:
   ```json
   "version": "1.1.0"
   ```
2. **`app.json`**:
   ```json
   "expo": {
     "version": "1.1.0"
   }
   ```
3. **`CHANGELOG.md`**:
   * Move items from `[Unreleased]` into a new release heading:
     ```markdown
     ## [1.1.0] - YYYY-MM-DD

     ### Added
     - Floating action feedback banner with instant Undo support.
     - Confetti celebration when a track is fully completed.
     ```

### Step 5: Document Architectural Decisions in `DEVLOG.md`

Update `DEVLOG.md` with a dated entry explaining the *why* behind decisions:
* **What Changed**: Bullet points of files, components, and schema updates.
* **Design Decisions & Trade-offs**: *Why approach X was chosen over Y.*
* **Architecture State**: Notes on new domain helpers, provider additions, or migrations.

### Step 6: Stage Deliberately & Commit with Co-Authorship

1. Stage only the relevant files:
   ```bash
   git add src/ app/ package.json app.json CHANGELOG.md DEVLOG.md docs/
   ```
2. Inspect staged diff:
   ```bash
   git diff --staged
   ```
3. Commit using conventional format with required co-author trailer:
   ```bash
   git commit -m "feat(v1.1.0): implement action feedback, undo stack, and celebrations

   - Add ActionFeedbackProvider with 4-second floating toast
   - Implement domain revert helpers for advance, pause, and delete
   - Add CelebrationOverlay on track completion
   - Bump version to 1.1.0 in package.json and app.json

   Co-authored-by: Antigravity <antigravity@google.com>"
   ```
   *(If assisted by Claude Code, use `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`)*.

### Step 7: Multi-Branch Pipeline Integration

1. **Merge into `android`**:
   ```bash
   git checkout android
   git merge --no-ff <feature-branch>
   git push origin android
   ```
2. **Port to `web`**:
   * Invoke `.claude/skills/porting-android-changes-to-web/SKILL.md`.
   * Apply shared files, hand-merge diverged UI, verify with `npm run web`, and merge into `web`.
3. **Sync to `gh-pages`** (if user-facing features or marketing changed):
   * Update landing page simulator or copy on `gh-pages` branch.

---

## Release Checklist Quick Reference

- [ ] Started on clean branch off latest `android`.
- [ ] Domain logic verified with pure unit tests first.
- [ ] `npm run typecheck` passes with zero errors.
- [ ] `npm test` passes completely.
- [ ] `package.json` version bumped.
- [ ] `app.json` expo version bumped.
- [ ] `CHANGELOG.md` updated under Keep a Changelog format.
- [ ] `DEVLOG.md` updated with technical rationale and trade-offs.
- [ ] Git commit staged explicitly (no `git add .`) and includes co-author trailer.
- [ ] Ported to `web` branch using porting skill.

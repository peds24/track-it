# Track-it (Iris) — Feature Roadmap & Architectural Blueprint

*See full document at [`docs/ROADMAP.md`](./docs/ROADMAP.md).*

This roadmap establishes the technical implementation plan for the four major evolutions of `track-it`:

1. **v1.1.0 — Status Notifications, Action Feedback & Undo Stack**: Reliable undo mechanisms for advance, pause, and delete operations across all shelves, paired with celebration moments on completing media. **Still pending** — v1.2.0 shipped first (see below).
2. **v1.2.0 — Individual Track Details & Formatted Metadata**: Rich detail view for every item displaying full synopses, creator/author credits, persistent cover artwork, time-in-progress statistics, and inline action controls. **Shipped 2026-09-23** (see `CHANGELOG.md`).
3. **v1.3.0 — Polish from v1.2.0 feedback**: sharper covers, cleaner book search, Longbox-style comic advance, no typed unit count, and a feedback button. **Shipped 2026-09-24** (see `CHANGELOG.md`).
4. **v1.4.0 — Reading & Watching Insights (Stats Engine)** (was v1.3.0): Automated completion metrics, averages, category distributions, velocity metrics, and shareable graphic cards built on top of existing database timestamps.
5. **v2.0.0 — The "Iris" Evolution (Rebrand & Modern Glass UI)**: Transitioning to **Iris** — a refined, Apple-inspired human interface characterized by clean simplicity, subtle translucency (`expo-blur`), purposeful micro-animations, and a new camera/aperture brand identity.

---

### Release Milestones Summary

| Version | Milestone Name | Key Highlights | Database Migration? | Status |
| :--- | :--- | :--- | :---: | :--- |
| **v1.1.0** | **Action Feedback & Undo** | Toast notifications, Undo for Advance/Pause/Delete, Finish celebrations | No | Pending |
| **v1.2.0** | **Track Detail & Artwork** | Individual track pages, cover art, formatted details, time elapsed | **Yes** (cover_url, creator, blurb) | **Shipped 2026-09-23** |
| **v1.3.0** | **v1.2.0 Feedback Polish** | Sharper covers, book search filtering, comic cover/issue advance, no typed count, feedback button | No | **Shipped 2026-09-24** |
| **v1.4.0** | **Stats & Visual Insights** | Stats tab, velocity/averages, shareable graphic cards via `expo-sharing` | No | Pending |
| **v2.0.0** | **Iris Rebrand & Glass UI** | Name change, aperture logo, glass design system (`expo-blur`), modern UI | No | Pending |

*Refer to [`docs/ROADMAP.md`](./docs/ROADMAP.md) for full architectural layer breakdowns, schema migrations, and UI specifications.*

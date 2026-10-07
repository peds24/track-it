# Iris — native iOS app

The SwiftUI iOS app for Track It, being rebuilt as **Iris** (amendment A28,
`docs/superpowers/specs/2026-10-06-iris-design.md`). Android and web stay
on the Expo/TS app at the repo root.

## Requirements

Xcode 27+, an iOS 26 simulator runtime, and `xcodegen` (`brew install xcodegen`).

## Build, run, test

    apple/scripts/test.sh               # IrisCore + UI tests (simulator "iPhone 17")
    apple/scripts/test.sh --core-only   # IrisCore only, no simulator
    IRIS_SIM="iPhone 17 Pro" apple/scripts/test.sh

To work in Xcode: `xcodegen generate --spec apple/project.yml --project apple && open apple/Iris.xcodeproj`.
**Never commit `Iris.xcodeproj`**: edit `project.yml` and regenerate.

API keys: `cp apple/Iris/Config/Secrets.example.xcconfig apple/Iris/Config/Secrets.xcconfig`
and fill it in (git-ignored). The app builds without it; catalogue search
won't work.

## Layout

    IrisCore/      Swift package: Domain, Persistence, Providers. No SwiftUI/UIKit.
    Iris/          SwiftUI app: App, DesignSystem, Features, Resources, Config
    IrisUITests/   launch/smoke/screenshot tests
    scripts/       test.sh

## Rules

- `IrisCore` never imports UI frameworks, and `Domain/` does no I/O.
- Domain behaviour must match the TS app. From I2 on, `shared/fixtures/*.json`
  is run by both jest and XCTest; a domain change lands its fixture first.
- `IrisSchema.version` must equal `MIGRATIONS.length` in `src/db/schema.ts`.
- Work on `worktree-iris-<slug>` branches; merge into `iris` with `--no-ff`.
- `IrisCore/Domain` ports `src/domain` one file per TS file, held to it by
  `shared/fixtures` (every case runs in `swift test`). Where the TS relies on
  a JavaScript built-in's quirks, reproduce them in `JSCompat.swift` /
  `ISODate.swift`, never inline.
- `IrisCore/Persistence` ports `src/data` and `src/db`, held to them by
  `shared/scenarios` (A29). Never hand-edit `Migrations.generated.swift`; it
  comes from `npm run fixtures:record`.
- `IrisCore/Providers` ports `src/providers`, held to them by
  `shared/providers`. Providers take an injected `HTTPClient`; tests never
  touch the network — they replay the recorded calls. Keys come from
  `Iris/Config/Secrets.xcconfig` (git-ignored) via Info.plist.
- Never hand-edit `Iris/DesignSystem/IrisTokens.swift`. Edit
  `design/iris/tokens.json` and run `npm run tokens` from the repo root.

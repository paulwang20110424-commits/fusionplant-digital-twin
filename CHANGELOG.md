# Changelog

All notable changes to **FusionPlant Digital Twin** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Every value produced by this project is **simulated**. It is an educational and
> software-validation artefact, not a representation of any real fusion device.

## [1.2.0] — 2026-10-23 · "Reproducible Twin"

### Added

- **Version baseline**: `src/config/version.ts` (`APP_VERSION`, `MODEL_VERSION`,
  `EXPORT_SCHEMA_VERSION`, `RELEASE_NAME`), shown in the top bar and Simulation Lab;
  `npm run version:check` verifies every version source agrees.
- **Reproducible runs**: stable `runId`, seeded PRNG helpers (`createSeededRandom`,
  `normalizeSeed`, `generateRunId`), a run-identity panel with seed randomisation,
  "Copy run configuration" and "Reproduce run".
- **Rich export metadata**: every JSON/CSV export now carries `appVersion`,
  `modelVersion`, `exportSchemaVersion`, `runId`, `randomSeed`, `scenario`,
  `timeScale`, `exportedAt` and the simulation disclaimer. Export file names include
  run id, scenario, timestamp and app version.
- **Session import** with schema validation, legacy support and clear incompatibility
  messages; sessions can be renamed, duplicated in A/B, and their run id copied.
- **Guided demo** (9 steps): start the plant, raise NBI, read the plasma state,
  explore the 3D twin, inject and clear a simulated fault, capture history and run a
  WHAT-IF comparison. Local only, non-modal, resettable.
- **3D ↔ device linkage**: component registry mapping 3D parts, equipment rows, pages
  and fault types; hover tooltips, jump-to-page, fault badges and a "simulated
  propagation" indicator.
- **URL state**: `?page=`, `?scenario=`, `?seed=`, `?view=`, `?selectedComponent=`,
  `?replayRunId=` with back/forward support and safe fallbacks.
- **Accessibility**: accessible names on every control, `aria-current` navigation,
  switch semantics, slider value text, `aria-live` status regions, skip link,
  focus-visible styling and an axe-core audit (`npm run test:a11y`).
- **Quality gates**: ESLint (TypeScript/React Hooks/jsx-a11y), Prettier,
  `npm run stats` build-size report, documentation-asset check, and a CI browser
  audit job with artefact upload.
- **Tests**: 46 new unit tests (129 total) covering versions, trend units, alarm
  semantics, guided-demo state, URL state, seed determinism and export round-trips.

### Changed

- **Alarm semantics**: INFO records are now _notices_ and are excluded from the
  "Active alarms" count. The top bar shows `ALARMS` (CRITICAL + WARNING) and
  `NOTICES` (INFO) separately, and the alarm feed/diagnostics table gained
  All / Critical / Warning / Info filters.
- **Top status bar** rebuilt on an explicit three-column grid; status fields are
  fixed-width and nowrap, with responsive tiers at 1440 / 1280 / 1024 px. E-STOP and
  the transport controls are always visible.
- **Build toolchain**: TypeScript pinned to 6.0 (TypeScript-ESLint does not yet
  support the TypeScript 7 API); `.npmrc` sets `legacy-peer-deps` so `npm ci` matches.
- JSON exports keep `exportVersion: 1` for legacy readers and add
  `exportSchemaVersion: 1` (additive change only).
- `PersistedSession` gained optional reproducibility fields; older files still load.

### Fixed

- **KPI trend units**: Density deltas were computed in raw m⁻³ (displaying ~1e17
  changes) and Stability deltas in the 0–1 index instead of percentage points. All
  tiles now declare an explicit `valueScale` / `trendUnit`, and invalid values render
  `N/A` instead of NaN/Infinity.
- **INFO counted as an active alarm** in the overview subtitle and the diagnostics
  badge.
- **PHASE / SCENARIO compression** at 1280 px — labels such as `FLAT-TOP` no longer
  wrap or truncate into unreadable fragments.
- **Resume after the configured run duration** re-paused immediately; the auto-pause
  now fires once and disarms until the next explicit start.
- **Streaming CSV export** now includes all provenance metadata instead of only a
  timestamp.

### Compatibility

- Existing v1.0.0 JSON sessions import cleanly (shown as a _legacy_ import with
  compatibility notes).
- Local storage keys (`fusionplant.sessions.v2`, `fusionplant.presets.v1`) are
  unchanged; new optional fields are additive.
- No physics equation, default, or model constant changed. `MODEL_VERSION` stays
  `1.0.0`.

## [1.0.0] — 2026-10-23 · Initial release

- Fixed-step 0-D simulation engine (plasma energy balance, magnetics, heating,
  thermal loop, power balance, stability scoring, alarm supervision).
- Procedural 3D tokamak with component selection, cutaway/plasma views and
  per-structure visibility.
- Nine console pages, live charts, fault injection, WHAT-IF comparison, history
  recording and CSV/JSON export.
- 83 unit tests, headless Playwright audit and GitHub Actions CI.

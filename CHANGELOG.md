# Changelog

All notable changes to this project will be documented in this file.

## 1.4.0

- Redesigned the status bar hover tooltip using a cleaner Layout-5-style monospace summary block instead of the previous Markdown table.
- Improved tooltip hierarchy and readability:
  - compact aligned summary rows
  - preserved pacing detail
  - cleaner top-model section
  - billed/value block only when overage is active
- Decoupled `Requests by Model` from `Billing Details` behavior.
  - Per-model request data is now fetched whenever any billing-powered feature needs it, even if the billing summary toggle is off.
  - `Requests by Model` can now be used independently while still under quota and with billed overage at `$0.00`.
- Split the dashboard into separate `Billing Details` and `Requests by Model` sections for clearer control and better information hierarchy.

## 1.2.0

- Added separate dashboard toggles for **Billing Details** and **Requests by Model**.
  - `Billing Details` controls whether billing data is fetched and shown at all.
  - `Requests by Model` controls whether the model-level request breakdown table is displayed while billing details remain enabled.
- Improved settings UX so users can keep billing summary data visible without displaying the full model table.

## 1.1.0

- Fixed the **Show Cost in Status Bar** toggle so it now shows billed/net cost (`totalNet`) instead of gross cost.
- Updated the status bar and dashboard copy to clearly label this as billed cost.
- Switched the premium quota bar and billing model bars to consistent geometry-based rendering, matching the same ratio-driven logic used by the circular gauge.

## 1.0.0

- **Billing Details** — new opt-in feature powered by the official GitHub billing endpoint (`GET /users/{login}/settings/billing/premium_request/usage`).
  - Enable via the new **Billing Details** toggle in the dashboard settings section.
  - Shows a **billing summary card** with total requests, gross cost, billed/overage amount, and price per unit.
  - **Per-model request breakdown** — collapsible table sorted by request count with color-coded bars proportional to each model's share. Top 5 models shown immediately; expand to see all.
  - **Overage banner** — prominent red callout when `totalNet > 0`, with billed amount as the primary signal.
  - **Grant Access flow** — when the `user` OAuth scope is not yet granted, the dashboard shows an explanatory message with a "Grant Access" button. Scope status is cached in global state to avoid re-prompting.
- **Cost in status bar** — new `showCostInStatusBar` toggle appends gross cost (e.g. `· $4.31`) to any active text mode when billing data is available.
- **`billedOnly` status bar mode** — new text mode that shows the net billed overage amount (`+$X.XX`). Defaults to `+$0.00` when no overage.
- **Top-5 Models in tooltip** — when billing is enabled, the hover tooltip shows a compact `Requests by model` table (top 5, sorted by request count). The value/billed block appears only when overage is active.
- Billing fetch is fully **non-blocking** — failure never affects the main usage data flow; `billing` is set to `null` and the UI degrades gracefully.
- Bumped minimum VS Code engine requirement remains `^1.100.0`.

## 0.4.5

- Added two new graphic display modes for the status bar:
  - **Braille** (`⣿⣿⣿⣿⣀⣀⣀⣀`) — high-density braille dot bar.
  - **Rectangles** (`▮▮▮▮▯▯▯▯`) — filled/outline rectangle bar.

## 0.4.4

- **Text Position is now a toggle button** — replaced the dropdown for `statusBarTextPosition` with a compact **← Left / Right →** two-button toggle in the dashboard settings panel.
- Fixed bug where dashboard setting changes (Text Mode, Graphic Mode, Text Position) were silently dropped — `updateSetting` allowlist in `extension.ts` was still referencing the removed `statusBarMode` key instead of the three new keys.

## 0.4.3

- **Split status bar display into two independent settings** — `statusBarTextMode` and `statusBarGraphicMode` replace the single `statusBarMode` setting.
- `statusBarTextMode` controls the text label: `none`, `count`, `percent`, `countPercent`, or `remaining`.
- `statusBarGraphicMode` controls the visual bar: `none`, `segmented`, `blocks`, `thinBlocks`, `dots`, or `circles`.
- New `statusBarTextPosition` setting (`left` / `right`) controls whether the text appears before or after the graphic.
- Any combination is now possible — text only, graphic only, or both in either order (e.g. `50% [■■■■□□□□]` or `[■■■■□□□□] 50%`).
- Dashboard settings panel updated with three separate controls for the new options.
- Config validation prevents both text and graphic from being `none` simultaneously — falls back to `percent` text.

## 0.4.2

- Fixed quota bar track visibility — bar now uses the input background + border so the unfilled portion is clearly visible on all themes.
- Added **pacing indicator** — “Requests / Day” stat in the dashboard hero shows how many requests per day you can use to stay within quota until reset. Highlights in warning color when pace drops to 5 or fewer.
- Redesigned tooltip — replaced the redundant progress bar with a pacing line (“~11 req/day to last until May 1”), showing days left and daily budget at a glance.
- Replaced “Last Updated” hero stat with the more actionable pacing stat; updated time now shown in footer with pacing summary.

## 0.4.1

- Fixed the usage gauge ring — arc now correctly fills proportional to usage instead of showing a full circle.
- Switched gauge from `stroke-dashoffset` to two-value `stroke-dasharray` for reliable partial-fill rendering.
- Redesigned the status bar hover tooltip — now shows a visual progress bar, Chat/Completions quotas, days-until-reset countdown, and action links (Refresh / Dashboard).
- Tooltip uses codicons, horizontal rules, and structured layout for better readability.

## 0.4.0

- **Redesigned dashboard** — replaced the minimal detail panel with a rich, theme-aware dashboard featuring an SVG usage gauge, quota breakdown cards, account info, and inline settings.
- Added **SVG circular progress gauge** for premium request usage with animated fill and color thresholds (green / warning / critical).
- Added **quota cards** for Chat, Completions, and Premium Interactions — each showing usage bars and remaining counts parsed from the API.
- Added **Account section** showing plan type, Chat and MCP enabled status, and member-since date.
- Added **inline settings panel** — status bar display mode, refresh interval, bar width, and color thresholds can now be configured directly from the dashboard without opening VS Code settings.
- New API fields parsed: `chat` and `completions` quota snapshots, `chat_enabled`, `is_mcp_enabled`, `assigned_date`, `access_type_sku`.
- Added `QuotaSnapshot` model and expanded `UsageData` and `DetailViewModel` with enriched data.
- Days-until-reset countdown and overage indicator shown in the hero stats area.
- Dashboard uses VS Code CSS variables exclusively — blends with any light, dark, or high-contrast theme.
- Removed the separate "Open Settings" button — settings live on the dashboard now.

## 0.3.0

- **Full rewrite** — replaced all local tracking, heuristic estimation, chat participant, and org-level metrics with a single direct call to the `copilot_internal/user` GitHub API endpoint.
- Plan (Free, Pro, Pro+, Business, Enterprise) is now read directly from the API response — no longer misdetected from org membership.
- Exact `used / quota` numbers come from GitHub; no local estimation or allowance guessing.
- Added overage support — when paid overage is in use the status bar exceeds 100% and the tooltip shows the overage count.
- Added offline recovery mode — last known values are shown when the network is unavailable and the extension retries automatically every 10 seconds.
- Added configurable status bar display modes: `percent`, `count`, `countPercent`, `remaining`, `segmented`, `blocks`, `thinBlocks`, `dots`, `circles`, `hybrid`.
- Added configurable `segmentedBarWidth` (4–16 segments, default 8).
- Simplified command set to: Sign In, Refresh, Open Details, Disconnect, Open Settings.
- Simplified settings to: `refreshIntervalMinutes`, `threshold.enabled`, `threshold.warning`, `threshold.critical`, `statusBarMode`, `segmentedBarWidth`.
- Removed chat participant, exact tracker, heuristic tracker, aggregator, and all storage for local events.
- Disconnect now works correctly — uses a globalState flag so VS Code's built-in GitHub session is not re-used silently after disconnecting.

## 0.2.0

- Added personal GitHub Copilot API integration to automatically detect plan type and fetch premium request usage directly from GitHub.
- Status bar now shows "Connect" with a click-to-connect prompt before GitHub authentication, instead of showing 0 usage.
- Plan detection now uses the personal Copilot API instead of organization seat assignments � no longer misdetects org Business plan for personal Pro users.
- Added disconnect and reconnect account options in the setup flow and as a command palette entry.
- Removed organization metrics section from the dashboard and status bar tooltip.
- Added debug logging in the Output panel for personal API endpoint probing.
- Fixed model multiplier defaults � unknown models now count as 1 instead of 0.
- Fixed CSP nonce generation to use crypto.randomUUID.

## 0.1.1

- Added first-run account setup so the extension no longer silently assumes a `300` request allowance.
- Added support for using the GitHub account already signed into VS Code or a stored PAT.
- Added plan presets for Free, Student, Pro, Pro+, Business, Enterprise, and Custom allowances.
- Added right-side status bar placement by default and additional compact progress-bar styles.

## 0.1.0

- Initial preview release of Copilot Usage Insights.
- Added a single status bar item with configurable compact display modes.
- Added exact tracked prompt support through commands and a chat participant.
- Added heuristic local usage estimation, pacing, and recent trend summaries.
- Added a detail panel with Personal, Official Organization, Insights, and Settings sections.
- Added best-effort GitHub organization usage refresh through VS Code GitHub authentication.

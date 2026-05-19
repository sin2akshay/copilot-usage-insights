# Changelog

All notable changes to this project will be documented in this file.

## 1.9.1

- **Fixed month picker not visible on new installs.** The month dropdown was only rendered when sessions from more than one calendar month existed. On a fresh install with no cross-month history, it was always hidden. The picker now always appears: when only the current month is available it renders as a static `Month · May 2026` label; once sessions accumulate across multiple months it upgrades to the full dropdown automatically.

## 1.9.0

### Session chat titles in the session list

The session table now shows the **Copilot-generated chat title** as the primary identifier for each row, making it much easier to recognise which conversation a session came from. The title (e.g. "Upgrade VS Code extension for tracking") is extracted from the `title` child log file that Copilot writes alongside each session's `main.jsonl`. Workspace name and relative time are displayed as secondary metadata below the title. Sessions from older Copilot versions that predate the title file fall back to the original time · workspace format.

### Quick-jump Settings button

A gear icon button is now shown in the dashboard header (next to Refresh and the month picker) when the AI Credits view is active. Clicking it smoothly scrolls the page to the Settings section at the bottom — useful when the session list is long.

### One-time estimate disclaimer notice

A dismissable notice now appears at the top of the AI Credits dashboard on first open, explaining that the credits and dollar amounts shown are local estimates calculated from debug logs rather than official GitHub billing data. Dismissing it writes a flag to VS Code global state so the notice never reappears, even after restarting VS Code.

### Duration format

Session durations are now shown in hours-and-minutes format (`1h 23m`) wherever a duration appears in the dashboard — the quick-stats strip, the Session Info grid, and the long-session insight pill. Durations under an hour continue to show as plain minutes (`45m`).

## 1.8.3

### Cost calculation fix — cached tokens (breaking change for existing cache)

- **Fixed a significant cost over-estimation bug** where cached tokens were billed twice. Copilot debug logs report `attrs.inputTokens` as the total input (cached + uncached), and `attrs.cachedTokens` as the cached subset. The old code charged the full input rate on all `inputTokens` and then additionally charged the cached rate on `cachedTokens`, resulting in double-billing of every cached token. The fix computes `nonCachedInput = inputTokens − cachedTokens` and charges each bucket at its correct rate. Sessions with high cache-hit rates (common in agent mode with large, repeated context) were overestimated by up to 5–11×.
- The same fix applies to OpenAI-format API usage fields (`usage.prompt_tokens_details.cached_tokens` / `usage.cached_tokens`) where `prompt_tokens` also includes the cached portion.
- For Anthropic-format fields (`usage.cache_read_input_tokens`), no change — those are already reported separately from `input_tokens`.
- **Session cache version bumped** from `v1` to `v2`. All previously cached session cost estimates are discarded on first load and re-computed from the raw log files with the corrected formula.

### New: Rebuild Session Cache button

- Added a **Rebuild** button in the AI Credits Settings section of the dashboard. Clicking it clears the session cache entirely and re-parses all log files from scratch. Useful after a pricing update or if session cost data looks wrong.

### Other improvements

- **Status bar now visible immediately on startup** — the extension showed a blank status bar item while the initial session cache was being built. It now shows a loading spinner from the moment it activates.
- **Lookback default increased from 35 to 60 days** so more historical sessions are visible by default.
- **Lookback setting description** added in the dashboard so the field purpose is self-explanatory.

### Known limitation — cross-month session attribution

Sessions that span a month boundary (e.g. started April 29, last message May 2) are attributed **entirely to the month of the last message**. The full session cost appears in May; April shows none of it. This means months where you had long-running cross-boundary sessions may appear slightly cheaper or more expensive than the true spend. A per-turn attribution model would be more accurate but requires a larger data structure change; this is tracked for a future release.

## 1.8.2

- Rewrote README to cover both the Premium Requests and AI Credits dashboards with accurate feature descriptions and screenshots.
- Added dashboard screenshots for the AI Credits view, cumulative cost chart, and session detail panel.

## 1.8.1

- Replaced the cumulative burn bar chart with a smooth **line chart** showing estimated dollar cost over the billing period. The chart uses a filled area under the curve with a dashed budget-limit line, and a color change from accent to red once the allowance is exceeded.
- Added a **Y-axis** to the line chart showing estimated dollar cost at 4–5 human-friendly tick values, with matching horizontal gridlines inside the plot area.
- Removed the redundant AIC summary line that appeared below the chart x-axis.
- Added colored rounded-square **swatches** before each model name in the Credit Share by Model section of session detail.
- Fixed Token Composition legend icons not rendering — `display: inline-block` was missing so width/height were ignored by the browser.
- Improved Token Composition legend spacing to match the Credit Share labels (increased gap between items, aligned each item as a flex row).
- Tool Call chart bars now expand to fill the full available width rather than being capped at 100px.
- Dashboard max-width increased from 840px to 1100px.
- Added subtle horizontal dividers between Model Breakdown, Credit Share, and Token Composition sections in the session detail panel.

## 1.8.0

### AI Credits dashboard redesign

- Replaced the flat card layout with a structured two-column dashboard: a **Status Hero** at the top showing budget status badge, credits used, dollars spent, total tokens, and days left in cycle.
- **Credits by Model** card now renders a two-line row per model — name and value on the first line, full-width proportional bar below — showing top 5 models with an overflow row (`+N more models · X AIC`) for the rest.
- Model swatches changed from circles to rounded squares throughout the dashboard (mini-card, session detail table, and token composition legend).
- Expanded model color palette from 6 to 10 well-spaced, distinct hues so models are easier to tell apart at a glance.
- **Pace & Projections** card improved: clearer row labels, `AIC/day` suffix on rate rows, month-end projection now shows the delta against allowance (negative = over budget), overage cost reflects what has already been spent above the allowance, and subtle divider lines separate each row.
- **Burn chart** shows daily cumulative spend; bars turn red once the cumulative total crosses the allowance. Chart subtitle and summary line clearly label data as coming from session logs.
- **Session detail** panel now includes a **Credit share by model** proportional stacked bar (shown when a session used more than one model), with per-model percentage labels in matching colors.
- Tool Calls chart uses a per-tool color palette (muted tones) instead of a single accent color, making it easier to scan.

### Bug fixes and accuracy improvements

- Fixed a data-source mismatch where the GitHub billing API's Premium Requests response was being misinterpreted as AI Credits. `fetchCreditsAggregate` now returns `null` when the API reports only `unitType: "requests"` items, so the dashboard correctly falls back to session-derived estimates until the June 2026 AI Credits transition.
- Added Gemini model ID aliases in the log parser: `gemini-3-flash-preview` → `gemini-3-flash`, `gemini-3.1-pro-preview` → `gemini-3.1-pro`, `gemini-2.5-pro-preview` → `gemini-2.5-pro`. Sessions using preview-suffixed model IDs now get correct per-token pricing instead of the generic fallback rate.
- When official API credits data is available, the burn chart and model card display a reconciliation note explaining the gap between session log totals and the official figure (other devices, pre-lookback activity).

## 1.7.1

- Clarified GitHub sign-in wording across the README, status bar, and dashboard empty state so the extension now explains that VS Code may reuse an existing GitHub session or ask the user to authorize access for this extension.
- Updated Quick Start and command descriptions to reflect the VS Code authentication consent flow more accurately.

## 1.7.0

- Added managed-plan handling for Copilot Business and Enterprise accounts:
  - billing controls are replaced with managed-plan messaging
  - the dashboard footer now links to Copilot feature settings instead of personal billing settings
  - billing-scope auth is skipped for managed plans
- Added managed-plan billed-only estimation using the documented `$0.04/request` standard rate when exact billed totals are not available to end users.
- Restored the default warning threshold to `75%` and turned `Show Requests by Model` off by default.
- Added managed-plan preview states and updated dashboard note styling for the new messaging.

## 1.6.0

- Unified premium request count calculations so the status bar, tooltip, and dashboard all show the same usage and remaining values.
- Prefer exact `remaining` counts from GitHub quota snapshots when available, avoiding off-by-one mismatches caused by percentage rounding.
- Improved percentage formatting consistency across the dashboard usage views.
- Changed the default warning threshold from `75%` to `80%`.

## 1.5.0

- Refreshed the README status bar preview asset so it matches the current hover content and codicon-based layout.
- Improved the preview generator alignment:
  - tooltip stays inside the frame
  - tooltip pointer aligns from the middle of the usage status item
  - exported screenshot now matches the current preview composition

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

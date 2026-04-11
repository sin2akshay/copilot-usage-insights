# Changelog

All notable changes to this project will be documented in this file.

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

- **Full rewrite** � replaced all local tracking, heuristic estimation, chat participant, and org-level metrics with a single direct call to the `copilot_internal/user` GitHub API endpoint.
- Plan (Free, Pro, Pro+, Business, Enterprise) is now read directly from the API response � no longer misdetected from org membership.
- Exact `used / quota` numbers come from GitHub; no local estimation or allowance guessing.
- Added overage support � when paid overage is in use the status bar exceeds 100% and the tooltip shows the overage count.
- Added offline recovery mode � last known values are shown when the network is unavailable and the extension retries automatically every 10 seconds.
- Added configurable status bar display modes: `percent`, `count`, `countPercent`, `remaining`, `segmented`, `blocks`, `thinBlocks`, `dots`, `circles`, `hybrid`.
- Added configurable `segmentedBarWidth` (4�16 segments, default 8).
- Simplified command set to: Sign In, Refresh, Open Details, Disconnect, Open Settings.
- Simplified settings to: `refreshIntervalMinutes`, `threshold.enabled`, `threshold.warning`, `threshold.critical`, `statusBarMode`, `segmentedBarWidth`.
- Removed chat participant, exact tracker, heuristic tracker, aggregator, and all storage for local events.
- Disconnect now works correctly � uses a globalState flag so VS Code's built-in GitHub session is not re-used silently after disconnecting.

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

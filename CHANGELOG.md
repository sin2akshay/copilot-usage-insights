# Changelog

All notable changes to this project will be documented in this file.

## 0.2.0

- Added personal GitHub Copilot API integration to automatically detect plan type and fetch premium request usage directly from GitHub.
- Status bar now shows "Connect" with a click-to-connect prompt before GitHub authentication, instead of showing 0 usage.
- Plan detection now uses the personal Copilot API instead of organization seat assignments — no longer misdetects org Business plan for personal Pro users.
- Added disconnect and reconnect account options in the setup flow and as a command palette entry.
- Removed organization metrics section from the dashboard and status bar tooltip — the extension now focuses on personal usage only.
- Added `copilot` OAuth scope for GitHub authentication to enable Copilot API access.
- Added debug logging in the Output panel for personal API endpoint probing to help diagnose connectivity issues.
- Fixed model multiplier defaults — unknown models now count as 1 instead of 0.
- Fixed case-insensitive model name lookup for premium multipliers.
- Improved heuristic tracking correlation weights for more accurate estimates.
- Fixed CSP nonce generation to use crypto.randomUUID.
- Fixed data loss on heuristic tracker dispose by flushing pending bursts first.

## 0.1.1

- Added first-run account setup so the extension no longer silently assumes a `300` request allowance.
- Added support for using the GitHub account already signed into VS Code or a stored PAT for GitHub connectivity.
- Added plan presets for Free, Student, Pro, Pro+, Business, Enterprise, and Custom allowances.
- Added right-side status bar placement by default and additional compact progress-bar styles.
- Added clearer UX around a key limitation: GitHub does not expose a supported public personal quota endpoint for current premium-request balance, so the extension seeds allowance from the selected plan and uses GitHub only where supported APIs exist.

## 0.1.0

- Initial preview release of Copilot Usage Insights.
- Added a single status bar item with configurable compact display modes.
- Added exact tracked prompt support through commands and a chat participant.
- Added heuristic local usage estimation, pacing, and recent trend summaries.
- Added a detail panel with Personal, Official Organization, Insights, and Settings sections.
- Added best-effort GitHub organization usage refresh through VS Code GitHub authentication.
# Copilot Usage Insights

Copilot Usage Insights is a preview VS Code extension for tracking GitHub Copilot usage through one compact status bar item and one richer detail panel.

It combines three clearly separated sources of activity:

- **GitHub Copilot API** — Fetches your actual premium request usage and plan type directly from GitHub when connected.
- **Exact tracked requests** — Requests sent through extension-owned Copilot entry points for precise counting.
- **Heuristic local estimates** — Best-effort estimates from public VS Code editing signals.

The extension stores metadata only. It does not persist prompt text, response text, or editor contents.

## Why This Exists

GitHub Copilot usage is fragmented. Some requests can be tracked exactly when the extension owns the request path, some activity can only be estimated from public editor signals, and official organization data is often delayed or permission-gated. This extension keeps those sources separate instead of pretending they are all equally authoritative.

## Highlights

- Automatic plan detection and premium request usage from the GitHub Copilot API.
- Status bar shows "Connect" before authentication, then live usage after connecting.
- One global status bar item with configurable left or right placement and multiple visual modes.
- Extension-owned tracked Copilot requests through a command and a chat participant.
- Budget pacing, projected month-end usage, and remaining daily budget.
- Recent trend sparkline and rising or flat or falling classification.
- Detailed webview with GitHub API usage, Local Tracking, Insights, and Settings sections.
- Disconnect and reconnect account from the command palette or the dashboard.
- Graceful fallback to local-only insights when GitHub API data is unavailable.

## Usage

Open the command palette and use one of the extension commands, or mention `@usage-insights` in chat.

- `Copilot Usage Insights: Set Up Account`
- `Copilot Usage Insights: Open Details`
- `Copilot Usage Insights: Refresh Stats Now`
- `Copilot Usage Insights: Run Tracked Prompt`
- `Copilot Usage Insights: Disconnect Account`
- `Copilot Usage Insights: Open Settings`

The chat participant supports:

- `/track` to send a tracked request through the extension-owned Copilot path
- `/usage` to summarize current usage, pacing, and trend

## Account Setup

On first run, the status bar shows **Connect** — click it or run the setup command. The extension will:

1. Authenticate with GitHub using your existing VS Code session or a PAT.
2. Automatically detect your Copilot plan type (Free, Pro, Pro+, etc.) from the GitHub API.
3. Fetch your current premium request usage directly from GitHub.

If the API cannot determine your plan, you'll be asked to select it manually. You can disconnect and reconnect at any time from the command palette or the dashboard.

## Settings

The extension contributes a focused settings surface under `copilotUsageInsights` for:

- Tracking mode
- Plan preset
- Monthly allowance
- Paid overage assumption
- Paid overage rate
- Refresh interval
- Heuristic tracking toggle
- Status bar side
- Status bar mode
- Segmented bar width
- Trend window
- Model multipliers

## Privacy

- Prompt text is not persisted.
- Response text is not persisted.
- Editor contents are not persisted.
- Local storage is limited to metadata such as timestamps, model identifiers, durations, counters, confidence labels, and official snapshot freshness.

## Development

```bash
npm install
npm run build
npm test
```

Launch the extension in an Extension Development Host from VS Code after building.

## Package The Extension

```bash
npm install
npm run package:vsix
```

This generates a `.vsix` package in the repository root that can be installed with `Extensions: Install from VSIX...`.

## Publish To Marketplace

Before publishing, make sure the Marketplace publisher exists and that you have logged in with `vsce` using a Marketplace PAT.

```bash
npx @vscode/vsce login sin2akshay
npx @vscode/vsce publish
```

If you want to publish a pre-release build first, use:

```bash
npx @vscode/vsce publish --pre-release
```

## Caveats

- The GitHub Copilot personal usage API endpoints may vary across plan types and GitHub's API evolution. The extension probes multiple endpoints and uses the first one that returns usable data.
- The status bar intentionally stays within a single item even when the user selects forecast, pace, or trend visualizations.
- If none of the API endpoints return data for your account, the extension falls back to local tracking estimates.
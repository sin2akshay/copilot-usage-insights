# Copilot Usage Insights

A VS Code extension that shows your GitHub Copilot premium request usage directly in the status bar.

## How It Works

On sign-in the extension calls the GitHub Copilot internal API (`copilot_internal/user`) — the same endpoint used by other community Copilot usage tools — to read your actual premium request quota and consumption. No local estimation, no org-level data, no guessing.

- **Plan detection** — your plan (Free, Pro, Pro+, Business, Enterprise) is read from the API response, not inferred from org membership.
- **Quota & usage** — exact `used / quota` numbers from GitHub, refreshed on a configurable interval.
- **Overage tracking** — if you're on a plan with paid overage, the status bar will exceed 100%.
- **Offline recovery** — if the network is unavailable the last known values are shown; the extension retries automatically every 10 seconds.

## Dashboard

Click the status bar item or run **Copilot Usage Insights: Open Details** to open the dashboard. It includes:

- **Usage gauge** — animated SVG ring showing premium request consumption with color thresholds.
- **Key stats** — days until reset, remaining requests, reset date, and overage at a glance.
- **Quota breakdown** — Chat, Completions, and Premium Interactions cards with usage bars.
- **Account info** — plan type, Chat/MCP enabled status, and membership date.
- **Inline settings** — change status bar mode, refresh interval, bar width, and color thresholds without leaving the dashboard.

The dashboard uses VS Code CSS variables throughout, so it automatically adapts to any light, dark, or high-contrast theme.

## Status Bar Modes

Configure `copilotUsageInsights.statusBarMode` to choose how usage is shown:

| Mode | Example |
|---|---|
| `percent` *(default)* | `50%` |
| `count` | `150/300` |
| `countPercent` | `150/300 (50%)` |
| `remaining` | `150 left` |
| `segmented` | `[■■■■□□□□] 50%` |
| `blocks` | `████░░░░ 50%` |
| `thinBlocks` | `▰▰▰▰▱▱▱▱ 50%` |
| `dots` | `••••···· 50%` |
| `circles` | `●●●●○○○○ 50%` |
| `hybrid` | `150/300 [■■■■□□□□]` |

## Commands

| Command | Description |
|---|---|
| `Copilot Usage Insights: Sign In` | Sign in with GitHub |
| `Copilot Usage Insights: Refresh` | Refresh usage data now |
| `Copilot Usage Insights: Open Details` | Open the detail panel |
| `Copilot Usage Insights: Disconnect Account` | Disconnect and clear the session |
| `Copilot Usage Insights: Open Settings` | Open extension settings |

## Settings

| Setting | Default | Description |
|---|---|---|
| `refreshIntervalMinutes` | `5` | How often to refresh (1–60 min) |
| `threshold.enabled` | `true` | Enable color-coded threshold warnings |
| `threshold.warning` | `75` | Warning color threshold (%) |
| `threshold.critical` | `90` | Critical/error color threshold (%) |
| `statusBarMode` | `percent` | Status bar display style |
| `segmentedBarWidth` | `8` | Number of segments in bar styles (4–16) |

## Privacy

The extension stores only your GitHub login name in VS Code's global state. No prompt text, response text, or editor contents are ever read or stored. All usage data is fetched from GitHub — nothing is inferred locally.

## Development

```bash
npm install
npm run build   # bundle with esbuild
npm test        # vitest unit tests
npm run check   # TypeScript type-check
```

Launch in an Extension Development Host from VS Code after building.

## Package

```bash
npm run package:vsix
```

Produces a `.vsix` in the repository root. Install via **Extensions: Install from VSIX…**.

## Publish

```bash
npx @vscode/vsce login sin2akshay
npx @vscode/vsce publish
# or for pre-release:
npx @vscode/vsce publish --pre-release
```

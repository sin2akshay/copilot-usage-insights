# Copilot Usage Insights

[![Latest release](https://img.shields.io/github/v/release/sin2akshay/copilot-usage-insights?label=release)](https://github.com/sin2akshay/copilot-usage-insights/releases) [![License](https://img.shields.io/github/license/sin2akshay/copilot-usage-insights)](LICENSE) [![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.100.0-007acc)](https://code.visualstudio.com/)

> VS Code Marketplace availability is in progress. Until then, install the extension from the GitHub Releases `.vsix` package.

See your GitHub Copilot premium request usage without leaving VS Code.

GitHub Copilot usage is built around [premium requests](https://docs.github.com/en/copilot/concepts/billing/copilot-requests), not a simple token balance shown in the editor. GitHub gives each plan a monthly premium request allowance, and premium models or features can deduct from that allowance using model-specific multipliers. This extension makes that request-based system easier to see and manage inside VS Code. For plan details, see [Plans for GitHub Copilot](https://docs.github.com/en/copilot/get-started/plans-for-github-copilot).

Copilot Usage Insights adds a compact status bar indicator, a readable hover summary, and a full dashboard so you can answer the questions that actually matter while you work:

- How much quota have I used?
- How many requests do I have left?
- Am I burning through usage too quickly?
- Am I already in paid overage?

It is designed to stay quiet on startup, reuse an existing VS Code GitHub session when one is already available for this extension, and show real numbers from GitHub instead of local guesses.

**Status bar widget and hover tooltip**

![Status bar preview](assets/statusbar-preview.png)

**Dashboard with quota, pacing, billing, and request breakdown**

![Dashboard preview](assets/dashboard-preview.png)

## Why Install It

- Keep an eye on premium requests without opening GitHub or billing pages.
- Catch pacing issues early with remaining quota and requests-per-day guidance.
- See Chat, Completions, and Premium usage in one place.
- Optionally unlock billing and model-level breakdowns when you need deeper insight.
- Avoid noisy startup auth prompts: the extension stays idle until access is available or explicitly requested.

## Install

This extension is currently distributed through GitHub Releases as a `.vsix` package.

We are working on making it available on the VS Code Marketplace as well.

### Option 1: Download from Releases

1. Open the [Releases page](https://github.com/sin2akshay/copilot-usage-insights/releases).
2. Download the latest `.vsix` asset.
3. In VS Code, open the Extensions view.
4. Select the `...` menu in the top-right corner.
5. Choose **Install from VSIX...** and pick the downloaded file.

### Option 2: Install from the command line

```powershell
code --install-extension path\to\copilot-usage-insights-1.7.1.vsix
```

If the `code` command is not available in your shell, install from the VS Code Extensions view instead.

## Quick Start

1. Install the latest `.vsix` from the [Releases page](https://github.com/sin2akshay/copilot-usage-insights/releases).
2. If the status bar item shows **Sign in**, run **Copilot Usage Insights: Sign In** from the Command Palette.
3. VS Code may ask you to authorize this extension to use your GitHub account, or to sign in if no matching GitHub session exists yet.
4. Look at the status bar item next to the GitHub Copilot icon.
5. Hover for a quick summary, or click it to open the full dashboard.
6. If you want billing insight, enable **Billing Details** in the dashboard and grant the additional GitHub scope when prompted.

## What You Get

### In the status bar

- Live premium usage right next to the GitHub Copilot icon.
- Multiple text modes such as percent, used/quota, remaining, or billed-only.
- Optional compact graphics such as blocks, dots, circles, braille, and segmented bars.
- Warning and critical colors when your usage crosses configured thresholds.

### In the hover tooltip

- Your current plan and premium usage summary.
- Remaining quota and Chat/Completions status.
- A pacing hint such as how many requests per day you can spend until reset.
- Optional billing summary and top model usage when billing features are enabled.
- Quick actions to refresh or open the dashboard.

### In the dashboard

- An animated usage gauge for premium requests.
- Key stats for remaining requests, days until reset, and daily pacing.
- Separate quota cards for Chat, Completions, and Premium Interactions.
- Account details including plan type, Chat status, MCP status, and membership date.
- Optional billing summary, overage banner, and requests-by-model table.
- Inline settings so most display options can be changed without leaving the dashboard.

## How It Works

When you sign in, the extension calls GitHub's Copilot account endpoint, `copilot_internal/user`, to read your actual plan, quota, and usage.

That means:

- **No local estimation** of premium requests.
- **No org-level guesswork** for plan detection.
- **No prompt or editor content access**.
- **Real usage numbers from GitHub**.

If you enable billing features, the extension also calls GitHub's premium request billing usage endpoint. That requires the additional `user` scope so the extension can show gross value, billed overage, and request counts by model.

If no matching GitHub session is available at startup, or if VS Code still needs your consent to share it with this extension, the extension stays idle and waits for you to click **Sign In**. If the network is unavailable, it keeps the last known values visible and retries automatically.

## Managed Plan Limitation

For Copilot Business and Copilot Enterprise, GitHub does not expose member-level billing reports to individual users through the endpoints this extension can access. The extension still shows your premium request quota, remaining requests, and pacing, but two billing-related limitations apply:

- Billing Details and Requests by Model stay disabled in the dashboard because GitHub reserves those usage reports for organization admins and billing managers.
- If you use `statusBarTextMode: billedOnly`, the amount is an estimate for managed plans. It uses GitHub's documented `$0.04` rate per additional premium request instead of your organization's exact billed total.

![Managed plan notification](assets/managed-plan-notification.png)

![Estimate notification](assets/estimate-notification.png)

For exact billed totals on managed plans, use your organization's GitHub billing or usage reports.

## Status Bar Display

The status bar item appears immediately to the left of the GitHub Copilot icon. Two settings control the display: one for text and one for the graphic.

### Text (`statusBarTextMode`)

| Value | Example |
|---|---|
| `percent` *(default)* | `50%` |
| `count` | `150/300` |
| `countPercent` | `150/300 (50%)` |
| `remaining` | `150 left` |
| `billedOnly` | `+$0.00` |
| `none` | *(graphic only)* |

### Graphic (`statusBarGraphicMode`)

| Value | Example |
|---|---|
| `none` *(default)* | *(text only)* |
| `segmented` | `[■■■■□□□□]` |
| `blocks` | `████░░░░` |
| `thinBlocks` | `▰▰▰▰▱▱▱▱` |
| `dots` | `••••····` |
| `circles` | `●●●●○○○○` |
| `braille` | `⣿⣿⣿⣿⣀⣀⣀⣀` |
| `rectangles` | `▮▮▮▮▯▯▯▯` |

You can combine any text mode with any graphic mode. `statusBarTextPosition` controls whether the text appears on the left or right.

| Text | Graphic | Position | Result |
|---|---|---|---|
| `percent` | `blocks` | `left` | `50% ████░░░░` |
| `percent` | `blocks` | `right` | `████░░░░ 50%` |
| `countPercent` | `segmented` | `left` | `150/300 (50%) [■■■■□□□□]` |
| `countPercent` | `circles` | `right` | `●●●●○○ 206/300 (68.5%)` |
| `remaining` | `none` | - | `94 left` |
| `none` | `circles` | - | `●●●●○○○○` |
| `billedOnly` | `none` | - | `+$0.00` |

> `statusBarTextMode` and `statusBarGraphicMode` cannot both be `none`. If that happens, the extension falls back to `percent`.

When billing details are enabled and available, `showCostInStatusBar` appends the billed amount to non-`billedOnly` text modes, for example `●●●●○○ 206/300 (68.5%) · $0.00`.

## Commands

| Command | Description |
|---|---|
| `Copilot Usage Insights: Sign In` | Sign in with GitHub or authorize the existing VS Code GitHub session |
| `Copilot Usage Insights: Refresh` | Refresh usage data now |
| `Copilot Usage Insights: Open Details` | Open the dashboard |
| `Copilot Usage Insights: Disconnect Account` | Disconnect and clear the session |
| `Copilot Usage Insights: Open Settings` | Open extension settings |

## Settings

| Setting | Default | Description |
|---|---|---|
| `refreshIntervalMinutes` | `5` | How often to refresh usage data (1-60 min) |
| `threshold.enabled` | `true` | Enable color-coded threshold warnings |
| `threshold.warning` | `80` | Warning color threshold (%) |
| `threshold.critical` | `90` | Critical/error color threshold (%) |
| `statusBarTextMode` | `percent` | Text portion of the status bar: `none`, `count`, `percent`, `countPercent`, `remaining`, `billedOnly` |
| `statusBarGraphicMode` | `none` | Graphic portion of the status bar: `none`, `segmented`, `blocks`, `thinBlocks`, `dots`, `circles`, `braille`, `rectangles` |
| `statusBarTextPosition` | `left` | Whether text appears `left` or `right` of the graphic |
| `segmentedBarWidth` | `8` | Number of segments in bar-style graphic modes (4-16) |
| `showBillingDetails` | `false` | Enable billing summary and overage details; requests the additional GitHub `user` scope when needed |
| `showBillingRequestBreakdown` | `true` | Show the Requests by Model table when billing-powered request data exists, even if billed overage is still `$0.00` |
| `showCostInStatusBar` | `false` | Append the billed/net amount, for example `· $1.20`, when billing data is available |

Most settings can also be changed directly from the dashboard.

## Releases

Releases are published as versioned `.vsix` files on GitHub.

- Every tag matching `v*` triggers the release workflow.
- The workflow installs dependencies, runs type-checks, runs tests, packages the extension, and uploads the `.vsix` to the GitHub Release.
- GitHub also generates release notes automatically.

For end users, the simplest path is: open the [latest release](https://github.com/sin2akshay/copilot-usage-insights/releases/latest), download the `.vsix`, and install it in VS Code.

To see what changed, check [CHANGELOG.md](CHANGELOG.md).

## Privacy

The extension stores only your GitHub login name and two small preference flags in VS Code global state:

- whether you explicitly disconnected the extension
- whether the optional billing scope has already been granted or declined

GitHub access tokens are managed by VS Code's built-in authentication provider and are not stored by this extension.

The extension does not read or store your prompts, responses, files, or editor contents. Usage data comes from GitHub APIs.

## Development

```bash
npm install
npm run build
npm test
npm run check
```

Launch the extension in an Extension Development Host from VS Code after building.

## Build a VSIX

```bash
npm run package:vsix
```

This creates a `.vsix` package in the repository root that you can install through **Extensions: Install from VSIX...**.
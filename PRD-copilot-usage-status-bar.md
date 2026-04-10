# PRD: Copilot Usage Insights Status Bar Extension

## Problem Statement

VS Code users who rely on GitHub Copilot do not have a trustworthy, compact way to understand how much of their usage is known exactly, how much is only estimated locally, and how much is backed by official organization reporting. Users want a lightweight status bar indicator that helps them monitor personal and organization-level usage without pretending to access private telemetry that is not available through public APIs. They also want a richer drill-down view, clear privacy boundaries, enough display flexibility to choose a status bar presentation that fits their preferences and available space, and a way to understand whether they are on pace to stay within budget.

Today, the available data is fragmented. Extension-mediated Copilot requests can be tracked exactly if the extension owns the request path, some other Copilot-related activity can only be inferred from local editor behavior, and official GitHub organization usage reports are optional, delayed, and access-controlled. Without a product that combines these sources honestly, users cannot reliably answer questions such as how many premium requests they have used this session, how much of the current month is likely consumed, whether they are burning through their allowance too quickly, whether recent usage is trending up or down, how fresh the organization data is, or whether the displayed number is exact versus estimated.

## Solution

Build a VS Code extension that combines three clearly labeled usage sources into one compact status bar item and one richer detail view.

The extension will:

- Track exact request counts for extension-mediated Copilot interactions that pass through extension-owned VS Code Language Model and Chat API entry points.
- Track best-effort local heuristic activity outside that exact path using public VS Code signals only, and clearly label that data as inferred with confidence levels.
- Optionally connect to GitHub via VS Code authentication to fetch official organization usage reports when the signed-in user has access and the organization has usage reporting enabled.
- Aggregate those sources into a single derived view that shows daily usage, current session usage, estimated monthly usage, estimated remaining allowance, model-driven burn rate, confidence labels, and official-report freshness.
- Derive budget-pacing insights such as projected month-end usage, pace status versus allowance, and remaining daily budget from the same normalized summary model.
- Derive recent-usage trend insights such as short-window daily history, sparkline-ready output, and rising-flat-falling interpretation from the same normalized summary model.
- Store metadata only, never prompt text or response text.
- Keep the status bar to exactly one item, with a compact label and a richer drill-down panel opened by click.
- Offer multiple user-selectable status bar visual modes so users can choose the most useful compact representation for their workflow.

The best integration for pacing and trend is to treat them as derived insights rather than separate tracking pipelines. The status bar should continue to show one compact global item, with the default mode remaining a simple numeric view. Pacing and trend should be available as optional advanced modes in the status bar and as fully explained metrics in the detail view.

The status bar item will support multiple visual options, all rendered through the same single global item. Initial options should include:

- Count only, such as `42/300`
- Percent only, such as `14%`
- Count plus percent, such as `42/300 (14%)`
- Segmented progress bar, such as `[■■■□□□□□]`
- Hybrid compact mode, such as `42/300 [■■■□□□□□]`
- Remaining budget mode, such as `258 left`
- Forecast mode, such as `Proj 278`
- Pace mode, such as `On pace`
- Trend sparkline mode, such as `▂▃▅▅▇`
- Usage plus trend hybrid mode, such as `42/300 ▂▃▅▅▇`

Each mode must preserve the distinction between exact tracked usage and estimated usage in the hover text and detail view, rather than trying to encode that distinction only in the label. Pacing and trend should prefer live local personal data in the status bar because it is the freshest source, while delayed official organization pacing and trend should appear as separate context in the detail view when reports are available. The product should remain useful even when official GitHub data is unavailable, and should degrade cleanly to local-only insights.

## User Stories

1. As a Copilot user, I want to see a single status bar indicator for usage, so that I can monitor my request consumption without opening another tool.
2. As a Copilot user, I want the status bar to stay compact, so that it does not crowd out other workspace indicators.
3. As a Copilot user, I want to click the status bar and open a richer breakdown, so that I can inspect details only when needed.
4. As a privacy-conscious user, I want the extension to store metadata only, so that my prompts and responses are never persisted locally by this product.
5. As a user who values accuracy, I want exact tracked requests to be labeled separately from estimated activity, so that I know which numbers are authoritative and which are inferred.
6. As a user who sometimes works outside the extension-owned Copilot path, I want heuristic estimates to be shown separately, so that the tool remains useful even when exact tracking cannot cover everything.
7. As a user, I want heuristic activity to include confidence labels, so that I can judge how much trust to place in the estimate.
8. As a user, I want the current session usage to be visible, so that I can understand short-term consumption while working.
9. As a user, I want current-day usage to be visible, so that I can spot unusually heavy usage days.
10. As a user on a monthly request allowance, I want an estimated month total and remaining allowance, so that I can pace my usage before reset.
11. As a user, I want month calculations to respect the first day of the month at 00:00 UTC, so that the extension matches Copilot billing boundaries.
12. As a user, I want request multipliers to vary by model family, so that premium burn estimates reflect actual model cost classes.
13. As a user, I want zero-cost or included model families to be represented correctly, so that the extension does not overstate my premium usage.
14. As a user, I want to know whether I am under pace, on pace, or over pace for the current cycle, so that I can adjust my usage before I run out.
15. As a user, I want a projected month-end usage estimate, so that I can understand where my current burn rate is heading.
16. As a user, I want a remaining daily budget estimate, so that I know how aggressively I can keep using Copilot for the rest of the cycle.
17. As a user, I want a recent-usage trend visualization, so that I can see whether my usage is rising, flat, or falling without opening a chart.
18. As a user, I want the trend to be based on a short recent window, so that it reflects current behavior instead of long-past activity.
19. As a user, I want pacing and trend values to communicate freshness and confidence, so that I know whether they are based on live local signals or delayed official data.
20. As a user, I want the status bar hover to explain the exact, heuristic, and official contributions, so that I do not have to open the detail view for basic interpretation.
21. As a user, I want to choose the status bar display mode, so that I can optimize for space, readability, or visual scanning.
22. As a user, I want a count-only mode, so that I can read exact numbers at a glance.
23. As a user, I want a percent-only mode, so that I can track overall allowance burn with minimal visual noise.
24. As a user, I want a combined count-plus-percent mode, so that I can see both the raw count and overall progress together.
25. As a user, I want a compact segmented-bar mode, so that I can visually estimate progress even when I do not want more text.
26. As a user, I want a hybrid text-plus-bar mode, so that I can combine quick visual progress with a precise count.
27. As a user, I want a remaining-budget mode, so that I can focus on what I have left instead of what I have spent.
28. As a user, I want a forecast mode, so that I can track projected month-end usage directly from the status bar.
29. As a user, I want a pace mode, so that I can quickly tell whether I am under, on, or over my budget trajectory.
30. As a user, I want a trend-sparkline mode, so that I can monitor recent usage momentum in a very small footprint.
31. As a user, I want a usage-plus-trend hybrid mode, so that I can see absolute usage and recent movement together.
32. As a user with limited status bar space, I want the extension to keep using exactly one item regardless of display mode, so that customization does not multiply UI clutter.
33. As a user, I want the default first-run mode to stay simple and numeric, so that pacing and trend remain opt-in rather than confusing the initial experience.
34. As a user, I want warning or error styling to appear only for exceptional cases, so that normal usage does not look alarming.
35. As a user, I want authentication failures to be visible in the hover and detail view, so that I understand why official data is missing.
36. As a user, I want graceful fallback when organization usage reports are unavailable, so that the extension still works in local-only mode.
37. As a user whose organization does not enable usage metrics, I want a clear explanation of that limitation, so that missing data is not mistaken for zero usage.
38. As a user without permission to view organization metrics, I want a clear access-state message, so that I know the feature is unavailable rather than broken.
39. As a user, I want the extension to use GitHub OAuth instead of manual token entry in v1, so that authentication flows through supported VS Code mechanisms.
40. As a user with access to multiple organizations, I want to select which organization report to view, so that the official metrics align with the context I care about.
41. As a user, I want official report freshness to be visible, so that I understand the difference between delayed reporting and live local estimates.
42. As a user, I want the detail view to distinguish Personal and Official Organization sections, so that I can understand the source and meaning of each value.
43. As a user, I want the detail view to include an Insights section for pacing and trend, so that compact status bar modes have a place for full explanation.
44. As a user, I want the detail view to include Settings shortcuts, so that I can quickly change display mode, allowance, organization selection, and refresh behavior.
45. As a user, I want a clear indication when the extension is waiting on Copilot consent, so that I know why exact tracking has not started yet.
46. As a user, I want extension-owned tracked interactions to log model ID, model family, duration, and success state, so that derived usage estimates can be audited and explained.
47. As a user, I want the extension to avoid relying on private Copilot telemetry scraping, so that the product remains honest and maintainable.
48. As a user, I want local storage to retain event history and caches needed for insights, so that usage summaries survive restarts.
49. As a user, I want the extension to avoid storing prompt text in that history, so that local persistence stays privacy-preserving.
50. As a user, I want refresh controls for official data, so that I can manually retry after auth or network issues.
51. As a user working offline, I want the extension to continue showing local insights, so that network failures do not break the core experience.
52. As a user, I want the detail view to show the last successful organization report window, so that I know what period the official data covers.
53. As a user, I want model-based usage breakdowns, so that I can see which model families are driving premium consumption.
54. As a user, I want monthly allowance to be configurable, so that the indicator matches my plan or team policy.
55. As a user, I want privacy toggles for local heuristics and official data integration, so that I can choose the level of tracking I am comfortable with.
56. As a maintainer, I want exact tracking, heuristic tracking, official report ingestion, aggregation, and UI rendering to remain separate modules, so that each subsystem can evolve without destabilizing the others.
57. As a maintainer, I want pacing and trend calculations to live in the aggregation layer rather than UI code, so that the same insight logic is reused consistently across the status bar and detail view.
58. As a maintainer, I want multiplier rules isolated behind one service or table, so that policy changes do not require rewriting aggregation logic.
59. As a maintainer, I want the detailed breakdown surface to remain lightweight, so that the status bar feature does not grow into an overbuilt dashboard in v1.

## Implementation Decisions
- The extension will expose exactly one global status bar item positioned on the left because the data is workspace-wide and session-wide rather than tied to a single file.
- The product will merge three sources of truth into one derived model: exact tracked extension-owned requests, heuristic local estimates, and optional official GitHub organization reports.
- Exact tracked data will only come from extension-mediated Copilot entry points built on top of the public VS Code Chat and Language Model APIs.
- Heuristic tracking will use only public VS Code signals, such as edit bursts, save timing, selection changes, and correlation with tracked interactions, and will never be presented as exact telemetry.
- Official GitHub data will be optional and organization-scoped in v1. Enterprise-scoped reporting is out of scope.
- GitHub authentication will use the VS Code authentication API with GitHub OAuth rather than a manually pasted personal access token.
- The extension will fetch both organization summary and organization users usage reports when available, download signed report files, parse them, and cache the latest daily and 28-day snapshots.
- All persisted local data will be metadata only. Stored fields may include timestamps, model identifiers, model families, durations, success or failure states, confidence levels, counters, and snapshot freshness, but not prompt content or response text.
- The core architecture will separate tracking, storage, GitHub integration, aggregation, and UI composition into deep modules with simple interfaces so those modules can be tested in isolation.
- The aggregation layer will be the only place where request multipliers, month-boundary reset handling, freshness rules, derived allowance calculations, pacing projections, trend summaries, and confidence rollups are combined into UI-facing summaries.
- Monthly usage and remaining-allowance math will respect reset on the first day of each month at 00:00 UTC.
- Budget pacing will be derived from month-to-date blended personal usage against the configured monthly allowance, using UTC cycle boundaries and producing projected month-end usage, expected usage-to-date, pace status, and remaining daily budget.
- Pacing should prefer a smoothed recent burn rate when enough recent daily data exists and fall back to month-to-date average burn early in the cycle, with the confidence of that estimate surfaced to the user.
- Trend visualization will be derived from recent daily usage buckets rather than cumulative totals so it reflects momentum instead of merely restating overall consumption.
- The initial trend window should default to a short recent period such as 7 days so the status bar remains compact and responsive to current behavior.
- Trend output should be normalized into a compact sparkline-ready series plus a simple directional classification such as rising, flat, or falling.
- Model multiplier rules will be isolated behind a dedicated mapping or service so billing-policy updates remain localized.
- The detail surface will use a lightweight webview because the product needs richer drill-down content while keeping the status bar compact.
- The detail surface will be organized around Personal, Official Organization, Insights, and Settings entry points rather than attempting to mirror every internal subsystem.
- The live status bar should prefer local personal pacing and trend because official organization reports are delayed. Official pacing or trend should appear in the detail view as separate delayed context rather than replacing the live local summary.
- The status bar item will stay compact and informative, while hover text will carry richer context such as exact versus estimated breakdown, pace basis, trend window, report freshness, and degraded-mode explanations.
- Warning or error color treatment will be reserved for exceptional cases such as expired authentication, unavailable official metrics, or failed refresh states.
- The extension will include a focused settings surface for tracking mode, monthly allowance, selected organization, refresh cadence, privacy toggles, and status bar display mode.
- Status bar display mode will be a first-class configurable setting with multiple supported renderers driven by the same underlying summary model.
- The default status bar mode should remain count-plus-percent because it is the clearest first-run presentation. Forecast, pace, trend, and usage-plus-trend should be opt-in advanced views.
- Initial display-mode options will include count-only, percent-only, count-plus-percent, segmented bar, hybrid compact, remaining-budget, forecast, pace, trend-sparkline, and usage-plus-trend views.
- Status bar display modes must continue to fit within a single item and avoid expanding to multiple adjacent items.
- Because the segmented-bar and hybrid modes use estimated progress visuals, the hover and detail panel must explicitly communicate whether the underlying progress value is exact, estimated, or blended.
- Because pacing and trend can be based on smoothed local estimates or delayed official reports, the hover and detail panel must explicitly communicate the basis, window, and freshness of those insights.
- If the trend window has too little data or too little confidence, trend-focused modes should degrade to a simpler textual fallback rather than render misleading visual noise.
- If official organization data is unavailable due to permission issues, disabled policy, 204 no-content responses, failed downloads, offline mode, or auth expiration, the extension will degrade cleanly to local-only insights instead of failing activation or breaking the status bar.
- On first use of tracked Copilot models, the extension will rely on VS Code's built-in consent behavior and surface consent-related limitations clearly to the user.
- If the detail surface becomes too heavy in later iterations, simplification should prefer reducing visualization complexity inside the detail view before adding more status bar surface area.

## Testing Decisions

- Good tests will validate externally observable behavior and stable contracts, not internal implementation details or incidental private state.
- Unit tests will cover multiplier math, UTC month-boundary reset behavior, official report parsing, official report freshness handling, aggregation rules, remaining-allowance calculations, and heuristic confidence scoring.
- Unit tests will cover pacing math, including expected usage-to-date, projected month-end usage, remaining daily budget, early-month fallback behavior, and threshold-based pace classification.
- Unit tests will cover trend-series generation, normalization, and rising-flat-falling classification across representative short-window daily histories.
- Unit tests will cover status bar display-mode rendering so each configured mode produces the correct compact label from the same derived summary model.
- Unit tests will cover forecast, pace, trend, and usage-plus-trend renderers so they degrade correctly when recent history is sparse or confidence is low.
- Unit tests will cover degraded-state rendering so auth failures, missing organization access, disabled policy, and no-content official responses produce clear fallback summaries rather than misleading zero values.
- Unit tests will cover privacy guarantees at the storage boundary by asserting that prompt text and response text are not accepted or persisted by the storage interfaces.
- Extension-host smoke tests will cover activation, command registration, status bar creation, detail-panel opening from both command and status bar click, and refresh behavior.
- Extension-host smoke tests will cover authentication error handling and fallback to local-only operation.
- Extension-host smoke tests will cover that exactly one status bar item is created for this feature, regardless of selected display mode.
- Integration-style tests around aggregation and UI state hydration should use realistic combinations of exact tracked events, heuristic events, and official snapshots so the user-visible model, pacing insights, and trend summaries are validated end to end.
- Prior art in the eventual repository should favor tests around service boundaries, parser behavior, aggregation outputs, and command activation rather than brittle tests tied to DOM structure inside the webview.

## Out of Scope

- Scraping private or undocumented Copilot telemetry.
- Storing prompt excerpts, response text, or editor content as part of usage tracking.
- Real-time official GitHub organization usage updates beyond the cadence supported by report availability.
- Enterprise-scoped reporting in v1.
- Multiple status bar items or per-editor status bar variants.
- Heavy analytics dashboards, rich multi-series charts, or complex interactive visualizations beyond a focused drill-down surface with compact trend summaries.
- Manual personal access token entry as the primary authentication path in v1.
- Perfect attribution for all Copilot activity outside extension-owned tracked request paths.
- Any claim that heuristic local estimates are exact or billing-authoritative.

## Further Notes

- The core honesty principle for v1 is that extension-mediated requests are exact, non-owned local activity is heuristic, and official GitHub organization data is delayed but authoritative for the scopes it covers.
- The product should be useful even when only one or two of the three data sources are available.
- The cleanest integration for pacing and trend is to derive them from the existing normalized event and snapshot model rather than introduce new collectors.
- Pacing should answer whether the user is likely to finish the month within budget, while trend should answer whether recent usage is rising or falling. They are related but distinct signals and should remain visually distinct.
- The segmented progress-style status bar option should remain visually compact and theme-safe, using text characters that render reliably in the VS Code status bar without requiring custom colors in normal operation.
- The trend sparkline option should use compact glyphs when available and fall back to an ASCII-safe representation if the environment renders those glyphs poorly.
- Documentation and in-product copy must explain the distinction between exact tracked usage, estimated local usage, delayed official organization reports, and derived pacing or trend insights in plain language.
- Marketplace and README messaging should explicitly state that the extension does not access private Copilot telemetry and does not store prompt contents.
- If the user later provides a repository with issue automation or a GitHub remote, this PRD can be posted directly as an issue with only minor reformatting.
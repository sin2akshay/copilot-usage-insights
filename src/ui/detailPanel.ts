import { randomUUID } from 'node:crypto';

import * as vscode from 'vscode';

import type { DetailViewModel } from '../core/models';

export interface DetailPanelHandlers {
  refresh: () => void | Promise<void>;
  disconnect: () => void | Promise<void>;
  signIn: () => void | Promise<void>;
  openSettings: () => void | Promise<void>;
  grantBillingAccess: () => void | Promise<void>;
  setBillingView: (view: string) => void | Promise<void>;
  enableAgentDebugLog: () => void | Promise<void>;
  openSessionSource: (sessionId: string) => void | Promise<void>;
  rebuildSessionCache: () => void | Promise<void>;
  dismissCreditsNotice: () => void | Promise<void>;
  updateSetting: (key: string, value: unknown) => void | Promise<void>;
}

export class DetailPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly handlers: DetailPanelHandlers,
  ) {}

  dispose(): void {
    this.panel?.dispose();
  }

  show(model: DetailViewModel): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One, false);
      void this.postState(model);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'copilotUsageInsights.detail',
      'Copilot Usage Insights',
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
        ],
      },
    );

    this.panel.webview.html = this.renderHtml(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((message: { type?: string; key?: string; value?: unknown; sessionId?: unknown }) => {
      switch (message?.type) {
        case 'refresh':
          void this.handlers.refresh();
          break;
        case 'disconnect':
          void this.handlers.disconnect();
          break;
        case 'signIn':
          void this.handlers.signIn();
          break;
        case 'openSettings':
          void this.handlers.openSettings();
          break;
        case 'grantBillingAccess':
          void this.handlers.grantBillingAccess();
          break;
        case 'setBillingView':
          if (typeof message.value === 'string') {
            void this.handlers.setBillingView(message.value);
          }
          break;
        case 'enableAgentDebugLog':
          void this.handlers.enableAgentDebugLog();
          break;
        case 'rebuildSessionCache':
          void this.handlers.rebuildSessionCache();
          break;
        case 'dismissCreditsNotice':
          void this.handlers.dismissCreditsNotice();
          break;
        case 'openSessionSource':
          if (typeof message.sessionId === 'string') {
            void this.handlers.openSessionSource(message.sessionId);
          }
          break;
        case 'updateSetting':
          if (typeof message.key === 'string') {
            void this.handlers.updateSetting(message.key, message.value);
          }
          break;
      }
    });
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    void this.postState(model);
  }

  update(model: DetailViewModel): void {
    if (!this.panel) {
      return;
    }
    void this.postState(model);
  }

  private async postState(model: DetailViewModel): Promise<void> {
    if (!this.panel) {
      return;
    }
    // Serialize dates for webview transport
    const serializable = {
      ...model,
      data: model.data
        ? {
            ...model.data,
            resetDate: model.data.resetDate.toISOString(),
            assignedDate: model.data.assignedDate?.toISOString() ?? null,
          }
        : null,
      sessions: model.sessions.map(session => ({
        id: session.id,
        title: session.title,
        workspaceName: session.workspaceName,
        editor: session.editor,
        mode: session.mode,
        startedAt: session.startedAt,
        lastTurnAt: session.lastTurnAt,
        turnCount: session.turnCount,
        models: session.models,
        tokens: session.tokens,
        modelUsage: session.modelUsage,
        estimatedCredits: session.estimatedCredits,
        estimatedDollars: session.estimatedDollars,
        toolCallSummary: session.toolCallSummary,
        subAgentCount: session.subAgentCount,
        sourceAvailable: !!session.filePath,
      })),
    };
    await this.panel.webview.postMessage({ type: 'state', value: serializable });
  }

  private renderHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'main.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'styles.css'),
    );
    const nonce = randomUUID();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Copilot Usage Insights</title>
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}
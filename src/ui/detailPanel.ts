import { randomUUID } from 'node:crypto';

import * as vscode from 'vscode';

import type { DetailViewModel } from '../core/models';

export interface DetailPanelHandlers {
  refresh: () => void | Promise<void>;
  disconnect: () => void | Promise<void>;
  signIn: () => void | Promise<void>;
  openSettings: () => void | Promise<void>;
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
    this.panel.webview.onDidReceiveMessage((message: { type?: string }) => {
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
        ? { ...model.data, resetDate: model.data.resetDate.toISOString() }
        : null,
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
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
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
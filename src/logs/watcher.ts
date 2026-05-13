import { Event, EventEmitter, RelativePattern, workspace } from 'vscode';

export class LogWatcher {
  private readonly watchers: ReturnType<typeof workspace.createFileSystemWatcher>[] = [];
  private readonly changedEmitter = new EventEmitter<string>();
  private readonly throttleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly onSessionChanged: Event<string> = this.changedEmitter.event;

  start(directories: string[]): void {
    this.disposeWatchers();
    for (const directory of directories) {
      this.watchPattern(directory, '**/agent-logs/**/*.jsonl');
      this.watchPattern(directory, '**/agent-logs/**/*.json');
      this.watchPattern(directory, '**/GitHub.copilot-chat/debug-logs/**/main.jsonl');
    }
  }

  dispose(): void {
    this.disposeWatchers();
    for (const timer of this.throttleTimers.values()) {
      clearTimeout(timer);
    }
    this.throttleTimers.clear();
    this.changedEmitter.dispose();
  }

  private watchPattern(directory: string, glob: string): void {
    const watcher = workspace.createFileSystemWatcher(new RelativePattern(directory, glob), false, false, false);
    watcher.onDidChange(uri => this.fireThrottled(uri.fsPath));
    watcher.onDidCreate(uri => this.fireThrottled(uri.fsPath));
    this.watchers.push(watcher);
  }

  private fireThrottled(filePath: string): void {
    const existing = this.throttleTimers.get(filePath);
    if (existing) { clearTimeout(existing); }
    const timer = setTimeout(() => {
      this.throttleTimers.delete(filePath);
      this.changedEmitter.fire(filePath);
    }, 500);
    this.throttleTimers.set(filePath, timer);
  }

  private disposeWatchers(): void {
    while (this.watchers.length > 0) {
      this.watchers.pop()?.dispose();
    }
  }
}
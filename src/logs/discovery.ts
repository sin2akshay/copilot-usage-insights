import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { workspace } from 'vscode';

export type EditorId = 'vscode' | 'vscode-insiders';

interface EditorVariant {
  id: EditorId;
  folderName: string;
}

export interface WorkspaceStorageRoot {
  editor: EditorId;
  root: string;
}

export interface DiscoveredLog {
  filePath: string;
  editor: EditorId;
  workspaceRoot: string;
  workspaceFolder: string;
  mtime: number;
}

const VARIANTS: EditorVariant[] = [
  { id: 'vscode', folderName: 'Code' },
  { id: 'vscode-insiders', folderName: 'Code - Insiders' },
];

export function getWorkspaceStorageRoots(includeInsiders?: boolean): WorkspaceStorageRoot[] {
  const includeInsidersSetting = includeInsiders ?? workspace
    .getConfiguration('copilotUsageInsights')
    .get<boolean>('localLogs.includeInsiders', true);

  return VARIANTS
    .filter(variant => variant.id === 'vscode' || includeInsidersSetting)
    .map(variant => ({
      editor: variant.id,
      root: path.join(userDataRoot(variant.folderName), 'User', 'workspaceStorage'),
    }));
}

export async function discoverLogs(lookbackDays: number, includeInsiders?: boolean): Promise<DiscoveredLog[]> {
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const results: DiscoveredLog[] = [];

  for (const storageRoot of getWorkspaceStorageRoots(includeInsiders)) {
    let workspaceEntries: string[];
    try {
      workspaceEntries = await fs.readdir(storageRoot.root);
    } catch {
      continue;
    }

    for (const workspaceFolder of workspaceEntries) {
      const workspaceRoot = path.join(storageRoot.root, workspaceFolder);
      await collectAgentLogs(results, storageRoot, workspaceRoot, workspaceFolder, cutoff);
      await collectCopilotDebugLogs(results, storageRoot, workspaceRoot, workspaceFolder, cutoff);
    }
  }

  return results;
}

export async function resolveWorkspaceName(workspaceRoot: string, workspaceFolder: string): Promise<string> {
  const workspaceJsonPath = path.join(workspaceRoot, 'workspace.json');
  try {
    const raw = await fs.readFile(workspaceJsonPath, 'utf8');
    const json = JSON.parse(raw) as Record<string, unknown>;
    const candidate = firstWorkspacePathCandidate(json);
    if (candidate) {
      const basename = basenameFromUriOrPath(candidate);
      if (basename) { return basename; }
    }
  } catch {
    // Fall through to the storage hash prefix.
  }

  return workspaceFolder.slice(0, 8);
}

function userDataRoot(folderName: string): string {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), folderName);
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', folderName);
  }
  return path.join(home, '.config', folderName);
}

async function collectAgentLogs(
  results: DiscoveredLog[],
  storageRoot: WorkspaceStorageRoot,
  workspaceRoot: string,
  workspaceFolder: string,
  cutoff: number,
): Promise<void> {
  const agentLogsDir = path.join(workspaceRoot, 'agent-logs');
  const files = await listJsonFiles(agentLogsDir, 2);
  await addRecentFiles(results, files, storageRoot, workspaceRoot, workspaceFolder, cutoff);
}

async function collectCopilotDebugLogs(
  results: DiscoveredLog[],
  storageRoot: WorkspaceStorageRoot,
  workspaceRoot: string,
  workspaceFolder: string,
  cutoff: number,
): Promise<void> {
  const debugLogsRoot = path.join(workspaceRoot, 'GitHub.copilot-chat', 'debug-logs');
  let sessionEntries: string[];
  try {
    sessionEntries = await fs.readdir(debugLogsRoot);
  } catch {
    return;
  }

  const files: string[] = [];
  for (const entry of sessionEntries) {
    const directFile = path.join(debugLogsRoot, entry);
    if (isJsonLogFile(entry)) {
      files.push(directFile);
      continue;
    }

    const mainFile = path.join(directFile, 'main.jsonl');
    try {
      const stat = await fs.stat(mainFile);
      if (stat.isFile()) { files.push(mainFile); }
    } catch {
      // Ignore non-session folders.
    }
  }

  await addRecentFiles(results, files, storageRoot, workspaceRoot, workspaceFolder, cutoff);
}

async function listJsonFiles(directory: string, maxDepth: number): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile() && isJsonLogFile(entry.name)) {
      files.push(fullPath);
    } else if (entry.isDirectory() && maxDepth > 0) {
      files.push(...await listJsonFiles(fullPath, maxDepth - 1));
    }
  }
  return files;
}

async function addRecentFiles(
  results: DiscoveredLog[],
  files: string[],
  storageRoot: WorkspaceStorageRoot,
  workspaceRoot: string,
  workspaceFolder: string,
  cutoff: number,
): Promise<void> {
  for (const filePath of files) {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.mtimeMs < cutoff) { continue; }
      results.push({
        filePath,
        editor: storageRoot.editor,
        workspaceRoot,
        workspaceFolder,
        mtime: stat.mtimeMs,
      });
    } catch {
      // File may have been removed while scanning.
    }
  }
}

function isJsonLogFile(fileName: string): boolean {
  return fileName.endsWith('.jsonl') || fileName.endsWith('.json');
}

function firstWorkspacePathCandidate(json: Record<string, unknown>): string | null {
  for (const key of ['folder', 'workspace', 'configuration']) {
    const value = json[key];
    if (typeof value === 'string') { return value; }
  }

  const folders = json.folders as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(folders)) {
    for (const folder of folders) {
      const uri = folder.uri ?? folder.path;
      if (typeof uri === 'string') { return uri; }
    }
  }

  return null;
}

function basenameFromUriOrPath(value: string): string | null {
  let candidate = value;
  try {
    if (value.startsWith('file:')) {
      const url = new URL(value);
      candidate = decodeURIComponent(url.pathname);
      if (process.platform === 'win32') {
        candidate = candidate.replace(/^\/(\w:)/, '$1');
      }
    }
  } catch {
    candidate = value;
  }

  const normalized = candidate.replace(/[\\/]+$/, '');
  const basename = path.basename(normalized);
  return basename || null;
}
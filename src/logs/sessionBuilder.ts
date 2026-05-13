import type { ChatSession } from '../core/models';
import { discoverLogs, resolveWorkspaceName } from './discovery';
import { parseLogFile } from './parser';
import { SessionCache } from './cache';

export async function buildSessions(
  cache: SessionCache,
  lookbackDays: number,
  includeInsiders: boolean,
): Promise<ChatSession[]> {
  const logs = await discoverLogs(lookbackDays, includeInsiders);
  const sessions: ChatSession[] = [];

  for (const log of logs) {
    let session = cache.get(log.filePath, log.mtime);
    if (!session) {
      try {
        session = await parseLogFile(log.filePath);
      } catch {
        session = null;
      }
      if (!session) { continue; }
    }

    const enriched: ChatSession = {
      ...session,
      editor: log.editor,
      workspaceName: await resolveWorkspaceName(log.workspaceRoot, log.workspaceFolder),
    };
    cache.set(log.filePath, log.mtime, enriched);
    sessions.push(enriched);
  }

  await cache.flush();
  return sessions.sort((left, right) => right.lastTurnAt - left.lastTurnAt);
}
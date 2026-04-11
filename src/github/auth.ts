import * as vscode from 'vscode';

const GITHUB_PROVIDER = 'github';
const SCOPES = ['user:email', 'read:user'];
const DISCONNECTED_KEY = 'copilotUsage.disconnected';
const LOGIN_KEY = 'copilotUsage.login';

/**
 * Get a GitHub session access token via VS Code's built-in authentication.
 * Returns undefined if no session is available.
 */
export async function getSession(
  globalState: vscode.Memento,
  interactive: boolean
): Promise<vscode.AuthenticationSession | undefined> {
  if (isDisconnected(globalState) && !interactive) {
    return undefined;
  }

  try {
    const session = await vscode.authentication.getSession(GITHUB_PROVIDER, SCOPES, {
      silent: !interactive,
      createIfNone: interactive,
    });

    if (session && interactive) {
      // User explicitly signed in — clear any previous disconnect flag
      await globalState.update(DISCONNECTED_KEY, undefined);
      await globalState.update(LOGIN_KEY, session.account.label);
    }

    return session;
  } catch {
    // User cancelled the sign-in prompt
    return undefined;
  }
}

/** Mark the user as disconnected (opt-out). */
export async function disconnect(globalState: vscode.Memento): Promise<void> {
  await globalState.update(DISCONNECTED_KEY, true);
  await globalState.update(LOGIN_KEY, undefined);
}

/** Check if the user has opted out. */
export function isDisconnected(globalState: vscode.Memento): boolean {
  return globalState.get<boolean>(DISCONNECTED_KEY, false);
}

/** Get the last known GitHub login. */
export function getLogin(globalState: vscode.Memento): string | undefined {
  return globalState.get<string>(LOGIN_KEY);
}
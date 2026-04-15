import * as vscode from 'vscode';

const GITHUB_PROVIDER = 'github';
const SCOPES = ['user:email', 'read:user'];
const BILLING_SCOPES = ['user:email', 'read:user', 'user'];
const DISCONNECTED_KEY = 'copilotUsage.disconnected';
const LOGIN_KEY = 'copilotUsage.login';
const BILLING_SCOPE_GRANTED_KEY = 'copilotUsage.billingScopeGranted';

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
  await globalState.update(BILLING_SCOPE_GRANTED_KEY, undefined);
}

/**
 * Get a GitHub session with the elevated `user` scope needed for billing endpoints.
 * Only prompts interactively on first use; caches whether scope was granted.
 */
export async function getBillingSession(
  globalState: vscode.Memento,
  interactive: boolean,
): Promise<vscode.AuthenticationSession | undefined> {
  if (isDisconnected(globalState) && !interactive) {
    return undefined;
  }

  // If we already know the scope was denied, don't keep asking
  const cached = globalState.get<boolean>(BILLING_SCOPE_GRANTED_KEY);
  if (cached === false && !interactive) {
    return undefined;
  }

  try {
    const session = await vscode.authentication.getSession(GITHUB_PROVIDER, BILLING_SCOPES, {
      silent: !interactive,
      createIfNone: interactive,
    });

    if (session) {
      await globalState.update(BILLING_SCOPE_GRANTED_KEY, true);
    }
    return session;
  } catch {
    // User cancelled or scope not available
    await globalState.update(BILLING_SCOPE_GRANTED_KEY, false);
    return undefined;
  }
}

/** Check whether the billing scope has been granted. */
export function isBillingScopeGranted(globalState: vscode.Memento): boolean {
  return globalState.get<boolean>(BILLING_SCOPE_GRANTED_KEY, false);
}

/** Check if the user has opted out. */
export function isDisconnected(globalState: vscode.Memento): boolean {
  return globalState.get<boolean>(DISCONNECTED_KEY, false);
}

/** Get the last known GitHub login. */
export function getLogin(globalState: vscode.Memento): string | undefined {
  return globalState.get<string>(LOGIN_KEY);
}
// What a change of agy's own login on this host invalidates, and the account rows that show it.

import { join } from 'node:path'
import type { OrcaRuntimeService } from '../../../orca-runtime'
import type {
  AntigravityAccountState,
  AntigravityAccountTarget
} from '../../../../../shared/agent-accounts/antigravity/antigravity-account-types'
import { antigravityAgyOrcaAccountHome } from '../../../../antigravity/antigravity-agy-orca-home'
import { ANTIGRAVITY_CHAT_HOME_FOLDER } from '../../../../antigravity/antigravity-chat-home'
import { agentModelCatalogFingerprint } from '../../../../native-chat/agent-model-catalog/agent-model-catalog-fingerprint'
import { agentModelCatalogStore } from '../../../../native-chat/agent-model-catalog/agent-model-catalog-store'
import { getProfileUserDataPath } from '../../../../orca-profiles/profile-storage-paths'
import { noteAgyLoginChanged } from '../../../../antigravity/antigravity-chat-route'
import {
  antigravityHostCatalogFingerprints,
  forgetAntigravityHostAcpChecks
} from '../../../../antigravity/antigravity-host-acp'
import { AGY_HOST_ACCOUNT_SWITCH } from '../../../../antigravity/agy-account-switch'
import { AGY_HOST_LOGIN } from '../../../../antigravity/agy-login-revision'
import { getAntigravityAccountService } from '../../../../antigravity/native-account-host'
import { sharedAgyLaunchHome, withAntigravityChatBackend } from './antigravity-chat-backend'

function antigravityOrcaHomeCatalogFingerprints(): string[] {
  const data = getProfileUserDataPath()
  return [
    antigravityAgyOrcaAccountHome(data),
    { variable: 'GEMINI_HOME', path: join(data, ANTIGRAVITY_CHAT_HOME_FOLDER) }
  ].map((accountHome) =>
    agentModelCatalogFingerprint({ agent: 'antigravity', accountHome, wslDistro: null })
  )
}

/** The saved accounts, for adding or removing one; refused while a switch here waits on them. */
export function accountsForChange(target: AntigravityAccountTarget) {
  if (target.runtime === 'host') {
    AGY_HOST_ACCOUNT_SWITCH.assertNotSwitching()
  }
  return getAntigravityAccountService(target)
}

/** The account rows' answer on this host, with the account switch under way. */
export async function accountRows(
  runtime: OrcaRuntimeService,
  target: AntigravityAccountTarget,
  state: AntigravityAccountState
): Promise<AntigravityAccountState> {
  if (target.runtime !== 'host') {
    return withAntigravityChatBackend(runtime, target, state)
  }
  // Reading the chat backend can start agy outside the launch gate, on the login being replaced.
  const rows = AGY_HOST_ACCOUNT_SWITCH.running()
    ? state
    : await withAntigravityChatBackend(runtime, target, state)
  return AGY_HOST_ACCOUNT_SWITCH.withProgress(rows)
}

/** What agy's own login served: the model lists taken with it, the chats running on it, and the
 *  checks that vouched for it. The catalog of the HOME chats launch with goes once that is known. */
export function forgetAgyLogin(runtime: OrcaRuntimeService): void {
  noteAgyLoginChanged()
  const launchHome = sharedAgyLaunchHome(runtime)
  // Orca's homes list with agy's Google login too (Enterprise, the retired server's chats).
  const own = [...antigravityHostCatalogFingerprints(), ...antigravityOrcaHomeCatalogFingerprints()]
  agentModelCatalogStore.forgetSeenRows(own)
  // A listing started after the change, such as a Refresh, is already the new login's.
  const before = agentModelCatalogStore.runningListings()
  void launchHome.then((home) => {
    const launch = home ? antigravityHostCatalogFingerprints(home) : []
    agentModelCatalogStore.forgetSeenRows(
      launch.filter((key) => !own.includes(key)),
      before
    )
  })
  // The cached answer vouched for the previous login.
  forgetAntigravityHostAcpChecks()
  // Chats on the previous login move to this one: idle ones now, busy ones at their next send.
  AGY_HOST_LOGIN.changed()
}

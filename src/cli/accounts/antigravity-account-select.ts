// `orca account select` returns once agy holds the account, so a script can run agy right after.

import type { HandlerContext } from '../dispatch/dispatch'
import { RuntimeClientError } from '../runtime/connection/types'
import { printResult } from '../output/command-result-output'
import { formatAntigravityAccounts } from './account-list-format'
import type {
  AntigravityAccountState,
  AntigravityAccountTarget
} from '../../shared/agent-accounts/antigravity/antigravity-account-types'

// The host answers these reads from memory while its switch waits.
const READ_AGAIN_MS = 2_000

/** Selects the account and prints the rows, waiting out a switch the host answered about while it
 *  waited for chats; fails when that switch didn't happen. */
export async function selectAntigravityAccount(
  { client, json }: Pick<HandlerContext, 'client' | 'json'>,
  target: AntigravityAccountTarget,
  accountId: string
): Promise<void> {
  let response = await client.call<AntigravityAccountState>('accounts.antigravitySelect', {
    target,
    accountId
  })
  let shown: number | null = null
  for (;;) {
    const { switching, switchFailed, activeAccountId } = response.result
    if (switching?.accountId !== accountId) {
      // Only agy holding the account is success; a failed, replaced or cleared switch is not.
      if (activeAccountId === accountId) {
        printResult(response, json, formatAntigravityAccounts)
        return
      }
      throw new RuntimeClientError(
        'runtime_error',
        switchFailed?.accountId === accountId
          ? switchFailed.message
          : switching
            ? 'Another Antigravity account was selected before this switch finished.'
            : "Antigravity didn't switch to this account. Run `orca account list` to see which one agy holds."
      )
    }
    if (switching.waitingForChats !== shown) {
      shown = switching.waitingForChats
      console.error(
        shown === 1
          ? 'Switching after 1 Antigravity chat finishes…'
          : `Switching after ${shown} Antigravity chats finish…`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, READ_AGAIN_MS))
    response = await client.call<AntigravityAccountState>('accounts.antigravityList', target)
  }
}

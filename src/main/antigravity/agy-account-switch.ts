// Selecting another saved account rewrites agy's one login. A running `agy acp` keeps the login it
// started with and writes it back when it refreshes its token, undoing the switch. So the switch
// waits: chat starts hold, running turns finish, every chat's agy exits, and only then is the new
// login written. A turn that never ends gives the switch up after SWITCH_WAIT_MS, changing nothing.

import type {
  AntigravityAccountState,
  AntigravityAccountSwitchProgress
} from '../../shared/agent-accounts/antigravity/antigravity-account-types'
import { releaseIdleChatsOnOtherAccount } from '../native-chat/agent-session-wire/host/structured-agent-session-account-switch'
import type { AcpLaunchGate } from '../acp/launch/acp-launch-gate'
import { withTimeout } from '../../shared/concurrency/promise-timeout-fallback'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/host/structured-agent-session-registry'
import { AGY_HOST_LOGIN, type AgyLoginRevision } from './agy-login-revision'
import {
  ANTIGRAVITY_LAUNCH_GATE,
  publishAntigravityAccountSwitch
} from './antigravity-chat-account'
import { antigravityChatSignInActive } from './antigravity-chat-sign-in'
import type { AntigravityAccountService } from './native-account-service'

const SWITCH_WAIT_MS = 5 * 60_000
const CHECK_MS = 2_000
// Under the account rows' 20 s call timeout, so older clients get most switches whole; a longer
// wait answers with the switch's progress.
const REPLY_WAIT_MS = 12_000
const SWITCHING = 'Antigravity is switching accounts. Try again after it finishes.'

type SwitchHost = Parameters<typeof releaseIdleChatsOnOtherAccount>[0]

export type AgyAccountSwitchDeps = {
  gate: Pick<AcpLaunchGate, 'runAfterChats'>
  login: Pick<AgyLoginRevision, 'beginSwitch' | 'atLaunch'>
  /** An in-app sign-in that may write agy's login itself. */
  signInActive?: () => boolean
  host: () => SwitchHost
  /** Pushes the waiting switch's progress (null once it ends) to every surface following it. */
  publish?: (progress: AntigravityAccountSwitchProgress | null) => void
  now?: () => number
  waitMs?: number
  checkMs?: number
  replyMs?: number
}

function stillRunning(count: number): string {
  return count === 1
    ? '1 Antigravity chat is still running. Stop it or let it finish'
    : `${count} Antigravity chats are still running. Stop them or let them finish`
}

export class AgyAccountSwitch {
  private switching: AntigravityAccountSwitchProgress | null = null
  private failed: { accountId: string; message: string } | null = null
  /** The rows the switch answered with, read again only once it ends. */
  private rows: AntigravityAccountState | null = null

  constructor(private readonly deps: AgyAccountSwitchDeps) {}

  /** A switch waits for chats; a sign-in, or an account added or removed, must not race it. */
  running(): boolean {
    return this.switching !== null
  }

  assertNotSwitching(): void {
    if (this.switching) {
      throw new Error(SWITCHING)
    }
  }

  /** While a switch that answered early waits, its rows with its progress: re-reading them would
   *  ask the keyring, and maybe agy, every poll. */
  waitingRows(): AntigravityAccountState | null {
    return this.switching && this.rows ? this.withProgress(this.rows) : null
  }

  /** The switch under way, or why the last one that answered early didn't happen (until agy
   *  holds that account after all). */
  withProgress(state: AntigravityAccountState): AntigravityAccountState {
    const { switching: _switching, switchFailed: _failed, ...rows } = state
    if (this.switching) {
      return { ...rows, switching: { ...this.switching } }
    }
    return this.failed && this.failed.accountId !== rows.activeAccountId
      ? { ...rows, switchFailed: { ...this.failed } }
      : rows
  }

  /** `moved` runs, before any chat starts again, once agy holds the selected login. Answers with
   *  the switch's progress when it still waits after REPLY_WAIT_MS; it goes on in the background. */
  async select(
    service: Pick<AntigravityAccountService, 'listAccounts' | 'selectAccount'>,
    accountId: string,
    moved: () => void
  ): Promise<AntigravityAccountState> {
    const signingIn = this.deps.signInActive ?? (() => false)
    const login = this.deps.login.atLaunch()
    // A sign-in under way or finished meanwhile is newer than this pick: keep its login.
    const unchanged = (): void => {
      if (signingIn() || this.deps.login.atLaunch() !== login) {
        throw new Error(
          'agy signed in to another account while Orca waited to switch. Select the account again.'
        )
      }
    }
    const apply = async () => {
      let switched = false
      try {
        return await service.selectAccount(accountId, () => (switched = true), unchanged)
      } finally {
        // Once agy holds another login, chats and caches move even if a later check failed.
        if (switched) {
          moved()
        }
      }
    }
    const active = (await service.listAccounts()).activeAccountId
    this.assertNotSwitching()
    if (signingIn()) {
      throw new Error('Antigravity is signing in. Select an account after it finishes.')
    }
    this.failed = null
    // agy already holds it: no login changes, so no chat needs to stop.
    if (active === accountId) {
      return apply()
    }
    const progress = { accountId, waitingForChats: 0 }
    this.switching = progress
    this.deps.publish?.({ ...progress })
    let answered = false
    let marker: ReturnType<AgyLoginRevision['beginSwitch']> | null = null
    const done = this.deps.gate
      .runAfterChats(async (running) => {
        marker = this.deps.login.beginSwitch()
        await this.drain(running, marker.committed, (count) => {
          progress.waitingForChats = count
          this.deps.publish?.({ ...progress })
        })
      }, apply)
      .catch((error: unknown) => {
        if (answered) {
          this.failed = {
            accountId,
            message: error instanceof Error ? error.message : String(error)
          }
        }
        throw error
      })
      .finally(() => {
        marker?.end()
        if (this.switching === progress) {
          this.switching = null
          this.rows = null
          this.deps.publish?.(null)
        }
      })
    const replyMs = this.deps.replyMs ?? REPLY_WAIT_MS
    let timer: ReturnType<typeof setTimeout> | undefined
    const early = await Promise.race([
      done,
      new Promise<null>(
        (resolve) =>
          (timer = setTimeout(() => {
            // From here a failure is reported with the rows, not to this caller.
            answered = true
            resolve(null)
          }, replyMs))
      )
    ]).finally(() => clearTimeout(timer))
    if (early) {
      return early
    }
    done.catch(() => {})
    const rows = await service.listAccounts()
    if (this.switching === progress) {
      this.rows = rows
    }
    return this.withProgress(rows)
  }

  /** Stops each chat's agy as soon as its turn and owed work allow, until none runs. */
  private async drain(
    running: () => { chats: number; others: number },
    committed: () => boolean,
    report: (count: number) => void
  ): Promise<void> {
    const now = this.deps.now ?? Date.now
    const deadline = now() + (this.deps.waitMs ?? SWITCH_WAIT_MS)
    for (;;) {
      // A chat busy past the deadline must not hold the check (and every start) beyond it.
      await withTimeout(
        releaseIdleChatsOnOtherAccount(this.deps.host(), 'antigravity', committed),
        Math.max(0, deadline - now()),
        undefined
      )
      const { chats, others } = running()
      report(chats)
      if (chats + others === 0) {
        return
      }
      if (now() >= deadline) {
        throw new Error(
          chats > 0
            ? `Antigravity didn't switch accounts: ${stillRunning(chats)}, then select the account again.`
            : "Antigravity didn't switch accounts: one of its background tasks didn't stop. Try again."
        )
      }
      await new Promise((resolve) => setTimeout(resolve, this.deps.checkMs ?? CHECK_MS))
    }
  }
}

/** This host's switch, over the chats that run agy here. */
export const AGY_HOST_ACCOUNT_SWITCH = new AgyAccountSwitch({
  gate: ANTIGRAVITY_LAUNCH_GATE,
  login: AGY_HOST_LOGIN,
  signInActive: antigravityChatSignInActive,
  host: getStructuredAgentSessionHost,
  publish: publishAntigravityAccountSwitch
})

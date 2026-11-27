import { expect, it, vi } from 'vitest'
import type { AntigravityAccountState } from '../../../../shared/agent-accounts/antigravity/antigravity-account-types'

// The host's pushed sign-in status, as the status store hands it to its readers.
const host = vi.hoisted(() => ({
  accountSwitch: null as { accountId: string; waitingForChats: number } | null,
  listeners: new Set<() => void>(),
  rows: [] as AntigravityAccountState[],
  success: vi.fn(),
  error: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { success: host.success, error: host.error } }))
vi.mock('@/runtime/provider-accounts/sign-in/antigravity-chat-sign-in-status', () => ({
  observeAntigravityChatSignIn: () => () => {},
  readAntigravityChatSignIn: () => ({ status: 'known', accountSwitch: host.accountSwitch }),
  subscribeAntigravityChatSignIns: (listener: () => void) => {
    host.listeners.add(listener)
    return () => host.listeners.delete(listener)
  }
}))
vi.mock('@/runtime/provider-accounts/sign-in/runtime-antigravity-accounts-client', () => ({
  callAntigravityAccounts: async () => host.rows.shift()
}))

const { followAntigravityAccountSwitch } = await import('./antigravity-account-switch-toasts')

const rows = (patch: Partial<AntigravityAccountState>): AntigravityAccountState => ({
  accounts: [
    {
      id: 'b',
      email: 'b@example.com',
      subject: 'b',
      authMethod: 'consumer',
      createdAt: 0,
      updatedAt: 0
    }
  ],
  activeAccountId: 'a',
  selectedAccountId: 'a',
  currentAccount: null,
  ...patch
})
const push = (next: typeof host.accountSwitch) => {
  host.accountSwitch = next
  host.listeners.forEach((listener) => listener())
}

it('tells how a waiting switch ended once, after the host says it ended', async () => {
  // The push lags the select's answer: the rows still say it waits.
  host.rows.push(rows({ switching: { accountId: 'b', waitingForChats: 1 } }))
  followAntigravityAccountSwitch({ kind: 'local' }, { runtime: 'host' }, 'b')
  // A second Settings section in this window asks too.
  followAntigravityAccountSwitch({ kind: 'local' }, { runtime: 'host' }, 'b')
  push({ accountId: 'b', waitingForChats: 1 })
  await vi.waitFor(() => expect(host.rows).toHaveLength(0))
  expect(host.success).not.toHaveBeenCalled()

  host.rows.push(rows({ activeAccountId: 'b', selectedAccountId: 'b' }))
  push(null)
  await vi.waitFor(() => expect(host.success).toHaveBeenCalledTimes(1))
  expect(host.success).toHaveBeenCalledWith('Switched to b@example.com')
  push(null)
  expect(host.success).toHaveBeenCalledTimes(1)
  expect(host.error).not.toHaveBeenCalled()
})

it('names why a waiting switch failed', async () => {
  push({ accountId: 'b', waitingForChats: 1 })
  followAntigravityAccountSwitch({ kind: 'local' }, { runtime: 'host' }, 'b')
  host.rows.push(rows({ switchFailed: { accountId: 'b', message: '1 chat is still running.' } }))
  push(null)
  await vi.waitFor(() => expect(host.error).toHaveBeenCalledTimes(1))
  expect(host.error).toHaveBeenCalledWith('Antigravity account update failed.', {
    description: '1 chat is still running.'
  })
})

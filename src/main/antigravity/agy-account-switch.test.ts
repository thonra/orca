import { expect, it, vi } from 'vitest'
import { AcpLaunchGate } from '../acp/launch/acp-launch-gate'
import { AgyAccountSwitch } from './agy-account-switch'
import { AgyLoginRevision } from './agy-login-revision'
import { credential, harness } from './native-account-test-fixtures'

const HOME = { variable: 'GEMINI_HOME', path: '/home/dev/.gemini' }

/** agy holds account a; b is saved too. One chat's agy runs a turn on a. */
async function switchRig(
  options: { waitMs?: number; signInActive?: () => boolean; stopExitWaitMs?: number } = {}
) {
  const h = harness(credential('b'))
  await h.service.addCurrentAccount()
  h.setNative(credential('a'))
  const accounts = (await h.service.addCurrentAccount()).accounts
  const b = accounts.find((account) => account.subject === 'b')!.id
  const order: string[] = []
  const write = h.backend.write
  h.backend.write = vi.fn(async (contents, expected) => {
    order.push('login written')
    return write(contents, expected)
  })
  const gate = new AcpLaunchGate('Antigravity', options.stopExitWaitMs)
  const login = new AgyLoginRevision()
  const exits: (() => void)[] = []
  const chat = { alive: true, busy: true, passes: 0 }
  const chatProcess = {
    close: async () => true,
    onExit: (listener: () => void) => exits.push(listener)
  }
  gate.retain(chatProcess, true)
  gate.settle(chatProcess, true)
  // The host's own retirement stops an agent only between turns, as an account switch asks it to.
  const host = {
    loadedSessionIds: () => {
      chat.passes += 1
      return chat.alive ? ['chat'] : []
    },
    sessionAgent: () => 'antigravity',
    childAccountHome: () => (chat.alive ? HOME : undefined),
    releaseOffAccount: async (_id: string, committed: () => boolean) => {
      if (chat.alive && !chat.busy && committed()) {
        chat.alive = false
        order.push('agy exited')
        exits.forEach((exit) => exit())
      }
    }
  }
  const accountSwitch = new AgyAccountSwitch({
    gate,
    login,
    host: () => host,
    ...(options.signInActive ? { signInActive: options.signInActive } : {}),
    checkMs: 5,
    replyMs: 20,
    waitMs: options.waitMs ?? 60_000
  })
  const select = () => accountSwitch.select(h.service, b, () => login.changed())
  return { h, b, gate, login, chat, order, accountSwitch, select }
}

it("writes the new login only after a busy chat's turn ends and its agy exits, holding new chats until then", async () => {
  const rig = await switchRig()
  const answered = await rig.select()
  expect(answered.switching).toEqual({ accountId: rig.b, waitingForChats: 1 })
  expect(answered.activeAccountId).not.toBe(rig.b)

  let launchedOn: string | null = null
  const start = rig.gate.admit(undefined).then((entered) => {
    launchedOn = rig.login.atLaunch()
    entered.leave()
  })
  // Several checks later the turn still runs: the start waits and nothing is written.
  const checked = rig.chat.passes
  await vi.waitFor(() => expect(rig.chat.passes).toBeGreaterThan(checked + 2))
  expect(launchedOn).toBeNull()
  expect(rig.order).toEqual([])
  expect(rig.h.getNative()).toBe(credential('a'))

  rig.chat.busy = false
  await start
  expect(rig.order).toEqual(['agy exited', 'login written'])
  expect(rig.h.getNative()).toBe(credential('b'))
  // The held start launched on the new login.
  expect(launchedOn).toBe('1')
  const after = rig.accountSwitch.withProgress(await rig.h.service.listAccounts())
  expect(after.activeAccountId).toBe(rig.b)
  expect(after.switching).toBeUndefined()
  expect(after.switchFailed).toBeUndefined()
})

it("gives the switch up without touching agy's login when a turn outlasts the wait", async () => {
  const rig = await switchRig({ waitMs: 40 })
  expect((await rig.select()).switching?.accountId).toBe(rig.b)

  const rows = await rig.h.service.listAccounts()
  await vi.waitFor(() =>
    expect(rig.accountSwitch.withProgress(rows).switchFailed?.message).toContain(
      '1 Antigravity chat is still running'
    )
  )
  expect(rig.order).toEqual([])
  expect(rig.h.getNative()).toBe(credential('a'))
  expect(rig.login.current()).toBe(rig.login.atLaunch())
  // Starts run again, on the login agy kept.
  const entered = await rig.gate.admit(undefined)
  entered.leave()
  expect(rig.login.atLaunch()).toBe('0')
})

it('cancels a model listing under way and writes once it has ended', async () => {
  const rig = await switchRig()
  const listing = rig.gate.enter(undefined)
  rig.chat.busy = false
  await rig.select()
  await vi.waitFor(() => expect(listing.signal.aborted).toBe(true))
  const checked = rig.chat.passes
  await vi.waitFor(() => expect(rig.chat.passes).toBeGreaterThan(checked + 2))
  expect(rig.h.getNative()).toBe(credential('a'))
  listing.leave()
  await vi.waitFor(() => expect(rig.h.getNative()).toBe(credential('b')))
})

it('keeps a login agy signed in to while the switch waited', async () => {
  const rig = await switchRig()
  expect((await rig.select()).switching?.accountId).toBe(rig.b)
  // An in-app sign-in finishes on another account before the busy turn ends.
  rig.login.changed()
  rig.chat.busy = false
  const rows = await rig.h.service.listAccounts()
  await vi.waitFor(() =>
    expect(rig.accountSwitch.withProgress(rows).switchFailed?.message).toContain(
      'agy signed in to another account'
    )
  )
  expect(rig.order).toEqual(['agy exited'])
  expect(rig.h.getNative()).toBe(credential('a'))
})

it('keeps the login of an in-app sign-in that began while the switch waited', async () => {
  let signingIn = false
  const rig = await switchRig({ signInActive: () => signingIn })
  expect((await rig.select()).switching?.accountId).toBe(rig.b)
  signingIn = true
  rig.chat.busy = false
  const rows = await rig.h.service.listAccounts()
  await vi.waitFor(() =>
    expect(rig.accountSwitch.withProgress(rows).switchFailed?.message).toContain(
      'agy signed in to another account'
    )
  )
  expect(rig.order).toEqual(['agy exited'])
  expect(rig.h.getNative()).toBe(credential('a'))
})

it('writes only after a stopped background agy is seen to exit, asking it again meanwhile', async () => {
  const rig = await switchRig()
  rig.chat.busy = false
  // A model listing whose stop reports delivered while agy is still alive.
  const exited: (() => void)[] = []
  let closes = 0
  rig.gate.retain({
    close: async () => {
      closes += 1
      return true
    },
    onExit: (listener) => exited.push(listener)
  })
  await rig.select()
  await vi.waitFor(() => expect(closes).toBeGreaterThan(1))
  expect(rig.h.getNative()).toBe(credential('a'))
  exited.forEach((exit) => exit())
  await vi.waitFor(() => expect(rig.h.getNative()).toBe(credential('b')))
})

it('stops a chat start that failed, which no chat owns, instead of waiting on it', async () => {
  const rig = await switchRig()
  rig.chat.busy = false
  const exited: (() => void)[] = []
  const failedStart = {
    close: async () => {
      exited.forEach((exit) => exit())
      return true
    },
    onExit: (listener: () => void) => exited.push(listener)
  }
  rig.gate.retain(failedStart, true)
  rig.gate.settle(failedStart, false)
  await rig.select()
  await vi.waitFor(() => expect(rig.h.getNative()).toBe(credential('b')))
})

it("keeps tracking an agy a setup change couldn't see exit, and switches only once it does", async () => {
  const rig = await switchRig({ stopExitWaitMs: 10 })
  rig.chat.busy = false
  const exited: (() => void)[] = []
  // Its stop reports delivered, but agy is still alive.
  rig.gate.retain({ close: async () => true, onExit: (listener) => exited.push(listener) })
  await expect(
    rig.gate.run(
      async () => {},
      async () => 'changed'
    )
  ).rejects.toThrow('could not be stopped')

  await rig.select()
  const passes = rig.chat.passes
  await vi.waitFor(() => expect(rig.chat.passes).toBeGreaterThan(passes + 2))
  expect(rig.h.getNative()).toBe(credential('a'))
  exited.forEach((exit) => exit())
  await vi.waitFor(() => expect(rig.h.getNative()).toBe(credential('b')))
})

it('asks again to stop a chat agy a setup change left alive, since no chat owns it any more', async () => {
  const rig = await switchRig({ stopExitWaitMs: 10 })
  rig.chat.busy = false
  const exited: (() => void)[] = []
  let stops = 0
  // A chat's agy: its stop reports delivered, but it outlives the setup change.
  const orphan = {
    close: async () => {
      stops += 1
      return true
    },
    onExit: (listener: () => void) => exited.push(listener)
  }
  rig.gate.retain(orphan, true)
  rig.gate.settle(orphan, true)
  await expect(
    rig.gate.run(
      async () => {},
      async () => 'changed'
    )
  ).rejects.toThrow('could not be stopped')

  const afterSetup = stops
  await rig.select()
  await vi.waitFor(() => expect(stops).toBeGreaterThan(afterSetup))
  expect(rig.h.getNative()).toBe(credential('a'))
  exited.forEach((exit) => exit())
  await vi.waitFor(() => expect(rig.h.getNative()).toBe(credential('b')))
})

it("moves chats to the new login even when the check after agy's write fails", async () => {
  const rig = await switchRig()
  rig.chat.busy = false
  const write = rig.h.backend.write
  // agy's login is written, then reading it back fails.
  rig.h.backend.write = vi.fn(async (contents, expected) => {
    const written = await write(contents, expected)
    rig.h.backend.read = vi.fn(async () => {
      throw new Error('keyring unavailable')
    })
    return written
  })
  const moved = vi.fn()
  await expect(rig.accountSwitch.select(rig.h.service, rig.b, moved)).rejects.toThrow()
  expect(moved).toHaveBeenCalledTimes(1)
})

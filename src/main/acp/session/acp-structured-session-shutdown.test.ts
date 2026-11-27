import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { CURSOR_LAUNCH_SPEC } from '../../cursor/cursor-acp-launch-spec'
import { AgentSessionPreSpawnError } from '../../native-chat/agent-session-wire/providers/structured-agent-session-adapter-errors'
import type { StructuredAgentSessionAcquireInput } from '../../native-chat/agent-session-wire/providers/structured-agent-session-adapter'
import { AcpLaunchGate } from '../launch/acp-launch-gate'
import { AcpStructuredSessionAdapter } from './acp-structured-session-adapter'

it('refuses a chat start waiting at the launch gate once the adapter shuts down', async () => {
  const gate = new AcpLaunchGate('Agent')
  const resolveLaunch = vi.fn()
  const connect = vi.fn()
  const adapter = new AcpStructuredSessionAdapter({
    spec: { ...CURSOR_LAUNCH_SPEC, launchGate: gate },
    resolveLaunch,
    readLaunch: resolveLaunch,
    dataDirectory: tmpdir(),
    readProcessStartTime: async () => 1,
    stopGraceMs: 1,
    connect
  })
  // An account switch holds chat starts until its drain ends.
  const drained = Promise.withResolvers<void>()
  const switching = gate.runAfterChats(
    () => drained.promise,
    async () => {}
  )
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a start refused at the gate reads only its session id and signal.
  const start = adapter.acquire({
    identity: { sessionId: 'chat' }
  } as StructuredAgentSessionAcquireInput)
  await adapter.closeAll()
  await expect(start).rejects.toBeInstanceOf(AgentSessionPreSpawnError)
  drained.resolve()
  await switching
  expect(resolveLaunch).not.toHaveBeenCalled()
  expect(connect).not.toHaveBeenCalled()
})

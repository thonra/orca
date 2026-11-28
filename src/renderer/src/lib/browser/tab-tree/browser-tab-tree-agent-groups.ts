import { useAppStore } from '@/store/index'
import { getResourceExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import type { BrowserTabCreateRequest } from '../../../../../shared/browser/workspaces/browser-tab-create-request'
import { placeAgentBrowserTab } from './browser-tab-tree-model'
import { useBrowserTabTreeStore } from './browser-tab-tree-preferences'
import { readBrowserTabTreeWorkspaceRoot } from './browser-tab-tree-projection'

export function rememberAgentBrowserTab(
  worktreeId: string,
  pageId: string,
  session: NonNullable<BrowserTabCreateRequest['agentSession']>
): void {
  const app = useAppStore.getState()
  const hostId = getResourceExecutionHostIdForWorktree(app, worktreeId)
  const workspace = app.getKnownWorktreeById(worktreeId, hostId)
  if (!workspace || workspace.isArchived) {
    return
  }
  const root = readBrowserTabTreeWorkspaceRoot(workspace)
  const owner = {
    worktreeId: root.id,
    executionHostId: root.hostId,
    worktreeInstanceId: root.instanceId,
    workspaceName: root.displayName
  }
  useBrowserTabTreeStore.setState(
    (state) => placeAgentBrowserTab(state, pageId, owner, session.id, session.title) ?? state
  )
}

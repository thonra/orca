import { useAppStore } from '@/store/index'
import { openWorkspaceBrowserTab } from '@/lib/browser/workspace/workspace-browser-tab-open'
import { resolveBrowserSourceUnifiedTab } from '@/lib/browser/workspace/browser-workspace-source-resolution'
import { rememberBrowserTabOpener } from '@/lib/browser/tab-tree/browser-tab-tree-preferences'
import { findBrowserWorkspaceForRemotePage } from '@/runtime/web-session-tabs-sync/tab-projection/mirrored-browser-tabs'
import type { RemoteBrowserPaneNotice } from './remote-browser-page-input-model'

export function openRemoteBrowserLinkInNewTab({
  url,
  activate,
  browserPageId,
  worktreeId,
  runtimeEnvironmentId,
  setPaneNotice
}: {
  url: string
  activate: boolean
  browserPageId: string
  worktreeId: string
  runtimeEnvironmentId: string
  setPaneNotice: (notice: RemoteBrowserPaneNotice | null) => void
}): void {
  const sourceUnifiedTab = resolveBrowserSourceUnifiedTab(
    useAppStore.getState(),
    browserPageId,
    worktreeId
  )
  void openWorkspaceBrowserTab({
    workspaceId: worktreeId,
    url,
    ...(sourceUnifiedTab ? { afterTabId: sourceUnifiedTab.id } : {}),
    onMaterialized: (pageId) => {
      const localPage = findBrowserWorkspaceForRemotePage(
        useAppStore.getState(),
        worktreeId,
        runtimeEnvironmentId,
        pageId
      )?.page
      rememberBrowserTabOpener(localPage?.id ?? pageId, browserPageId)
    },
    focusOnCreate: activate,
    selectWorktree: false,
    intent: { kind: 'url' },
    expectedRuntimeEnvironmentId: runtimeEnvironmentId,
    placementPreference: 'server'
  }).catch((error) => {
    setPaneNotice({
      kind: 'direct',
      text: error instanceof Error ? error.message : String(error)
    })
  })
}

import { useAppStore } from '@/store/index'
import { create } from 'zustand'
import { createNonSecureContextUuid as createBrowserUuid } from '../../../../../shared/identifiers/non-secure-context-uuid'
import { requestBrowserFocus } from '@/components/browser-pane/host-guest/input/browser-focus'
import { activateAndRevealWorkspace } from '@/lib/workspace/activation/worktree-activation'
import { findPage } from '@/store/slices/browser/pages/browser-page-records'
import { redactBrowserMetadata } from '../../../../../shared/browser/browser-metadata-redaction'
import { normalizeBrowserNavigationUrl } from '../../../../../shared/browser/navigation/browser-url'
import { composeWorktreeHostIdentity } from '../../../../../shared/worktree/host-qualified-identity'
import { activateBrowserPagePaletteResult } from '../palette/browser-page-palette-activation'
import {
  browserTabTreeNodeId,
  findBrowserTabTreeNode,
  moveBrowserTabTreeNode,
  removeBrowserTabTreeGroupNode,
  sameBrowserTabTreeOwner,
  type BrowserTabTreeGroup,
  type BrowserTabTreeNode,
  type BrowserTabTreePinTarget,
  type PinnedBrowserTabPage,
  type PinnedBrowserTabBranch
} from './browser-tab-tree-model'
import { useBrowserTabTreeStore } from './browser-tab-tree-preferences'
import {
  readActiveBrowserTabTree,
  readActiveBrowserTabTreeContext,
  readPinnedBrowserTabOwner,
  workspacePinTarget
} from './browser-tab-tree-projection'
import type { PendingSidebarWorktreeReveal } from '@/store/slices/ui/ui-slice-contract-core'

export { BROWSER_TAB_TREE_DRAG_TYPE, useBrowserTabTreeStore } from './browser-tab-tree-preferences'
export { browserTabTreeNodeId } from './browser-tab-tree-model'
export type { BrowserTabTreePinTarget, PinnedBrowserTabBranch } from './browser-tab-tree-model'

const EMPTY_BRANCHES: readonly PinnedBrowserTabBranch[] = []
const useBrowserTabTreeDragStore = create<{ workspaceKeys: ReadonlySet<string> | null }>(() => ({
  workspaceKeys: null
}))
let pendingDragReveal: PendingSidebarWorktreeReveal | null = null

function pinKey(target: BrowserTabTreePinTarget): string {
  return JSON.stringify([
    composeWorktreeHostIdentity(target.executionHostId, target.worktreeId),
    target.worktreeInstanceId ?? null
  ])
}

export function usePinnedBrowserTabBranches(
  target: BrowserTabTreePinTarget
): readonly PinnedBrowserTabBranch[] {
  const key = pinKey(target)
  return useBrowserTabTreeStore((state) => state.pinnedByWorkspace[key] ?? EMPTY_BRANCHES)
}

function savePin(node: BrowserTabTreeNode): PinnedBrowserTabBranch {
  if (node.kind === 'group') {
    return { ...node, children: [] }
  }
  const { active: _active, children: _children, faviconUrl, ...metadata } = node
  return {
    ...redactBrowserMetadata({
      ...metadata,
      faviconUrl: faviconUrl?.startsWith('data:') ? null : faviconUrl
    }),
    children: []
  }
}

export function beginBrowserTabTreeDrag(nodeId: string): void {
  endBrowserTabTreeDrag()
  const { nodes, family } = readActiveBrowserTabTreeContext()
  const node = findBrowserTabTreeNode(nodes, nodeId)
  const targets = family.filter((workspace) => !workspace.isArchived).map(workspacePinTarget)
  if (!node || targets.length === 0) {
    return
  }
  useBrowserTabTreeDragStore.setState({ workspaceKeys: new Set(targets.map(pinKey)) })
  const source = targets.find((target) => sameBrowserTabTreeOwner(target, node)) ?? targets[0]
  const app = useAppStore.getState()
  if (!app.sidebarOpen) {
    app.setSidebarOpen(true)
  }
  if (app.sidebarBody !== 'workspaces') {
    app.setSidebarBody('workspaces')
  }
  app.revealWorktreeInSidebar(source.worktreeId, {
    executionHostId: source.executionHostId,
    behavior: 'auto'
  })
  pendingDragReveal = useAppStore.getState().pendingRevealWorktree
}

export function endBrowserTabTreeDrag(): void {
  if (pendingDragReveal) {
    useAppStore.getState().clearPendingRevealWorktreeId(pendingDragReveal)
    pendingDragReveal = null
  }
  useBrowserTabTreeDragStore.setState({ workspaceKeys: null })
}

export function canDropBrowserTabTreeBranch(target: BrowserTabTreePinTarget): boolean {
  return useBrowserTabTreeDragStore.getState().workspaceKeys?.has(pinKey(target)) ?? false
}

export function useBrowserTabTreeDropState(
  target: BrowserTabTreePinTarget
): 'eligible' | 'ineligible' | null {
  const key = pinKey(target)
  return useBrowserTabTreeDragStore(({ workspaceKeys }) =>
    workspaceKeys === null ? null : workspaceKeys.has(key) ? 'eligible' : 'ineligible'
  )
}

export function pinBrowserTabTreeBranch(target: BrowserTabTreePinTarget, nodeId: string): boolean {
  const { family, nodes } = readActiveBrowserTabTreeContext()
  if (
    !family.some(
      (workspace) =>
        !workspace.isArchived && sameBrowserTabTreeOwner(workspacePinTarget(workspace), target)
    )
  ) {
    return false
  }
  const node = findBrowserTabTreeNode(nodes, nodeId)
  if (!node) {
    return false
  }
  const pin = savePin(node)
  const key = pinKey(target)
  useBrowserTabTreeStore.setState((state) => {
    const branches = state.pinnedByWorkspace[key] ?? EMPTY_BRANCHES
    return {
      pinnedByWorkspace: {
        ...state.pinnedByWorkspace,
        [key]: branches.some((existing) => browserTabTreeNodeId(existing) === nodeId)
          ? branches.map((existing) => (browserTabTreeNodeId(existing) === nodeId ? pin : existing))
          : [...branches, pin]
      }
    }
  })
  return true
}

export function unpinBrowserTabTreeBranch(target: BrowserTabTreePinTarget, nodeId: string): void {
  const key = pinKey(target)
  useBrowserTabTreeStore.setState((state) => {
    const branches = state.pinnedByWorkspace[key]
    if (!branches?.some((node) => browserTabTreeNodeId(node) === nodeId)) {
      return state
    }
    const pinnedByWorkspace = { ...state.pinnedByWorkspace }
    const remaining = branches.filter((node) => browserTabTreeNodeId(node) !== nodeId)
    if (remaining.length > 0) {
      pinnedByWorkspace[key] = remaining
    } else {
      delete pinnedByWorkspace[key]
    }
    return { pinnedByWorkspace }
  })
}

export function activatePinnedBrowserTab(
  target: BrowserTabTreePinTarget,
  node: PinnedBrowserTabPage
): boolean {
  const owner = readPinnedBrowserTabOwner(target, node)
  if (!owner) {
    return false
  }
  const live = findPage(useAppStore.getState().browserPagesByWorkspace, node.pageId)
  if (live) {
    const result = activateBrowserPagePaletteResult({
      pageId: node.pageId,
      workspaceId: live.workspaceId,
      worktreeId: node.worktreeId,
      executionHostId: node.executionHostId
    })
    if (result.status !== 'activated') {
      return false
    }
    requestBrowserFocus({ pageId: result.pageId, target: result.focusTarget })
    return true
  }
  const url = node.url && normalizeBrowserNavigationUrl(node.url)
  if (!url || node.browserRuntimeEnvironmentId || owner.runtimeOwnerEnvironmentId) {
    return false
  }
  if (!activateAndRevealWorkspace(node.worktreeId, { executionHostId: node.executionHostId })) {
    return false
  }
  const tab = useAppStore.getState().createBrowserTab(node.worktreeId, url, {
    browserPageId: node.pageId,
    browserRuntimeEnvironmentId: null,
    sessionProfileId: node.sessionProfileId ?? null,
    sessionPartition: node.sessionPartition ?? null,
    executionHostId: node.executionHostId,
    title: node.title
  })
  if (tab.activePageId) {
    requestBrowserFocus({ pageId: tab.activePageId, target: 'webview' })
  }
  return true
}

export function moveBrowserTabTreeBranch(
  nodeId: string,
  parentId: string | null,
  beforeId?: string
): boolean {
  const positions = moveBrowserTabTreeNode(
    readActiveBrowserTabTree(),
    useBrowserTabTreeStore.getState().positions,
    nodeId,
    parentId,
    beforeId
  )
  if (!positions) {
    return false
  }
  useBrowserTabTreeStore.setState({ positions })
  return true
}

export function createBrowserTabTreeGroup(title: string): boolean {
  const state = useAppStore.getState()
  const owner = state.activeWorktreeId
    ? state.getKnownWorktreeById(
        state.activeWorktreeId,
        state.activeWorkspaceExecutionHostId ?? undefined
      )
    : undefined
  const name = title.trim()
  if (!owner || owner.isArchived || !name) {
    return false
  }
  const groupId = `group:${createBrowserUuid()}`
  const group: BrowserTabTreeGroup = {
    kind: 'group',
    groupId,
    title: name,
    ...workspacePinTarget(owner),
    workspaceName: owner.displayName
  }
  useBrowserTabTreeStore.setState((current) => ({
    groupsById: { ...current.groupsById, [groupId]: group }
  }))
  return true
}

export function renameBrowserTabTreeGroup(groupId: string, title: string): boolean {
  const group = findBrowserTabTreeNode(readActiveBrowserTabTree(), groupId)
  const name = title.trim()
  if (group?.kind !== 'group' || !name) {
    return false
  }
  useBrowserTabTreeStore.setState((state) => ({
    groupsById: { ...state.groupsById, [groupId]: { ...state.groupsById[groupId], title: name } }
  }))
  return true
}

export function removeBrowserTabTreeGroup(groupId: string): boolean {
  const tree = readActiveBrowserTabTree()
  const { positions, groupsById, collapsedByPageId, pinnedByWorkspace } =
    useBrowserTabTreeStore.getState()
  const nextPositions = removeBrowserTabTreeGroupNode(tree, positions, groupId)
  if (!nextPositions) {
    return false
  }
  const nextGroups = { ...groupsById }
  const nextCollapsed = { ...collapsedByPageId }
  delete nextGroups[groupId]
  delete nextCollapsed[groupId]
  const nextPins = { ...pinnedByWorkspace }
  for (const [key, pins] of Object.entries(pinnedByWorkspace)) {
    const remaining = pins.filter((pin) => browserTabTreeNodeId(pin) !== groupId)
    if (remaining.length !== pins.length) {
      if (remaining.length > 0) {
        nextPins[key] = remaining
      } else {
        delete nextPins[key]
      }
    }
  }
  useBrowserTabTreeStore.setState({
    positions: nextPositions,
    groupsById: nextGroups,
    collapsedByPageId: nextCollapsed,
    pinnedByWorkspace: nextPins
  })
  return true
}

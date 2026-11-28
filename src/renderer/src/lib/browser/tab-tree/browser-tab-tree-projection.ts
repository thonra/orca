import { useMemo } from 'react'
import { shallow } from 'zustand/shallow'
import {
  composeWorktreeHostIdentity,
  getExecutionHostIdFromWorktreeHostIdentity,
  getWorktreeIdFromHostIdentity,
  getWorktreeHostIdentity
} from '../../../../../shared/worktree/host-qualified-identity'
import type { Worktree } from '../../../../../shared/worktree/types'
import { useAppStore } from '@/store/index'
import {
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspaces/catalog/workspace-record-fields'
import type { AppState } from '@/store/types'
import { selectSidebarChildrenByParentIdentity } from '@/store/slices/worktrees/metadata/cross-store-lineage-parents'
import {
  readRuntimeStatuses,
  type RuntimeStatuses
} from '@/store/slices/runtime-status/views/runtime-status-owner'
import { useAppStoreWithHostStatuses } from '@/store/slices/runtime-status/views/use-app-store-with-host-statuses'
import {
  findAmbiguousWorktreeIds,
  getPaletteOwnershipWorktreeIds,
  isUnifiedTabOwnedByWorktree
} from '@/lib/workspace/ownership/unified-tab-host-ownership'
import {
  buildBrowserTabTree,
  resolvePinnedBrowserTabBranches,
  sameBrowserTabTreeOwner,
  type BrowserTabTreeGroup,
  type BrowserTabTreeNode,
  type BrowserTabTreePage,
  type BrowserTabTreePinTarget,
  type BrowserTabTreePositions,
  type PinnedBrowserTabBranch
} from './browser-tab-tree-model'
import { useBrowserTabTreeStore } from './browser-tab-tree-preferences'

export type { BrowserTabTreeNode } from './browser-tab-tree-model'

const EMPTY_TREE: readonly BrowserTabTreeNode[] = []

function selectTreeInputs(state: AppState, statuses: RuntimeStatuses, includeSelection = true) {
  return {
    active:
      includeSelection && state.activeWorktreeId
        ? state.getKnownWorktreeById(
            state.activeWorktreeId,
            state.activeWorkspaceExecutionHostId ?? undefined
          )
        : undefined,
    children: selectSidebarChildrenByParentIdentity(state, statuses),
    worktreesByRepo: selectWorktreesByRepo(state),
    folderWorkspaces: selectFolderWorkspaces(state),
    tabs: state.browserTabsByWorktree,
    pages: state.browserPagesByWorkspace,
    unified: state.unifiedTabsByWorktree,
    selectedBrowserTabId: includeSelection ? state.activeBrowserTabId : null,
    activeView: includeSelection ? state.activeTabType : null,
    getWorktree: state.getKnownWorktreeById
  }
}

function getWorkspaceFamily(
  active: Worktree,
  children: ReadonlyMap<string, readonly Worktree[]>,
  getWorktree: AppState['getKnownWorktreeById']
): Worktree[] {
  const root = getWorkspaceFamilyRoot(active, children, getWorktree)
  if (!root) {
    return [active]
  }
  const family: Worktree[] = []
  const visited = new Set<string>()
  const pending = [root]
  while (pending.length > 0) {
    const workspace = pending.pop()!
    const identity = getWorktreeHostIdentity(workspace)
    if (visited.has(identity)) {
      continue
    }
    visited.add(identity)
    family.push(workspace)
    pending.push(...(children.get(identity) ?? []))
  }
  return family
}

function getWorkspaceFamilyRoot(
  active: Worktree,
  children: ReadonlyMap<string, readonly Worktree[]>,
  getWorktree: AppState['getKnownWorktreeById']
): Worktree | undefined {
  const byParent = new Map<string, string>()
  for (const [parentIdentity, worktrees] of children) {
    for (const child of worktrees) {
      byParent.set(getWorktreeHostIdentity(child), parentIdentity)
    }
  }
  const activeIdentity = getWorktreeHostIdentity(active)
  let root: string = activeIdentity
  const ancestors = new Set<string>([root])
  for (
    let parent = byParent.get(root);
    parent && !ancestors.has(parent);
    parent = byParent.get(root)
  ) {
    ancestors.add(parent)
    root = parent
  }
  const rootWorkspace = getWorktree(
    getWorktreeIdFromHostIdentity(root),
    getExecutionHostIdFromWorktreeHostIdentity(root)
  )
  return rootWorkspace && getWorktreeHostIdentity(rootWorkspace) === root
    ? rootWorkspace
    : undefined
}

function projectTree(
  inputs: ReturnType<typeof selectTreeInputs>,
  positions: BrowserTabTreePositions,
  groupsById: Readonly<Record<string, BrowserTabTreeGroup>>,
  family = getActiveWorkspaceFamily(inputs)
): readonly BrowserTabTreeNode[] {
  if (family.length === 0) {
    return EMPTY_TREE
  }
  const activeIdentity = inputs.active ? getWorktreeHostIdentity(inputs.active) : null
  const familyByIdentity = new Map(
    family.map((workspace) => [getWorktreeHostIdentity(workspace), workspace])
  )
  const ambiguous = findAmbiguousWorktreeIds(getPaletteOwnershipWorktreeIds(inputs))
  const pages: BrowserTabTreePage[] = []
  for (const owner of family) {
    const wrappers = new Map(
      (inputs.unified[owner.id] ?? [])
        .filter((tab) => tab.contentType === 'browser')
        .map((tab) => [tab.entityId, tab])
    )
    for (const tab of inputs.tabs[owner.id] ?? []) {
      if (!isUnifiedTabOwnedByWorktree(wrappers.get(tab.id), owner, ambiguous)) {
        continue
      }
      for (const page of inputs.pages[tab.id] ?? []) {
        if (page.docLocation || page.workspaceId !== tab.id || page.worktreeId !== owner.id) {
          continue
        }
        pages.push({
          pageId: page.id,
          workspaceId: tab.id,
          worktreeId: owner.id,
          executionHostId: owner.hostId,
          worktreeInstanceId: owner.instanceId,
          workspaceName: owner.displayName,
          title: page.title || page.url,
          url: page.url,
          faviconUrl: page.faviconUrl,
          sessionProfileId: tab.sessionProfileId,
          sessionPartition: tab.sessionPartition,
          browserRuntimeEnvironmentId: page.browserRuntimeEnvironmentId,
          active:
            getWorktreeHostIdentity(owner) === activeIdentity &&
            inputs.activeView === 'browser' &&
            inputs.selectedBrowserTabId === tab.id &&
            (tab.activePageId ?? tab.id) === page.id
        })
      }
    }
  }
  const groups: BrowserTabTreeGroup[] = []
  for (const group of Object.values(groupsById)) {
    const owner = familyByIdentity.get(
      composeWorktreeHostIdentity(group.executionHostId, group.worktreeId)
    )
    if (owner && owner.instanceId === group.worktreeInstanceId) {
      groups.push({ ...group, workspaceName: owner.displayName })
    }
  }
  return buildBrowserTabTree([...pages, ...groups], positions)
}

function getActiveWorkspaceFamily(inputs: ReturnType<typeof selectTreeInputs>): Worktree[] {
  return inputs.active ? getWorkspaceFamily(inputs.active, inputs.children, inputs.getWorktree) : []
}

export function useActiveBrowserTabTree(): readonly BrowserTabTreeNode[] {
  const inputs = useAppStoreWithHostStatuses(selectTreeInputs, shallow)
  const positions = useBrowserTabTreeStore((state) => state.positions)
  const groupsById = useBrowserTabTreeStore((state) => state.groupsById)
  return useMemo(() => projectTree(inputs, positions, groupsById), [inputs, positions, groupsById])
}

export function workspacePinTarget(workspace: Worktree): BrowserTabTreePinTarget {
  return {
    worktreeId: workspace.id,
    executionHostId: workspace.hostId,
    worktreeInstanceId: workspace.instanceId
  }
}

function getPinWorkspaceFamily(
  target: BrowserTabTreePinTarget,
  children: ReadonlyMap<string, readonly Worktree[]>,
  getWorktree: AppState['getKnownWorktreeById']
): Worktree[] {
  const workspace = getWorktree(target.worktreeId, target.executionHostId)
  if (
    !workspace ||
    workspace.isArchived ||
    !sameBrowserTabTreeOwner(workspacePinTarget(workspace), target)
  ) {
    return []
  }
  return getWorkspaceFamily(workspace, children, getWorktree).filter((owner) => !owner.isArchived)
}

export function useWorkspacePinnedBrowserBranches(
  { worktreeId, executionHostId, worktreeInstanceId }: BrowserTabTreePinTarget,
  pins: readonly PinnedBrowserTabBranch[]
): PinnedBrowserTabBranch[] {
  const inputs = useAppStoreWithHostStatuses(
    (state, statuses) => selectTreeInputs(state, statuses, false),
    shallow
  )
  const positions = useBrowserTabTreeStore((state) => state.positions)
  const groupsById = useBrowserTabTreeStore((state) => state.groupsById)
  return useMemo(() => {
    const family = getPinWorkspaceFamily(
      { worktreeId, executionHostId, worktreeInstanceId },
      inputs.children,
      inputs.getWorktree
    )
    const tree = projectTree(inputs, positions, groupsById, family)
    return resolvePinnedBrowserTabBranches(pins, tree, family.map(workspacePinTarget))
  }, [inputs, positions, groupsById, pins, worktreeId, executionHostId, worktreeInstanceId])
}

export function readPinnedBrowserTabOwner(
  target: BrowserTabTreePinTarget,
  node: BrowserTabTreePinTarget
): Worktree | undefined {
  const state = useAppStore.getState()
  const children = selectSidebarChildrenByParentIdentity(state, readRuntimeStatuses())
  return getPinWorkspaceFamily(target, children, state.getKnownWorktreeById).find((owner) =>
    sameBrowserTabTreeOwner(workspacePinTarget(owner), node)
  )
}

export function readActiveBrowserTabTree(): readonly BrowserTabTreeNode[] {
  return readActiveBrowserTabTreeContext().nodes
}

export function readBrowserTabTreeWorkspaceRoot(workspace: Worktree): Worktree {
  const state = useAppStore.getState()
  return (
    getWorkspaceFamilyRoot(
      workspace,
      selectSidebarChildrenByParentIdentity(state, readRuntimeStatuses()),
      state.getKnownWorktreeById
    ) ?? workspace
  )
}

export function readActiveBrowserTabTreeContext(): {
  nodes: readonly BrowserTabTreeNode[]
  family: readonly Worktree[]
} {
  const { positions, groupsById } = useBrowserTabTreeStore.getState()
  const inputs = selectTreeInputs(useAppStore.getState(), readRuntimeStatuses())
  const family = getActiveWorkspaceFamily(inputs)
  return { nodes: projectTree(inputs, positions, groupsById, family), family }
}

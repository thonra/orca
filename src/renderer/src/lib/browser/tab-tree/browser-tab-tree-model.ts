import type { ExecutionHostId } from '../../../../../shared/execution-host/execution-host'

export type BrowserTabTreePinTarget = {
  worktreeId: string
  executionHostId?: ExecutionHostId
  worktreeInstanceId?: string
}

export type BrowserTabTreePage = BrowserTabTreePinTarget & {
  kind?: 'page'
  pageId: string
  workspaceId: string
  workspaceName: string
  title: string
  url: string
  faviconUrl: string | null
  sessionProfileId?: string | null
  sessionPartition?: string | null
  browserRuntimeEnvironmentId?: string | null
  active: boolean
}

export type BrowserTabTreeGroup = BrowserTabTreePinTarget & {
  kind: 'group'
  groupId: string
  title: string
  workspaceName: string
}

type BrowserTabTreeEntry = BrowserTabTreePage | BrowserTabTreeGroup

export type BrowserTabTreeNode = BrowserTabTreeEntry & { children: readonly BrowserTabTreeNode[] }

export type PinnedBrowserTabPage = Omit<BrowserTabTreePage, 'active'>

export type PinnedBrowserTabBranch = (PinnedBrowserTabPage | BrowserTabTreeGroup) & {
  children: readonly PinnedBrowserTabBranch[]
}

export type BrowserTabTreePosition = { order?: number } & (
  | { parentId: string | null; parentPageId?: never }
  | { parentId?: never; parentPageId: string | null }
)
export type BrowserTabTreePositions = Readonly<Record<string, BrowserTabTreePosition>>

export type BrowserTabTreeGrouping = {
  groupsById: Record<string, BrowserTabTreeGroup>
  positions: BrowserTabTreePositions
}

export function placeAgentBrowserTab(
  { groupsById, positions }: BrowserTabTreeGrouping,
  pageId: string,
  owner: BrowserTabTreePinTarget & { workspaceName: string },
  sessionId: string,
  title: string
): BrowserTabTreeGrouping | null {
  if (Object.hasOwn(positions, pageId)) {
    return null
  }
  const groupId = `group:agent:${JSON.stringify([
    owner.executionHostId ?? null,
    owner.worktreeId,
    owner.worktreeInstanceId ?? null,
    sessionId
  ])}`
  return {
    groupsById: groupsById[groupId]
      ? groupsById
      : { ...groupsById, [groupId]: { ...owner, kind: 'group', groupId, title } },
    positions: { ...positions, [pageId]: { parentId: groupId } }
  }
}

export function browserTabTreeNodeId(
  node: Pick<BrowserTabTreeGroup, 'kind' | 'groupId'> | Pick<BrowserTabTreePage, 'kind' | 'pageId'>
): string {
  return node.kind === 'group' ? node.groupId : node.pageId
}

export function sameBrowserTabTreeOwner(
  a: BrowserTabTreePinTarget,
  b: BrowserTabTreePinTarget
): boolean {
  return (
    a.worktreeId === b.worktreeId &&
    a.executionHostId === b.executionHostId &&
    a.worktreeInstanceId === b.worktreeInstanceId
  )
}

export function buildBrowserTabTree(
  entries: readonly BrowserTabTreeEntry[],
  positions: BrowserTabTreePositions
): BrowserTabTreeNode[] {
  const entriesById = new Map(entries.map((entry) => [browserTabTreeNodeId(entry), entry]))
  const parents = new Map<string, string | null>()
  for (const id of entriesById.keys()) {
    const position = positions[id]
    const parent = position?.parentId ?? position?.parentPageId
    parents.set(id, parent && entriesById.has(parent) ? parent : null)
  }

  const visited = new Set<string>()
  for (const id of entriesById.keys()) {
    const path = new Set<string>()
    let current: string | null = id
    while (current && !visited.has(current)) {
      if (path.has(current)) {
        parents.set(current, null)
        break
      }
      path.add(current)
      current = parents.get(current) ?? null
    }
    for (const id of path) {
      visited.add(id)
    }
  }

  const childrenByParent = new Map<string | null, BrowserTabTreeEntry[]>()
  for (const [id, entry] of entriesById) {
    const parent = parents.get(id) ?? null
    const siblings = childrenByParent.get(parent)
    if (siblings) {
      siblings.push(entry)
    } else {
      childrenByParent.set(parent, [entry])
    }
  }

  const buildChildren = (parent: string | null): BrowserTabTreeNode[] =>
    (childrenByParent.get(parent) ?? [])
      .sort((a, b) => {
        const aOrder = positions[browserTabTreeNodeId(a)]?.order ?? Number.MAX_SAFE_INTEGER
        const bOrder = positions[browserTabTreeNodeId(b)]?.order ?? Number.MAX_SAFE_INTEGER
        return aOrder - bOrder
      })
      .map((entry) => ({ ...entry, children: buildChildren(browserTabTreeNodeId(entry)) }))
  return buildChildren(null)
}

export function findBrowserTabTreeNode(
  nodes: readonly BrowserTabTreeNode[],
  nodeId: string
): BrowserTabTreeNode | undefined {
  return findBrowserTabTreePath(nodes, nodeId)?.at(-1)
}

export function resolvePinnedBrowserTabBranches(
  pins: readonly PinnedBrowserTabBranch[],
  nodes: readonly BrowserTabTreeNode[],
  family: readonly BrowserTabTreePinTarget[]
): PinnedBrowserTabBranch[] {
  return pins
    .filter((pin) => family.some((owner) => sameBrowserTabTreeOwner(owner, pin)))
    .map((pin) => {
      const live = findBrowserTabTreeNode(nodes, browserTabTreeNodeId(pin))
      if (live && sameBrowserTabTreeOwner(live, pin)) {
        return live
      }
      return pin.children.length > 0 ? { ...pin, children: [] } : pin
    })
}

function findBrowserTabTreePath(
  nodes: readonly BrowserTabTreeNode[],
  nodeId: string
): BrowserTabTreeNode[] | undefined {
  for (const node of nodes) {
    if (browserTabTreeNodeId(node) === nodeId) {
      return [node]
    }
    const path = findBrowserTabTreePath(node.children, nodeId)
    if (path) {
      return [node, ...path]
    }
  }
  return undefined
}

export function moveBrowserTabTreeNode(
  nodes: readonly BrowserTabTreeNode[],
  positions: BrowserTabTreePositions,
  nodeId: string,
  parentId: string | null,
  beforeId?: string
): BrowserTabTreePositions | null {
  const moving = findBrowserTabTreeNode(nodes, nodeId)
  const parentPath = parentId ? findBrowserTabTreePath(nodes, parentId) : []
  const parent = parentPath?.at(-1)
  if (!moving || !parentPath || parentPath.some((node) => browserTabTreeNodeId(node) === nodeId)) {
    return null
  }
  const siblings = (parent?.children ?? nodes).filter(
    (node) => browserTabTreeNodeId(node) !== nodeId
  )
  const index = beforeId
    ? siblings.findIndex((node) => browserTabTreeNodeId(node) === beforeId)
    : -1
  if (beforeId && index === -1) {
    return null
  }
  siblings.splice(index < 0 ? siblings.length : index, 0, moving)
  return {
    ...positions,
    ...siblingPositions(siblings, parentId)
  }
}

export function removeBrowserTabTreeGroupNode(
  nodes: readonly BrowserTabTreeNode[],
  positions: BrowserTabTreePositions,
  groupId: string
): BrowserTabTreePositions | null {
  const path = findBrowserTabTreePath(nodes, groupId)
  const group = path?.at(-1)
  if (group?.kind !== 'group') {
    return null
  }
  const parent = path?.at(-2)
  const siblings = (parent?.children ?? nodes).flatMap((node) =>
    browserTabTreeNodeId(node) === groupId ? group.children : [node]
  )
  const next = {
    ...positions,
    ...siblingPositions(siblings, parent ? browserTabTreeNodeId(parent) : null)
  }
  delete next[groupId]
  return next
}

function siblingPositions(nodes: readonly BrowserTabTreeNode[], parentId: string | null) {
  return Object.fromEntries(
    nodes.map((node, order) => [browserTabTreeNodeId(node), { parentId, order }])
  )
}

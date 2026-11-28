import { expect, it } from 'vitest'
import {
  browserTabTreeNodeId,
  buildBrowserTabTree,
  findBrowserTabTreeNode,
  moveBrowserTabTreeNode,
  placeAgentBrowserTab,
  removeBrowserTabTreeGroupNode,
  resolvePinnedBrowserTabBranches,
  type BrowserTabTreeGroup,
  type BrowserTabTreeGrouping,
  type BrowserTabTreePage
} from './browser-tab-tree-model'

function browserPage(pageId: string, worktreeId = 'release'): BrowserTabTreePage {
  return {
    pageId,
    workspaceId: pageId,
    worktreeId,
    workspaceName: 'Release',
    title: pageId,
    url: `https://example.com/${pageId}`,
    faviconUrl: null,
    active: false
  }
}

it('moves an entire branch and refuses a move into its own descendant or outside its tree', () => {
  const pages = ['pr', 'ci', 'log', 'docs'].map((pageId) => browserPage(pageId))
  const positions = { ci: { parentPageId: 'pr' }, log: { parentPageId: 'ci' } }
  const tree = buildBrowserTabTree(pages, positions)

  expect(moveBrowserTabTreeNode(tree, positions, 'pr', 'log')).toBeNull()
  expect(moveBrowserTabTreeNode(tree, positions, 'pr', 'other-workspace')).toBeNull()
  const moved = moveBrowserTabTreeNode(tree, positions, 'ci', 'docs')
  expect(moved).not.toBeNull()
  const reordered = buildBrowserTabTree(pages, moved ?? {})
  expect(findBrowserTabTreeNode(reordered, 'pr')?.children).toEqual([])
  const movedBranch = findBrowserTabTreeNode(reordered, 'docs')?.children[0]
  expect(movedBranch && browserTabTreeNodeId(movedBranch)).toBe('ci')
  expect(movedBranch?.children.map(browserTabTreeNodeId)).toEqual(['log'])
})

it('groups fresh tabs by session and workspace family without overriding existing positions', () => {
  const owner = { worktreeId: 'release', workspaceName: 'Release' }
  const empty: BrowserTabTreeGrouping = { positions: {}, groupsById: {} }
  const first = placeAgentBrowserTab(empty, 'logs', owner, 'session-1', 'Check logs') ?? empty
  const second = placeAgentBrowserTab(first, 'metrics', owner, 'session-1', 'Check logs') ?? first
  const third =
    placeAgentBrowserTab(second, 'preview', owner, 'session-2', 'Preview changes') ?? second
  const pages = [browserPage('logs'), browserPage('metrics', 'frontend'), browserPage('preview')]
  const entries = [...Object.values(third.groupsById), ...pages]
  const tree = buildBrowserTabTree(entries, third.positions)
  expect(tree.map((group) => [group.title, group.children.map(browserTabTreeNodeId)])).toEqual([
    ['Check logs', ['logs', 'metrics']],
    ['Preview changes', ['preview']]
  ])

  const moved = {
    ...third,
    positions: {
      ...third.positions,
      logs: { parentId: null },
      details: { parentId: 'metrics' }
    }
  }
  expect(placeAgentBrowserTab(moved, 'logs', owner, 'session-1', 'Check logs')).toBeNull()
  expect(placeAgentBrowserTab(moved, 'details', owner, 'session-1', 'Check logs')).toBeNull()
  const otherRoot = placeAgentBrowserTab(
    moved,
    'dashboard',
    { worktreeId: 'other', workspaceName: 'Other' },
    'session-1',
    'Check logs'
  )
  expect(
    Object.values(otherRoot?.groupsById ?? {})
      .filter((group) => group.title === 'Check logs')
      .map((group) => group.worktreeId)
  ).toEqual(['release', 'other'])
})

it('groups tabs from sibling workspaces and preserves their branches when dissolved', () => {
  const group: BrowserTabTreeGroup = {
    kind: 'group',
    groupId: 'group:checks',
    worktreeId: 'release',
    workspaceName: 'Release',
    title: 'Checks'
  }
  const entries = [group, browserPage('ci'), browserPage('log'), browserPage('preview', 'frontend')]
  const positions = { ci: { parentId: group.groupId }, log: { parentId: 'ci' } }
  const tree = buildBrowserTabTree(entries, positions)
  const groupedPositions = moveBrowserTabTreeNode(tree, positions, 'preview', group.groupId) ?? {}
  const groupedTree = buildBrowserTabTree(entries, groupedPositions)
  expect(groupedTree[0].children.map(browserTabTreeNodeId)).toEqual(['ci', 'preview'])

  const ungrouped = buildBrowserTabTree(
    entries.slice(1),
    removeBrowserTabTreeGroupNode(groupedTree, groupedPositions, group.groupId) ?? {}
  )
  expect(ungrouped.map(browserTabTreeNodeId)).toEqual(['ci', 'preview'])
  expect(ungrouped[0].children.map(browserTabTreeNodeId)).toEqual(['log'])
})

it('resolves saved pins against the current tree and drops stale descendants for a closed root', () => {
  const parent = browserPage('pr', 'backend')
  const child = browserPage('ci')
  const legacySnapshot = buildBrowserTabTree([parent, child], { ci: { parentId: 'pr' } })[0]
  const pins = [legacySnapshot, legacySnapshot.children[0]]
  const liveTree = buildBrowserTabTree([parent, child, browserPage('new-log')], {
    'new-log': { parentId: 'pr' }
  })

  const family = [{ worktreeId: 'release' }, { worktreeId: 'backend' }]
  const resolved = resolvePinnedBrowserTabBranches(pins, liveTree, family)
  expect(resolved.map(browserTabTreeNodeId)).toEqual(['pr', 'ci'])
  expect(resolved[0].children.map(browserTabTreeNodeId)).toEqual(['new-log'])

  const closedTree = buildBrowserTabTree([child], {})
  const closed = resolvePinnedBrowserTabBranches(pins, closedTree, family)
  expect(closed.map(browserTabTreeNodeId)).toEqual(['pr', 'ci'])
  expect(closed[0].children).toEqual([])

  const afterReparent = resolvePinnedBrowserTabBranches(pins, closedTree, [
    { worktreeId: 'release' }
  ])
  expect(afterReparent.map(browserTabTreeNodeId)).toEqual(['ci'])
})

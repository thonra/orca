import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BrowserTabTreeGrouping, PinnedBrowserTabBranch } from './browser-tab-tree-model'

export const BROWSER_TAB_TREE_DRAG_TYPE = 'application/x-orca-browser-tab-tree'

type BrowserTabTreePreferences = BrowserTabTreeGrouping & {
  collapsedByPageId: Record<string, boolean>
  pinnedByWorkspace: Record<string, readonly PinnedBrowserTabBranch[]>
  toggleCollapsed: (pageId: string) => void
}

export const useBrowserTabTreeStore = create<BrowserTabTreePreferences>()(
  persist(
    (set) => ({
      positions: {},
      groupsById: {},
      collapsedByPageId: {},
      pinnedByWorkspace: {},
      toggleCollapsed: (pageId) =>
        set((state) => {
          const collapsedByPageId = { ...state.collapsedByPageId }
          if (collapsedByPageId[pageId]) {
            delete collapsedByPageId[pageId]
          } else {
            collapsedByPageId[pageId] = true
          }
          return { collapsedByPageId }
        })
    }),
    { name: 'orca-browser-tab-tree' }
  )
)

export function rememberBrowserTabOpener(pageId: string, openerPageId: string): void {
  const { positions } = useBrowserTabTreeStore.getState()
  if (pageId !== openerPageId && !Object.hasOwn(positions, pageId)) {
    useBrowserTabTreeStore.setState({
      positions: { ...positions, [pageId]: { parentId: openerPageId } }
    })
  }
}

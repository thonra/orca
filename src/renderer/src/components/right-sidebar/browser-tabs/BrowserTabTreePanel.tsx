import { useState, type Dispatch, type DragEvent, type SetStateAction } from 'react'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import { toast } from 'sonner'
import { BrowserFavicon } from '@/components/browser-pane/describe-page/browser-favicon'
import { requestBrowserFocus } from '@/components/browser-pane/host-guest/input/browser-focus'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { activateBrowserPagePaletteResult } from '@/lib/browser/palette/browser-page-palette-activation'
import {
  useActiveBrowserTabTree,
  type BrowserTabTreeNode
} from '@/lib/browser/tab-tree/browser-tab-tree-projection'
import {
  beginBrowserTabTreeDrag,
  BROWSER_TAB_TREE_DRAG_TYPE,
  browserTabTreeNodeId,
  endBrowserTabTreeDrag,
  moveBrowserTabTreeBranch,
  useBrowserTabTreeStore
} from '@/lib/browser/tab-tree/browser-tab-tree-state'
import { cn } from '@/lib/class-names'
import { useAppStore } from '@/store/index'
import {
  BrowserTabTreeGroupActions,
  NewBrowserTabTreeGroupButton
} from './browser-tab-tree-group-controls'

type DropPosition = 'before' | 'inside' | 'after'
type DropIndicator = { nodeId: string; position: DropPosition }

function getDropPosition(event: DragEvent<HTMLDivElement>): DropPosition {
  const { top, height } = event.currentTarget.getBoundingClientRect()
  const offset = event.clientY - top
  if (offset < height / 4) {
    return 'before'
  }
  if (offset > (height * 3) / 4) {
    return 'after'
  }
  return 'inside'
}

export default function BrowserTabTreePanel(): React.JSX.Element {
  const t = useTranslate()
  const nodes = useActiveBrowserTabTree()
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeHostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-background"
      onDragEnd={() => {
        endBrowserTabTreeDrag()
        setDropIndicator(null)
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          setDropIndicator(null)
        }
      }}
    >
      <div className="flex shrink-0 justify-end border-b border-border px-2 py-1">
        <NewBrowserTabTreeGroupButton
          key={JSON.stringify([activeHostId, activeWorktreeId])}
          disabled={!activeWorktreeId}
        />
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
        {nodes.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {t('browser.tabTree.empty', 'No browser tabs in this workspace tree')}
          </p>
        ) : (
          <ul aria-label={t('browser.tabTree.title', 'Browser Tabs')}>
            <BrowserTabTreeRows
              nodes={nodes}
              parentNodeId={null}
              dropIndicator={dropIndicator}
              setDropIndicator={setDropIndicator}
            />
          </ul>
        )}
      </div>
    </div>
  )
}

type BrowserTabTreeDragState = {
  dropIndicator: DropIndicator | null
  setDropIndicator: Dispatch<SetStateAction<DropIndicator | null>>
}

function BrowserTabTreeRows({
  nodes,
  parentNodeId,
  dropIndicator,
  setDropIndicator
}: {
  nodes: readonly BrowserTabTreeNode[]
  parentNodeId: string | null
} & BrowserTabTreeDragState): React.JSX.Element[] {
  return nodes.map((node, index) => {
    const next = nodes[index + 1]
    return (
      <BrowserTabTreeRow
        key={browserTabTreeNodeId(node)}
        node={node}
        parentNodeId={parentNodeId}
        nextNodeId={next ? browserTabTreeNodeId(next) : undefined}
        dropIndicator={dropIndicator}
        setDropIndicator={setDropIndicator}
      />
    )
  })
}

function BrowserTabTreeRow({
  node,
  parentNodeId,
  nextNodeId,
  dropIndicator,
  setDropIndicator
}: {
  node: BrowserTabTreeNode
  parentNodeId: string | null
  nextNodeId?: string
} & BrowserTabTreeDragState): React.JSX.Element {
  const t = useTranslate()
  const nodeId = browserTabTreeNodeId(node)
  const collapsed = useBrowserTabTreeStore((state) => state.collapsedByPageId[nodeId] === true)
  const toggleCollapsed = useBrowserTabTreeStore((state) => state.toggleCollapsed)
  const isGroup = node.kind === 'group'
  const canExpand = isGroup || node.children.length > 0
  const active = !isGroup && node.active
  const title = isGroup
    ? node.title
    : node.title || node.url || t('browser.tabTree.newTab', 'New tab')
  const position = dropIndicator?.nodeId === nodeId ? dropIndicator.position : null

  return (
    <li
      data-browser-tab-tree-page-id={isGroup ? undefined : node.pageId}
      data-browser-tab-tree-group-id={isGroup ? node.groupId : undefined}
    >
      <div
        className={cn(
          'relative flex min-w-0 items-center rounded-md',
          (active || position === 'inside') && 'bg-accent text-accent-foreground',
          position === 'inside' && 'ring-1 ring-inset ring-ring'
        )}
        data-current={active ? 'true' : undefined}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(BROWSER_TAB_TREE_DRAG_TYPE)) {
            return
          }
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          const nextPosition = getDropPosition(event)
          setDropIndicator((previous) =>
            previous?.nodeId === nodeId && previous.position === nextPosition
              ? previous
              : { nodeId, position: nextPosition }
          )
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes(BROWSER_TAB_TREE_DRAG_TYPE)) {
            return
          }
          event.preventDefault()
          event.stopPropagation()
          setDropIndicator(null)
          const draggedNodeId = event.dataTransfer.getData(BROWSER_TAB_TREE_DRAG_TYPE)
          endBrowserTabTreeDrag()
          const placement = getDropPosition(event)
          if (placement === 'inside') {
            if (moveBrowserTabTreeBranch(draggedNodeId, nodeId) && collapsed) {
              toggleCollapsed(nodeId)
            }
          } else {
            moveBrowserTabTreeBranch(
              draggedNodeId,
              parentNodeId,
              placement === 'before' ? nodeId : nextNodeId
            )
          }
        }}
      >
        {position && position !== 'inside' && (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-ring',
              position === 'before' ? 'top-0' : 'bottom-0'
            )}
            aria-hidden
          />
        )}
        {canExpand ? (
          <Button
            type="button"
            variant="ghost-muted"
            size="icon-xs"
            aria-expanded={!collapsed}
            aria-label={
              collapsed
                ? t('browser.tabTree.expandBranch', 'Expand {{title}}', { title })
                : t('browser.tabTree.collapseBranch', 'Collapse {{title}}', { title })
            }
            onClick={() => toggleCollapsed(nodeId)}
          >
            {collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </Button>
        ) : (
          <span className="size-6 shrink-0" aria-hidden />
        )}
        <Button
          type="button"
          variant="ghost-inset"
          size="toolbar"
          className="min-w-0 flex-1 justify-start"
          aria-current={active ? 'true' : undefined}
          title={title}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(BROWSER_TAB_TREE_DRAG_TYPE, nodeId)
            event.dataTransfer.effectAllowed = 'copyMove'
            beginBrowserTabTreeDrag(nodeId)
          }}
          onClick={() => {
            if (isGroup) {
              toggleCollapsed(nodeId)
              return
            }
            const result = activateBrowserPagePaletteResult(node)
            if (result.status === 'activated') {
              requestBrowserFocus({ pageId: result.pageId, target: result.focusTarget })
            } else if (result.status === 'failed') {
              toast.error(t('browser.tabTree.unavailable', 'Browser tab is no longer available'))
            }
          }}
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5 font-normal">
            {isGroup ? (
              <Folder className="size-3.5" aria-hidden="true" />
            ) : (
              <BrowserFavicon
                faviconUrl={node.faviconUrl}
                className="size-3.5"
                fallbackClassName="text-muted-foreground"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-start">{title}</span>
            <span className="max-w-1/3 truncate text-xs text-muted-foreground">
              {node.workspaceName}
            </span>
          </span>
        </Button>
        {isGroup ? <BrowserTabTreeGroupActions groupId={node.groupId} title={title} /> : null}
      </div>
      {node.children.length > 0 && !collapsed && (
        <ul className="ms-3 border-s border-border ps-2">
          <BrowserTabTreeRows
            nodes={node.children}
            parentNodeId={nodeId}
            dropIndicator={dropIndicator}
            setDropIndicator={setDropIndicator}
          />
        </ul>
      )}
    </li>
  )
}

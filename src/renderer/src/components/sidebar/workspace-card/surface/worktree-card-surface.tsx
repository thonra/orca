import React from 'react'
import { LoaderCircle } from 'lucide-react'

import { cn } from '@/lib/class-names'
import {
  BROWSER_TAB_TREE_DRAG_TYPE,
  canDropBrowserTabTreeBranch,
  endBrowserTabTreeDrag,
  pinBrowserTabTreeBranch,
  useBrowserTabTreeDropState
} from '@/lib/browser/tab-tree/browser-tab-tree-state'
import WorktreeContextMenu from '../../workspace-actions/context-menu/WorktreeContextMenu'
import { useIsSleepingWorktree } from '../../workspace-actions/sleep/use-worktree-sleep-state'
import { getWorktreeCardFrameGeometry } from './worktree-card-frame-geometry'
import type { WorktreeCardController } from '../controller/use-worktree-card-controller'
import { DEFAULT_WORKSPACE_CARD_TEMPLATE } from '../template/default-workspace-card'
import { renderWorkspaceCardTemplate } from '../template/render-workspace-card-template'
import { WorktreeCardTitleStatusProvider } from './worktree-card-title-status'
import { WorktreeCardBrowserBranches } from './worktree-card-browser-branches'

/** Shape, inset and transitions every sidebar card row shares; inactive rows add `worktree-sidebar-card-hover`. */
export const WORKTREE_CARD_SURFACE_CLASS_NAME =
  'relative ml-1 cursor-pointer overflow-hidden rounded-lg border border-transparent pr-1.5 outline-none select-none transition-[background-color,border-color,opacity,box-shadow] duration-200'

export function WorktreeCardSurface({
  card,
  showBrowserBranches
}: {
  card: WorktreeCardController
  showBrowserBranches: boolean
}): React.JSX.Element {
  const {
    worktree,
    selectedWorktrees,
    onAssignWorkspaceStatus,
    affiliateListMode,
    isActiveSurface,
    activeSurfaceVariant,
    isMultiSelected,
    revealHighlight,
    revealHighlightTone,
    flushSurface,
    isLineageDropTarget,
    nativeDragEnabled,
    lineageChildren,
    lineageChildrenStyle,
    newCardStyle,
    titleRenaming,
    isDeleting,
    isRuntimeDisconnected,
    isQueuedForDeletion,
    deleteLabel,
    handleClick,
    handlePointerDown,
    handlePointerEnter,
    handlePointerLeave,
    handleDoubleClick,
    handleDragStart,
    handleDragEnd,
    handleContextMenuSelect,
    contentIndent
  } = card
  const [isBrowserBranchDropTarget, setBrowserBranchDropTarget] = React.useState(false)
  const browserBranchTarget = {
    worktreeId: worktree.id,
    executionHostId: worktree.hostId,
    worktreeInstanceId: worktree.instanceId
  }
  const canPinBrowserBranches =
    showBrowserBranches && !worktree.isArchived && !isDeleting && !isQueuedForDeletion
  const browserTabTreeDropState = useBrowserTabTreeDropState(browserBranchTarget)
  const browserBranchDropState =
    showBrowserBranches && browserTabTreeDropState
      ? canPinBrowserBranches
        ? browserTabTreeDropState
        : 'ineligible'
      : null
  const isBrowserDropHovered = browserBranchDropState === 'eligible' && isBrowserBranchDropTarget
  const isDropTarget = isLineageDropTarget || isBrowserDropHovered
  const isSleeping = useIsSleepingWorktree(worktree.id)
  const geometryFor = (statusLane: boolean) =>
    getWorktreeCardFrameGeometry({ flushSurface, contentIndent, statusLane })
  const { content: templateContent, frame } = renderWorkspaceCardTemplate(
    card,
    DEFAULT_WORKSPACE_CARD_TEMPLATE,
    (templateFrame) => {
      const { parentContentMarginLeft } = geometryFor(templateFrame.statusLane)
      return parentContentMarginLeft < 0
        ? { style: { marginLeft: `${parentContentMarginLeft}px` } }
        : undefined
    }
  )
  const parentCardContent = newCardStyle ? (
    // One roll-up per card feeds the status lane, the title and the title's right-hand slot.
    <WorktreeCardTitleStatusProvider card={card}>{templateContent}</WorktreeCardTitleStatusProvider>
  ) : (
    templateContent
  )
  const { cardStyle } = geometryFor(frame.statusLane)
  const titleOnlyCard = frame.singleLine

  const isBrowserBranchEvent = (event: React.DragEvent<HTMLDivElement>): boolean =>
    showBrowserBranches &&
    event.dataTransfer.types.includes(BROWSER_TAB_TREE_DRAG_TYPE) &&
    event.target instanceof Element &&
    event.target.closest('[data-worktree-card-surface]') === event.currentTarget

  const cardBody = (
    <div
      className={cn(
        WORKTREE_CARD_SURFACE_CLASS_NAME,
        'flex flex-col',
        // A bot's line is as tall as its chat's row.
        titleOnlyCard ? (card.compactLine ? 'py-px' : 'py-2') : 'pt-1.25 pb-1.5',
        flushSurface && 'w-[calc(100%-0.25rem)]',
        // Navigation updates the live attribute before React; it must own the complete active style.
        isDropTarget
          ? 'border-worktree-sidebar-foreground/40 bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground ring-1 ring-inset ring-worktree-sidebar-ring/60'
          : browserBranchDropState === 'eligible'
            ? 'outline-dashed outline-1 -outline-offset-1 outline-worktree-sidebar-ring/60'
            : browserBranchDropState !== 'ineligible' &&
              !isActiveSurface &&
              'worktree-sidebar-card-hover',
        isActiveSurface && isMultiSelected && 'ring-1 ring-worktree-sidebar-ring/35',
        revealHighlight && [
          'scroll-to-current-workspace-reveal-highlight',
          revealHighlightTone === 'ai' && 'scroll-to-current-workspace-reveal-highlight--ai'
        ],
        titleRenaming && '!border-transparent !bg-transparent !shadow-none !ring-0',
        isDeleting && 'opacity-50 grayscale cursor-not-allowed',
        // Dim disconnected runtimes only; ancestor opacity would make the SSH control’s error tint/spinner illegible.
        isRuntimeDisconnected && !isDeleting && 'opacity-60'
      )}
      data-worktree-card-surface="true"
      data-worktree-card-single-line={titleOnlyCard || undefined}
      data-worktree-card-active={
        isActiveSurface && !isDropTarget ? activeSurfaceVariant : undefined
      }
      data-worktree-card-selected={
        (isMultiSelected && !isActiveSurface && !isDropTarget) || undefined
      }
      data-worktree-lineage-drop-target={isLineageDropTarget || undefined}
      data-worktree-browser-branch-drop-state={browserBranchDropState ?? undefined}
      data-worktree-browser-branch-drop-target={isBrowserDropHovered || undefined}
      data-worktree-card-menu-open={card.detailsHoverControl.contextMenuOpen ? 'true' : undefined}
      onClick={handleClick}
      onPointerDown={affiliateListMode ? undefined : handlePointerDown}
      onPointerEnter={affiliateListMode ? undefined : handlePointerEnter}
      onPointerLeave={affiliateListMode ? undefined : handlePointerLeave}
      onDoubleClick={affiliateListMode ? undefined : handleDoubleClick}
      draggable={!affiliateListMode && nativeDragEnabled && !isDeleting && !titleRenaming}
      onDragStart={!affiliateListMode && nativeDragEnabled ? handleDragStart : undefined}
      onDragEnd={!affiliateListMode && nativeDragEnabled ? handleDragEnd : undefined}
      onDragOver={(event) => {
        if (!isBrowserBranchEvent(event)) {
          return
        }
        event.stopPropagation()
        const canDrop = canPinBrowserBranches && canDropBrowserTabTreeBranch(browserBranchTarget)
        event.dataTransfer.dropEffect = canDrop ? 'copy' : 'none'
        setBrowserBranchDropTarget(canDrop)
        if (canDrop) {
          event.preventDefault()
        }
      }}
      onDragLeave={(event) => {
        if (
          isBrowserBranchDropTarget &&
          (!(event.relatedTarget instanceof Element) ||
            event.relatedTarget.closest('[data-worktree-card-surface]') !== event.currentTarget)
        ) {
          setBrowserBranchDropTarget(false)
        }
      }}
      onDrop={(event) => {
        setBrowserBranchDropTarget(false)
        if (isBrowserBranchEvent(event)) {
          event.preventDefault()
          event.stopPropagation()
          const nodeId = event.dataTransfer.getData(BROWSER_TAB_TREE_DRAG_TYPE)
          if (canPinBrowserBranches && nodeId) {
            pinBrowserTabTreeBranch(browserBranchTarget, nodeId)
          }
          endBrowserTabTreeDrag()
        }
      }}
      aria-busy={isDeleting}
      style={cardStyle}
    >
      {isDeleting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-[11px] font-medium text-foreground shadow-sm border border-border/50">
            {!isQueuedForDeletion ? (
              <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
            ) : null}
            {deleteLabel}
          </div>
        </div>
      )}
      <div
        className={cn(
          'transition-opacity duration-200 motion-reduce:transition-none',
          browserBranchDropState === 'ineligible' && 'opacity-60'
        )}
      >
        {newCardStyle ? (
          // Mix tokens only for the parent card so awake children stay bright.
          <div data-worktree-sleeping-dim={isSleeping && !isDeleting ? '' : undefined}>
            {parentCardContent}
          </div>
        ) : (
          parentCardContent
        )}
        {showBrowserBranches ? <WorktreeCardBrowserBranches target={browserBranchTarget} /> : null}
      </div>

      {lineageChildren ? (
        <div
          className={cn('space-y-1', newCardStyle ? 'mt-1.5' : 'mt-3')}
          data-worktree-lineage-children=""
          style={lineageChildrenStyle}
        >
          {lineageChildren}
        </div>
      ) : null}
    </div>
  )

  return affiliateListMode ? (
    cardBody
  ) : (
    <WorktreeContextMenu
      worktree={worktree}
      selectedWorktrees={selectedWorktrees}
      onContextMenuSelect={handleContextMenuSelect}
      onAssignWorkspaceStatus={onAssignWorkspaceStatus}
      onOpenChange={card.detailsHoverControl.setContextMenuOpen}
    >
      {cardBody}
    </WorktreeContextMenu>
  )
}

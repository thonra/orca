import { useId, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, PinOff } from 'lucide-react'
import { toast } from 'sonner'
import { BrowserFavicon } from '@/components/browser-pane/describe-page/browser-favicon'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { sameBrowserTabTreeOwner } from '@/lib/browser/tab-tree/browser-tab-tree-model'
import { useWorkspacePinnedBrowserBranches } from '@/lib/browser/tab-tree/browser-tab-tree-projection'
import {
  activatePinnedBrowserTab,
  browserTabTreeNodeId,
  unpinBrowserTabTreeBranch,
  usePinnedBrowserTabBranches,
  type BrowserTabTreePinTarget,
  type PinnedBrowserTabBranch
} from '@/lib/browser/tab-tree/browser-tab-tree-state'

export function WorktreeCardBrowserBranches({
  target
}: {
  target: BrowserTabTreePinTarget
}): React.JSX.Element | null {
  const pins = usePinnedBrowserTabBranches(target)
  return pins.length > 0 ? <LiveBrowserBranches target={target} pins={pins} /> : null
}

function LiveBrowserBranches({
  target,
  pins
}: {
  target: BrowserTabTreePinTarget
  pins: readonly PinnedBrowserTabBranch[]
}): React.JSX.Element | null {
  const t = useTranslate()
  const branches = useWorkspacePinnedBrowserBranches(target, pins)
  if (branches.length === 0) {
    return null
  }
  return (
    <ul
      aria-label={t('browser.tabTree.pinnedBranches', 'Pinned browser tabs')}
      className="mt-1.5 border-s border-worktree-sidebar-border ps-1.5"
      data-worktree-browser-branches=""
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {branches.map((branch) => (
        <PinnedBrowserTabRow
          key={browserTabTreeNodeId(branch)}
          node={branch}
          target={target}
          onUnpin={() => unpinBrowserTabTreeBranch(target, browserTabTreeNodeId(branch))}
        />
      ))}
    </ul>
  )
}

function PinnedBrowserTabRow({
  node,
  target,
  onUnpin
}: {
  node: PinnedBrowserTabBranch
  target: BrowserTabTreePinTarget
  onUnpin?: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const [expanded, setExpanded] = useState(true)
  const childrenId = useId()
  const isGroup = node.kind === 'group'
  const hasChildren = node.children.length > 0
  const ExpansionIcon = expanded ? ChevronDown : ChevronRight
  const unpinLabel = t('browser.tabTree.unpinBranch', 'Unpin browser branch')
  const showOwner = !sameBrowserTabTreeOwner(node, target)
  const rowContent = (
    <>
      {isGroup ? (
        <Folder aria-hidden className="size-3 shrink-0" />
      ) : (
        <BrowserFavicon faviconUrl={node.faviconUrl} className="size-3" />
      )}
      <span className="truncate font-normal">{node.title}</span>
      {showOwner && node.workspaceName ? (
        <span className="min-w-0 truncate text-2xs font-normal text-muted-foreground">
          {node.workspaceName}
        </span>
      ) : null}
    </>
  )

  return (
    <li
      data-pinned-browser-page-id={isGroup ? undefined : node.pageId}
      data-pinned-browser-group-id={isGroup ? node.groupId : undefined}
    >
      <div className="group/pinned-browser-row flex min-w-0 items-center rounded-md hover:bg-worktree-sidebar-accent hover:text-worktree-sidebar-accent-foreground">
        {!isGroup && hasChildren ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost-muted"
            aria-label={
              expanded
                ? t('browser.tabTree.collapseBranch', 'Collapse {{title}}', { title: node.title })
                : t('browser.tabTree.expandBranch', 'Expand {{title}}', { title: node.title })
            }
            aria-controls={childrenId}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <ExpansionIcon aria-hidden />
          </Button>
        ) : !isGroup ? (
          <span className="w-6 shrink-0" />
        ) : null}
        {isGroup && !hasChildren ? (
          <span className="flex min-h-6 min-w-0 flex-1 items-center gap-1.5 ps-6 text-xs">
            {rowContent}
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost-inset"
            size="xs-compact"
            className="min-w-0 flex-1 justify-start"
            aria-controls={isGroup ? childrenId : undefined}
            aria-expanded={isGroup ? expanded : undefined}
            onClick={() => {
              if (isGroup) {
                setExpanded(!expanded)
              } else if (!activatePinnedBrowserTab(target, node)) {
                toast.error(t('browser.tabTree.openPinnedFailed', 'Could not open the browser tab'))
              }
            }}
          >
            {isGroup ? <ExpansionIcon aria-hidden className="size-3.5" /> : null}
            {rowContent}
          </Button>
        )}
        {onUnpin ? (
          <span className="focus-within:opacity-100 can-hover:opacity-0 group-hover/pinned-browser-row:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label={unpinLabel}
                  onClick={onUnpin}
                >
                  <PinOff aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {unpinLabel}
              </TooltipContent>
            </Tooltip>
          </span>
        ) : null}
      </div>
      {hasChildren ? (
        <ul
          id={childrenId}
          hidden={!expanded}
          className="ms-3 border-s border-worktree-sidebar-border ps-1"
        >
          {node.children.map((child) => (
            <PinnedBrowserTabRow key={browserTabTreeNodeId(child)} node={child} target={target} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

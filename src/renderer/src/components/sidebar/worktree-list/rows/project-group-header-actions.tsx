import React, { useState } from 'react'
import { Ellipsis, Plus } from 'lucide-react'
import { useLatchedOpen } from '@/app-shell/root-surfaces/use-latched-open'
import { lazyWithRetry } from '@/app-shell/startup/lazy-with-retry'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { getFolderWorkspacePathStatusDescription } from '@/lib/workspace/paths/folder-workspace-path-status'
import type { ProjectGroup } from '../../../../../../shared/project/groups/project-group-types'
import type { FolderWorkspacePathStatus } from '../../../../../../shared/folder-workspaces/folder-workspace-path-status'
import { ProjectHeaderHostTooltip } from './ProjectHeaderHostLabel'
import type { ProjectHeaderHostContext } from './project-header-host-context'
import type { ProjectGroupHeaderMenuActions } from './ProjectGroupHeaderMenuContent'
import { REPO_HEADER_ACTION_BUTTON_CLASS } from './repo-header-action-button-class'
import {
  handleRepoHeaderActionPointerDown,
  stopRepoHeaderKeyboardToggle
} from './header-event-guards'

const LazyProjectGroupHeaderMenuContent = lazyWithRetry(
  () =>
    import('./ProjectGroupHeaderMenuContent').then((module) => ({
      default: module.ProjectGroupHeaderMenuContent
    })),
  { reloadKey: 'project-group-header-menu-content' }
)

export function ProjectGroupHeaderContextMenu({
  actions,
  hostContext,
  label,
  children
}: {
  actions: ProjectGroupHeaderMenuActions | null
  hostContext: ProjectHeaderHostContext | undefined
  label: string
  children: React.JSX.Element
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const hasOpened = useLatchedOpen(open)
  const header = (
    <ProjectHeaderHostTooltip label={label} context={hostContext}>
      {actions ? <ContextMenuTrigger asChild>{children}</ContextMenuTrigger> : children}
    </ProjectHeaderHostTooltip>
  )
  if (!actions) {
    return header
  }
  return (
    <ContextMenu onOpenChange={setOpen}>
      {header}
      {hasOpened ? (
        <React.Suspense fallback={null}>
          <LazyProjectGroupHeaderMenuContent actions={actions} context />
        </React.Suspense>
      ) : null}
    </ContextMenu>
  )
}

export function ProjectGroupHeaderMenu({
  actions,
  label
}: {
  actions: ProjectGroupHeaderMenuActions
  label: string
}): React.JSX.Element {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const hasOpened = useLatchedOpen(open)
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={REPO_HEADER_ACTION_BUTTON_CLASS}
          data-repo-header-action=""
          aria-label={t(
            'auto.components.sidebar.WorktreeList.79465e9034',
            'Group actions for {{value0}}',
            { value0: label }
          )}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={stopRepoHeaderKeyboardToggle}
          onPointerDown={handleRepoHeaderActionPointerDown}
        >
          <Ellipsis className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      {hasOpened ? (
        <React.Suspense fallback={null}>
          <LazyProjectGroupHeaderMenuContent actions={actions} />
        </React.Suspense>
      ) : null}
    </DropdownMenu>
  )
}

export function ProjectGroupCreateWorkspaceButton({
  projectGroup,
  label,
  pathStatus,
  disabled,
  onCreate
}: {
  projectGroup: ProjectGroup
  label: string
  pathStatus: FolderWorkspacePathStatus | null
  disabled: boolean
  onCreate: (projectGroup: ProjectGroup) => void
}): React.JSX.Element {
  const t = useTranslate()
  const createLabel = t(
    'auto.components.sidebar.WorktreeList.bd37a57ac8',
    'Create workspace for {{value0}}',
    { value0: label }
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-repo-header-action=""
          className={cn(
            REPO_HEADER_ACTION_BUTTON_CLASS,
            disabled &&
              'cursor-not-allowed text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground/60'
          )}
          aria-label={createLabel}
          aria-disabled={disabled}
          onKeyDown={stopRepoHeaderKeyboardToggle}
          onPointerDown={handleRepoHeaderActionPointerDown}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (disabled) {
              return
            }
            onCreate(projectGroup)
          }}
        >
          <Plus className="size-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {pathStatus?.exists === false
          ? getFolderWorkspacePathStatusDescription(pathStatus, t)
          : createLabel}
      </TooltipContent>
    </Tooltip>
  )
}

import React from 'react'
import { Ellipsis, FolderOpen, Pencil, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { getFolderWorkspacePathStatusDescription } from '@/lib/workspace/paths/folder-workspace-path-status'
import { getProjectGroupDefaultWorkingDirectory } from '../../../../../../shared/project/groups/project-groups'
import type { ProjectGroup } from '../../../../../../shared/project/groups/project-group-types'
import type { FolderWorkspacePathStatus } from '../../../../../../shared/folder-workspaces/folder-workspace-path-status'
import {
  getRepoExecutionHostId,
  type ExecutionHostId
} from '../../../../../../shared/execution-host/execution-host'
import { ProjectHeaderHostTooltip } from './ProjectHeaderHostLabel'
import type { ProjectHeaderHostContext } from './project-header-host-context'
import { getFolderProjectGroupRefreshHandler } from './project-group-folder-refresh'
import { REPO_HEADER_ACTION_BUTTON_CLASS } from './repo-header-action-button-class'
import {
  handleRepoHeaderActionPointerDown,
  stopRepoHeaderKeyboardToggle,
  stopRepoHeaderMenuEvent
} from './header-event-guards'

type ProjectGroupHeaderMenuActions = {
  group: ProjectGroup
  onRefresh?: (group: ProjectGroup) => void
  onEdit: (group: ProjectGroup, focusWorkingDirectory?: boolean) => void
  onDelete: (groupId: string, groupName: string, hostId?: ExecutionHostId) => void
}

function ProjectGroupHeaderMenuItems({
  actions,
  context = false
}: {
  actions: ProjectGroupHeaderMenuActions
  context?: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const { group, onEdit, onDelete } = actions
  const MenuItem = context ? ContextMenuItem : DropdownMenuItem
  const onRefresh = getFolderProjectGroupRefreshHandler(group, actions.onRefresh)
  return (
    <>
      {onRefresh ? (
        <MenuItem onSelect={onRefresh}>
          <RefreshCw className="size-3.5" />
          {t('auto.components.sidebar.WorktreeList.refreshProjectGroup', 'Refresh projects')}
        </MenuItem>
      ) : null}
      <MenuItem onSelect={() => onEdit(group)}>
        <Pencil className="size-3.5" />
        {t('auto.components.sidebar.WorktreeList.editProjectGroup', 'Edit Group…')}
      </MenuItem>
      {!getProjectGroupDefaultWorkingDirectory(group) ? (
        <MenuItem onSelect={() => onEdit(group, true)}>
          <FolderOpen className="size-3.5" />
          {t(
            'auto.components.sidebar.WorktreeList.setProjectGroupWorkingDirectory',
            'Set working directory…'
          )}
        </MenuItem>
      ) : null}
      <MenuItem
        variant="destructive"
        onSelect={() => onDelete(group.id, group.name, getRepoExecutionHostId(group))}
      >
        {t('auto.components.sidebar.WorktreeList.902115cdbe', 'Delete group')}
      </MenuItem>
    </>
  )
}

// Menu portals still bubble through the header, where the same events can drag or collapse it.
const MENU_EVENT_GUARDS = {
  onPointerDown: stopRepoHeaderMenuEvent,
  onMouseDown: stopRepoHeaderMenuEvent,
  onPointerUp: stopRepoHeaderMenuEvent,
  onMouseUp: stopRepoHeaderMenuEvent,
  onClick: stopRepoHeaderMenuEvent,
  onKeyDown: stopRepoHeaderMenuEvent
}

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
  const header = (
    <ProjectHeaderHostTooltip label={label} context={hostContext}>
      {actions ? <ContextMenuTrigger asChild>{children}</ContextMenuTrigger> : children}
    </ProjectHeaderHostTooltip>
  )
  if (!actions) {
    return header
  }
  return (
    <ContextMenu>
      {header}
      <ContextMenuContent {...MENU_EVENT_GUARDS}>
        <ProjectGroupHeaderMenuItems actions={actions} context />
      </ContextMenuContent>
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
  return (
    <DropdownMenu modal={false}>
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
      <DropdownMenuContent align="end" side="bottom" sideOffset={6} {...MENU_EVENT_GUARDS}>
        <ProjectGroupHeaderMenuItems actions={actions} />
      </DropdownMenuContent>
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

import React from 'react'
import { FolderOpen, Pencil, RefreshCw } from 'lucide-react'
import { ContextMenuContent, ContextMenuItem } from '@/components/ui/context-menu'
import { DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useTranslate } from '@/i18n/use-translate'
import { getProjectGroupDefaultWorkingDirectory } from '../../../../../../shared/project/groups/project-groups'
import type { ProjectGroup } from '../../../../../../shared/project/groups/project-group-types'
import {
  getRepoExecutionHostId,
  type ExecutionHostId
} from '../../../../../../shared/execution-host/execution-host'
import { getFolderProjectGroupRefreshHandler } from './project-group-folder-refresh'
import { stopRepoHeaderMenuEvent } from './header-event-guards'

export type ProjectGroupHeaderMenuActions = {
  group: ProjectGroup
  onRefresh?: (group: ProjectGroup) => void
  onEdit: (group: ProjectGroup, focusWorkingDirectory?: boolean) => void
  onDelete: (groupId: string, groupName: string, hostId?: ExecutionHostId) => void
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

export function ProjectGroupHeaderMenuContent({
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
  const items = (
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
  return context ? (
    <ContextMenuContent {...MENU_EVENT_GUARDS}>{items}</ContextMenuContent>
  ) : (
    <DropdownMenuContent align="end" side="bottom" sideOffset={6} {...MENU_EVENT_GUARDS}>
      {items}
    </DropdownMenuContent>
  )
}

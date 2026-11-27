import type React from 'react'
import { useState } from 'react'
import { FolderTree } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import { isWebClientLocation } from '@/app-shell/platform/web-client-location'
import { resolveVisibleWorkspaceHostIds } from '../../../../../shared/workspace-view/workspace-host-visibility'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '../../../../../shared/execution-host/execution-host'
import { ProjectGroupNameDialog } from '../worktree-list/rows/ProjectGroupNameDialog'

export function NewProjectGroupButton(): React.JSX.Element {
  const t = useTranslate()
  const [hostId, setHostId] = useState<ExecutionHostId | null>(null)
  const isWebClient = isWebClientLocation()
  const pairedEnvironmentId = useAppStore((s) =>
    isWebClient ? s.runtimeEnvironments[0]?.id : undefined
  )
  const label = t('auto.components.sidebar.SidebarHeader.newGroup', 'New Group…')

  const openDialog = (): void => {
    if (isWebClient) {
      if (pairedEnvironmentId) {
        setHostId(toRuntimeExecutionHostId(pairedEnvironmentId))
      }
      return
    }
    const state = useAppStore.getState()
    const shown = resolveVisibleWorkspaceHostIds(
      state.visibleWorkspaceHostIds,
      state.workspaceHostScope
    )
    const scopedHost = shown?.length === 1 ? shown[0] : undefined
    setHostId(
      scopedHost && parseExecutionHostId(scopedHost)?.kind === 'runtime'
        ? scopedHost
        : LOCAL_EXECUTION_HOST_ID
    )
  }

  const createGroup = async (
    name: string,
    defaultWorkingDirectory: string | null
  ): Promise<void> => {
    if (!hostId) {
      return
    }
    const group = await useAppStore
      .getState()
      .createProjectGroup(name, hostId, defaultWorkingDirectory ?? undefined, {
        throwOnError: true
      })
    if (!group) {
      throw new Error('project_group_save_unconfirmed')
    }
    const state = useAppStore.getState()
    const shown = resolveVisibleWorkspaceHostIds(
      state.visibleWorkspaceHostIds,
      state.workspaceHostScope
    )
    const groupHost = getRepoExecutionHostId(group)
    if (shown && !shown.includes(groupHost)) {
      state.setVisibleWorkspaceHostIds([...shown, groupHost])
    }
    if (state.groupBy !== 'repo') {
      state.setGroupBy('repo')
    }
    if (state.sidebarBody === 'agents') {
      state.setSidebarBody('workspaces')
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            className="text-muted-foreground"
            aria-label={label}
            data-workspace-board-preserve-open=""
            disabled={isWebClient && !pairedEnvironmentId}
            onClick={openDialog}
          >
            <FolderTree className="size-3.5" strokeWidth={2.25} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
      {hostId ? (
        <ProjectGroupNameDialog
          open
          title={t('auto.components.sidebar.ProjectGroupNameDialog.newGroupTitle', 'New Group')}
          description={t(
            'auto.components.sidebar.ProjectGroupNameDialog.newGroupDescription',
            'You can add projects after creating the group.'
          )}
          initialName=""
          workingDirectory={{ initialPath: '', hostId }}
          confirmLabel={t('auto.components.sidebar.ProjectGroupNameDialog.create', 'Create')}
          onOpenChange={(open) => {
            if (!open) {
              setHostId(null)
            }
          }}
          onSubmit={createGroup}
        />
      ) : null}
    </>
  )
}

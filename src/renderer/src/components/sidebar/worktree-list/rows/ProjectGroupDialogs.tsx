import React from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host/execution-host'
import { getProjectGroupDefaultWorkingDirectory } from '../../../../../../shared/project/groups/project-groups'
import { findRepoForHost } from '@/store/repos/repo-host-identity'
import type { AppState } from '@/store/types'
import type { Repo } from '../../../../../../shared/repository/repo-types'
import { ProjectGroupNameDialog } from './ProjectGroupNameDialog'
import { ProjectGroupDeleteDialog } from './ProjectGroupDeleteDialog'
import SuppressExternalWorktreeInboxDialog from '../listing/SuppressExternalWorktreeInboxDialog'
import type { NewExternalWorktreesInboxActionState } from '../listing/new-external-worktrees-inbox-actions'
import type { ProjectGroupDialogs } from './use-project-group-dialogs'

export function SidebarWorktreeListDialogs({
  dialogs,
  repos,
  settings,
  suppressExternalWorktreeInboxRepoId,
  setSuppressExternalWorktreeInboxRepoId,
  newExternalWorktreeInboxActionState,
  onConfirmSuppressExternalWorktreeInbox,
  onOpenWorktreeVisibility
}: {
  dialogs: ProjectGroupDialogs
  repos: readonly Repo[]
  settings: AppState['settings']
  suppressExternalWorktreeInboxRepoId: string | null
  setSuppressExternalWorktreeInboxRepoId: (repoId: string | null) => void
  newExternalWorktreeInboxActionState: ReadonlyMap<string, NewExternalWorktreesInboxActionState>
  onConfirmSuppressExternalWorktreeInbox: () => void
  onOpenWorktreeVisibility: (repo: Repo) => void
}): React.JSX.Element {
  const t = useTranslate()
  const { nameDialog, setNameDialog, deleteDialog, setDeleteDialog } = dialogs
  const editDialog = nameDialog?.type === 'edit' ? nameDialog : null
  return (
    <>
      {nameDialog ? (
        <ProjectGroupNameDialog
          open
          title={
            editDialog
              ? t('auto.components.sidebar.ProjectGroupNameDialog.editTitle', 'Edit Group')
              : t('auto.components.sidebar.WorktreeList.13757c053c', 'New Project Group')
          }
          description={
            nameDialog.type === 'edit'
              ? undefined
              : t(
                  'auto.components.sidebar.WorktreeList.d880ea0744',
                  'Create a group and move this project into it.'
                )
          }
          initialName={
            nameDialog.type === 'edit'
              ? nameDialog.group.name
              : t(
                  'auto.components.sidebar.ProjectGroupNameDialog.defaultGroupName',
                  '{{name}} group',
                  { name: nameDialog.repo.displayName }
                )
          }
          workingDirectory={
            editDialog
              ? {
                  initialPath: getProjectGroupDefaultWorkingDirectory(editDialog.group) ?? '',
                  hostId: getRepoExecutionHostId(editDialog.group),
                  focus: editDialog.focusWorkingDirectory
                }
              : undefined
          }
          confirmLabel={
            editDialog
              ? t('auto.components.sidebar.ProjectGroupNameDialog.save', 'Save')
              : t('auto.components.sidebar.ProjectGroupNameDialog.create', 'Create')
          }
          onOpenChange={(open) => {
            if (!open) {
              setNameDialog(null)
            }
          }}
          onSubmit={dialogs.handleSubmitProjectGroupName}
        />
      ) : null}
      <SuppressExternalWorktreeInboxDialog
        open={suppressExternalWorktreeInboxRepoId !== null}
        repoDisplayName={
          suppressExternalWorktreeInboxRepoId
            ? (repos.find((repo) => repo.id === suppressExternalWorktreeInboxRepoId)?.displayName ??
              '')
            : ''
        }
        pending={
          suppressExternalWorktreeInboxRepoId
            ? (newExternalWorktreeInboxActionState.get(suppressExternalWorktreeInboxRepoId)
                ?.pending ?? false)
            : false
        }
        onOpenChange={(open) => {
          if (!open) {
            setSuppressExternalWorktreeInboxRepoId(null)
          }
        }}
        onConfirm={onConfirmSuppressExternalWorktreeInbox}
        onOpenRecovery={() => {
          if (!suppressExternalWorktreeInboxRepoId) {
            return
          }
          const repo = findRepoForHost(repos, suppressExternalWorktreeInboxRepoId, { settings })
          setSuppressExternalWorktreeInboxRepoId(null)
          if (repo) {
            onOpenWorktreeVisibility(repo)
          }
        }}
      />
      <ProjectGroupDeleteDialog
        open={deleteDialog !== null}
        groupName={deleteDialog?.groupName ?? ''}
        projectCount={dialogs.deleteProjectCount}
        projectNames={dialogs.deleteProjectNames}
        removeContainedProjects={dialogs.removeContainedProjects}
        onRemoveContainedProjectsChange={(removeContainedProjects) => {
          setDeleteDialog((current) =>
            current ? { ...current, removeContainedProjects } : current
          )
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialog(null)
          }
        }}
        onConfirm={dialogs.handleConfirmDeleteProjectGroup}
        unsavedTargets={dialogs.deleteUnsavedTargets}
      />
    </>
  )
}

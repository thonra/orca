import { getNextRootProjectOrder } from '../../../../shared/sidebar-list/sections/root-project-order'
import type {
  ProjectGroup,
  ProjectGroupMutation
} from '../../../../shared/project/groups/project-group-types'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { RepoSlice } from '../repos/repo-state'
import {
  PROJECT_GROUP_DEFAULT_WORKING_DIRECTORY_RUNTIME_CAPABILITY,
  PROJECT_GROUP_UPDATE_MANY_RUNTIME_CAPABILITY,
  PROJECT_ROOT_ORDER_RUNTIME_CAPABILITY
} from '../../../../shared/project/groups/project-group-order-capability'
import { runtimeEnvironmentSupportsCapability } from '@/runtime/rpc/compatibility/runtime-capability-proof'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'

import type { RuntimeStatus } from '../../../../shared/remote-runtime/session-graph/runtime-session-contracts'

export function projectGroupMutationRpcOptions<T>(params: T, changesWorkingDirectory: boolean) {
  return {
    timeoutMs: 15_000,
    // Older hosts ignore unknown update fields. Check support before sending the mutation.
    paramsForStatus: changesWorkingDirectory
      ? (status: RuntimeStatus | null) => {
          if (
            !status?.capabilities?.includes(
              PROJECT_GROUP_DEFAULT_WORKING_DIRECTORY_RUNTIME_CAPABILITY
            )
          ) {
            throw new Error('project_group_default_working_directory_unsupported')
          }
          return params
        }
      : undefined
  }
}

function groupMatchesUpdate(
  group: ProjectGroup,
  updates: ProjectGroupMutation['updates']
): boolean {
  return (
    (updates.rootProjectOrder === undefined ||
      (group.rootProjectOrder ?? null) === updates.rootProjectOrder) &&
    (updates.tabOrder === undefined || group.tabOrder === updates.tabOrder) &&
    (updates.defaultWorkingDirectory === undefined ||
      group.defaultWorkingDirectory === updates.defaultWorkingDirectory)
  )
}

export async function persistProjectGroupUpdate(
  target: RuntimeClientTarget,
  groupId: string,
  updates: Parameters<RepoSlice['updateProjectGroup']>[1]
): Promise<ProjectGroup | null> {
  if (
    updates.rootProjectOrder !== undefined &&
    target.kind === 'environment' &&
    !(await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      PROJECT_ROOT_ORDER_RUNTIME_CAPABILITY
    ))
  ) {
    return null
  }
  const args = { groupId, updates }
  const updated =
    target.kind === 'local'
      ? await window.api.projectGroups.update(args)
      : (
          await callRuntimeRpc<{ group: ProjectGroup | null }>(
            target,
            'projectGroup.update',
            args,
            projectGroupMutationRpcOptions(args, updates.defaultWorkingDirectory !== undefined)
          )
        ).group
  if (!updated || !groupMatchesUpdate(updated, updates)) {
    return null
  }
  return updated
}

export async function persistProjectGroupUpdates(
  target: RuntimeClientTarget,
  mutations: readonly ProjectGroupMutation[],
  throwOnError = false
): Promise<(ProjectGroup | null)[]> {
  if (mutations.length === 0) {
    return []
  }
  if (
    mutations.length === 1 ||
    (target.kind === 'environment' &&
      !(await runtimeEnvironmentSupportsCapability(
        target.environmentId,
        PROJECT_GROUP_UPDATE_MANY_RUNTIME_CAPABILITY
      )))
  ) {
    return Promise.all(
      mutations.map(({ groupId, updates }) =>
        persistProjectGroupUpdate(target, groupId, updates).catch((err) => {
          if (throwOnError) {
            throw err
          }
          console.error('Failed to update project group:', err)
          return null
        })
      )
    )
  }
  if (
    target.kind === 'environment' &&
    mutations.some(({ updates }) => updates.rootProjectOrder !== undefined) &&
    !(await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      PROJECT_ROOT_ORDER_RUNTIME_CAPABILITY
    ))
  ) {
    return mutations.map(() => null)
  }
  const args = { mutations }
  const updated =
    target.kind === 'local'
      ? await window.api.projectGroups.updateMany(args)
      : (
          await callRuntimeRpc<{ groups: ProjectGroup[] | null }>(
            target,
            'projectGroup.updateMany',
            args,
            projectGroupMutationRpcOptions(
              args,
              mutations.some(({ updates }) => updates.defaultWorkingDirectory !== undefined)
            )
          )
        ).groups
  const byId = new Map(updated?.map((group) => [group.id, group]))
  return mutations.map(({ groupId, updates }) => {
    const group = byId.get(groupId)
    return group && groupMatchesUpdate(group, updates) ? group : null
  })
}

export async function initializeNewRootProjectGroupOrder(
  target: RuntimeClientTarget,
  group: ProjectGroup,
  state: Pick<RepoSlice, 'repos' | 'projectGroups'>
): Promise<ProjectGroup> {
  const rootProjectOrder = !group.parentGroupId
    ? getNextRootProjectOrder(state.repos, state.projectGroups)
    : undefined
  if (rootProjectOrder === undefined) {
    return group
  }
  const groupIds = new Set(state.projectGroups.map((entry) => entry.id))
  let tabOrder = -1000
  for (const existing of state.projectGroups) {
    if (!existing.parentGroupId || !groupIds.has(existing.parentGroupId)) {
      tabOrder = Math.max(tabOrder, existing.tabOrder)
    }
  }
  return (
    (await persistProjectGroupUpdate(target, group.id, {
      rootProjectOrder,
      tabOrder: tabOrder + 1000
    }).catch((err) => {
      console.error('Failed to initialize project group order:', err)
      return null
    })) ?? group
  )
}

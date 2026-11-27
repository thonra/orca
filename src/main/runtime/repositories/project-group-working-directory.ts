import { isAbsolute } from 'node:path'
import { getProjectGroupDefaultWorkingDirectory } from '../../../shared/project/groups/project-groups'
import type { ProjectGroup } from '../../../shared/project/groups/project-group-types'
import {
  assertFolderWorkspacePathUsable,
  getFolderWorkspacePathStatusForPath
} from '../../project-groups/folder-workspace-path-status'
import type { RuntimeStore } from '../construction/runtime-store-contract'
import { refuseWslHostWindowsDrivePath } from '../terminal/launch/wsl-host-windows-drive-guard'

export async function assertProjectGroupWorkingDirectoryUsable(
  store: RuntimeStore,
  folderPath: string,
  connectionId?: string | null,
  group?: ProjectGroup
): Promise<void> {
  if (folderPath === getProjectGroupDefaultWorkingDirectory(group)) {
    return
  }
  if (!isAbsolute(folderPath)) {
    throw new Error('project_group_working_directory_must_be_absolute')
  }
  await refuseWslHostWindowsDrivePath(folderPath)
  assertFolderWorkspacePathUsable(
    await getFolderWorkspacePathStatusForPath({
      folderPath,
      projectGroupId: group?.id,
      connectionId,
      projectGroups: store.getProjectGroups?.() ?? [],
      repos: store.getRepos()
    })
  )
}

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { closeTestStores, createStore, testState } from '../persistence-test-harness'

it('persists the group default without moving the import root or existing folder workspaces', async () => {
  testState.dir = mkdtempSync(join(tmpdir(), 'orca-group-default-directory-'))
  try {
    const importRoot = join(testState.dir, 'imported')
    const nextDefault = join(testState.dir, 'coordination')
    const store = createStore()
    const group = store.createProjectGroup({
      name: 'Projects',
      parentPath: importRoot,
      createdFrom: 'folder-scan'
    })
    const firstWorkspace = store.createFolderWorkspace({ projectGroupId: group.id })
    store.updateProjectGroup(group.id, { defaultWorkingDirectory: nextDefault })
    await store.flushPendingOrThrowAsync()
    await closeTestStores()

    const reloadedStore = createStore()
    const secondWorkspace = reloadedStore.createFolderWorkspace({ projectGroupId: group.id })
    expect(secondWorkspace.folderPath).toBe(nextDefault)
    reloadedStore.updateProjectGroup(group.id, { defaultWorkingDirectory: null })
    await reloadedStore.flushPendingOrThrowAsync()
    await closeTestStores()

    const clearedStore = createStore()
    expect(clearedStore.getProjectGroup(group.id)).toMatchObject({
      parentPath: importRoot,
      defaultWorkingDirectory: null
    })
    expect(clearedStore.getFolderWorkspace(firstWorkspace.id)?.folderPath).toBe(importRoot)
    expect(clearedStore.getFolderWorkspace(secondWorkspace.id)?.folderPath).toBe(nextDefault)
    expect(() => clearedStore.createFolderWorkspace({ projectGroupId: group.id })).toThrow(
      'Folder-backed project group not found.'
    )
  } finally {
    await closeTestStores()
    rmSync(testState.dir, { recursive: true, force: true })
  }
})

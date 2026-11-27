import React, { useCallback, useId, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { runWithFinally } from '@/lib/run-with-finally'
import { useTranslate } from '@/i18n/use-translate'
import { isPairedWebClientWindow } from '@/app-shell/chrome/desktop-window-chrome'
import { getFolderWorkspacePathErrorCopy } from '@/lib/workspace/paths/folder-workspace-path-status'
import { selectExecutionHostDisplayLabel } from '@/runtime/hosts/display/execution-host-display-label'
import { useAppStore } from '@/store'
import {
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../../../../shared/execution-host/execution-host'

type ProjectGroupNameDialogProps = {
  open: boolean
  title: string
  description?: string
  initialName: string
  confirmLabel: string
  workingDirectory?: { initialPath: string; hostId: ExecutionHostId; focus?: boolean }
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string, defaultWorkingDirectory: string | null) => Promise<void> | void
}

export function ProjectGroupNameDialog({
  open,
  title,
  description,
  initialName,
  confirmLabel,
  workingDirectory,
  onOpenChange,
  onSubmit
}: ProjectGroupNameDialogProps): React.JSX.Element {
  const t = useTranslate()
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const directoryRef = useRef<HTMLInputElement>(null)
  const directoryId = useId()
  const directoryHintId = useId()
  const errorId = useId()
  const [directory, setDirectory] = useState(workingDirectory?.initialPath ?? '')
  const [error, setError] = useState<{ text: string; field?: 'directory' } | null>(null)
  const canBrowse =
    workingDirectory?.hostId === LOCAL_EXECUTION_HOST_ID && !isPairedWebClientWindow()
  const hostLabel = useAppStore((state) =>
    workingDirectory && workingDirectory.hostId !== LOCAL_EXECUTION_HOST_ID
      ? selectExecutionHostDisplayLabel(state, workingDirectory.hostId, { t })
      : null
  )
  const [name, setName] = useState(initialName)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [previousOpenState, setPreviousOpenState] = useState({ open, initialName })
  const contentRef = useRef<HTMLDivElement | null>(null)
  const trimmedName = name.trim()

  const handleDialogContentRef = useCallback((node: HTMLDivElement | null): void => {
    // Track content attachment so late saves cannot update closed dialog state.
    contentRef.current = node
  }, [])

  // Seed before paint so selection sees the current name instead of the prior draft.
  if (open !== previousOpenState.open || initialName !== previousOpenState.initialName) {
    setPreviousOpenState({ open, initialName })
    if (open) {
      // Preserve edited drafts when the localized suggestion changes.
      if (!previousOpenState.open || name === previousOpenState.initialName) {
        setName(initialName)
      }
      if (!previousOpenState.open) {
        setSubmitting(false)
        setError(null)
        setDirectory(workingDirectory?.initialPath ?? '')
      }
    }
  }

  const handleBrowse = async (): Promise<void> => {
    const content = contentRef.current
    try {
      const path = await window.api.shell.pickDirectory({ defaultPath: directory || undefined })
      if (path && contentRef.current === content) {
        setDirectory(path)
        setError(null)
      }
    } catch (err) {
      console.error('Failed to pick project group working directory:', err)
      if (contentRef.current === content) {
        setError({
          text: t(
            'auto.components.sidebar.ProjectGroupNameDialog.pickFailed',
            'Could not open the folder picker.'
          ),
          field: 'directory'
        })
      }
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!trimmedName || submittingRef.current) {
      return
    }
    const content = contentRef.current
    submittingRef.current = true
    setSubmitting(true)
    setError(null)
    await runWithFinally(
      async () => {
        try {
          await onSubmit(trimmedName, directory.trim() || null)
          if (contentRef.current === content) {
            onOpenChange(false)
          }
        } catch (err) {
          console.error('Failed to save project group:', err)
          if (contentRef.current !== content) {
            return
          }
          const message = err instanceof Error ? err.message : ''
          const folderError = getFolderWorkspacePathErrorCopy(message)
          if (message.includes('project_group_default_working_directory_unsupported')) {
            setError({
              text: t(
                'auto.components.sidebar.ProjectGroupNameDialog.cwdUnsupported',
                'Update the Orca host to set a default working directory.'
              ),
              field: 'directory'
            })
          } else if (message.includes('project_group_working_directory_must_be_absolute')) {
            setError({
              text: t(
                'auto.components.sidebar.ProjectGroupNameDialog.cwdAbsolute',
                'Enter an absolute folder path.'
              ),
              field: 'directory'
            })
          } else if (folderError) {
            setError({ text: folderError.title, field: 'directory' })
          } else {
            setError({
              text: t(
                'auto.components.sidebar.ProjectGroupNameDialog.saveFailed',
                'Orca could not confirm that the group was saved. Check the group and try again.'
              )
            })
          }
          setSubmitting(false)
        }
      },
      () => {
        submittingRef.current = false
      }
    )
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (nextOpen || !submittingRef.current) {
      onOpenChange(nextOpen)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={handleDialogContentRef}
        busy={submitting}
        className="max-w-sm sm:max-w-sm"
        {...(description ? {} : { 'aria-describedby': undefined })}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const field = workingDirectory?.focus ? directoryRef : inputRef
          field.current?.focus()
          field.current?.select()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-xs">{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <Label htmlFor={inputId} variant="settings">
              {t('auto.components.sidebar.ProjectGroupNameDialog.83dfbc5313', 'Group Name')}
            </Label>
            <Input
              id={inputId}
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              density="compact"
              className="h-8"
              aria-required="true"
              disabled={submitting}
            />
          </div>
          {workingDirectory ? (
            <div className="space-y-1">
              <Label htmlFor={directoryId} variant="settings">
                {t(
                  'auto.components.sidebar.ProjectGroupNameDialog.defaultWorkingDirectory',
                  'Default working directory'
                )}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={directoryId}
                  ref={directoryRef}
                  value={directory}
                  onChange={(event) => {
                    setDirectory(event.target.value)
                    setError(null)
                  }}
                  variant="code"
                  className="h-8"
                  spellCheck={false}
                  disabled={submitting}
                  aria-invalid={error?.field === 'directory' || undefined}
                  aria-describedby={
                    error?.field === 'directory' ? `${directoryHintId} ${errorId}` : directoryHintId
                  }
                />
                {canBrowse ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleBrowse()}
                    disabled={submitting}
                  >
                    {t('auto.components.sidebar.ProjectGroupNameDialog.browse', 'Browse…')}
                  </Button>
                ) : null}
              </div>
              <p id={directoryHintId} className="text-xs text-muted-foreground">
                {hostLabel
                  ? t(
                      'auto.components.sidebar.ProjectGroupNameDialog.cwdRemoteHint',
                      'Optional. Used by new Folder Workspaces on {{host}}.',
                      { host: hostLabel }
                    )
                  : t(
                      'auto.components.sidebar.ProjectGroupNameDialog.cwdHint',
                      'Optional. Used by new Folder Workspaces in this group.'
                    )}
              </p>
            </div>
          ) : null}
          {error ? (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {error.text}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              {t('auto.components.sidebar.ProjectGroupNameDialog.d99a034073', 'Cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs"
              disabled={!trimmedName || submitting}
            >
              {submitting
                ? t('auto.components.sidebar.ProjectGroupNameDialog.4a64e78822', 'Saving...')
                : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

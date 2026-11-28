import { useId, useState } from 'react'
import { Ellipsis, FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import {
  createBrowserTabTreeGroup,
  removeBrowserTabTreeGroup,
  renameBrowserTabTreeGroup
} from '@/lib/browser/tab-tree/browser-tab-tree-state'

const GROUP_POPOVER_CLASS = 'w-72 max-w-(--radix-popover-content-available-width)'

export function NewBrowserTabTreeGroupButton({
  disabled
}: {
  disabled: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const label = t('browser.tabTree.newGroup', 'New group')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost-muted" size="toolbar" disabled={disabled}>
          <FolderPlus aria-hidden="true" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={label} align="end" sideOffset={6} className={GROUP_POPOVER_CLASS}>
        <BrowserTabTreeGroupForm
          initialTitle=""
          submitLabel={t('browser.tabTree.createGroup', 'Create group')}
          save={createBrowserTabTreeGroup}
          close={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

export function BrowserTabTreeGroupActions({
  groupId,
  title
}: {
  groupId: string
  title: string
}): React.JSX.Element {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const actionLabel = t('browser.tabTree.editGroup', 'Edit {{title}}', { title })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost-muted" size="icon-xs" aria-label={actionLabel}>
              <Ellipsis aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {actionLabel}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        aria-label={actionLabel}
        align="end"
        sideOffset={6}
        className={GROUP_POPOVER_CLASS}
      >
        <BrowserTabTreeGroupForm
          initialTitle={title}
          submitLabel={t('browser.tabTree.saveGroup', 'Save')}
          save={(name) => renameBrowserTabTreeGroup(groupId, name)}
          remove={() => removeBrowserTabTreeGroup(groupId)}
          close={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

function BrowserTabTreeGroupForm({
  initialTitle,
  submitLabel,
  save,
  remove,
  close
}: {
  initialTitle: string
  submitLabel: string
  save: (title: string) => boolean
  remove?: () => boolean
  close: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const fieldId = useId()
  const [title, setTitle] = useState(initialTitle)
  const [failed, setFailed] = useState(false)

  return (
    <form
      className="space-y-3 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (save(title.trim())) {
          close()
        } else {
          setFailed(true)
        }
      }}
    >
      <div className="space-y-2">
        <Label variant="settings" htmlFor={fieldId}>
          {t('browser.tabTree.groupName', 'Group name')}
        </Label>
        <Input
          id={fieldId}
          density="compact"
          surface="background"
          focusFeedback="border"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            setFailed(false)
          }}
        />
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-destructive">
          {t('browser.tabTree.groupUpdateFailed', 'Could not update the tab group')}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {remove ? (
          <Button
            type="button"
            variant="ghost-muted"
            size="xs"
            onClick={() => {
              if (remove()) {
                close()
              } else {
                setFailed(true)
              }
            }}
          >
            {t('browser.tabTree.removeGroup', 'Remove group')}
          </Button>
        ) : null}
        <div className="ms-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="xs" onClick={close}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" size="xs" disabled={!title.trim()}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}

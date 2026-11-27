import { AlertCircle, Loader2 } from 'lucide-react'
import type { Translate } from '@/i18n/use-translate'
import type { AntigravityAccountState } from '../../../../../../shared/agent-accounts/antigravity/antigravity-account-types'

/** Why every account control is off while a switch waits for chats; absent otherwise. */
export function antigravitySwitchLock(
  t: Translate,
  state: AntigravityAccountState | null
): string | undefined {
  return state?.switching
    ? t('accounts.antigravity.waitingForSwitch', 'Waiting for the account switch to finish')
    : undefined
}

/** A switch to this account still waiting for chats' agy to exit, or why it didn't happen. */
export function antigravitySwitchDetail(
  t: Translate,
  state: AntigravityAccountState | null,
  accountId: string
): React.ReactNode {
  const { switching, switchFailed } = state ?? {}
  if (switching?.accountId === accountId) {
    const count = switching.waitingForChats
    return (
      <span className="flex items-center gap-1.5">
        <Loader2 className="size-3 shrink-0 animate-spin" />
        {count > 0
          ? t(
              'accounts.antigravity.switchingAfterChats',
              'Switching after {{count}} chats finish…',
              { count, defaultValue_one: 'Switching after {{count}} chat finishes…' }
            )
          : t('accounts.antigravity.switching', 'Switching…')}
      </span>
    )
  }
  return switchFailed?.accountId === accountId ? (
    <AntigravityActionError message={switchFailed.message} />
  ) : null
}

export function AntigravityActionError({ message }: { message: string }): React.JSX.Element {
  return (
    <span role="alert" className="flex items-center gap-1.5 text-destructive">
      <AlertCircle className="size-3.5 shrink-0" />
      {message}
    </span>
  )
}

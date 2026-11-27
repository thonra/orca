import { intlLocaleFor } from '../../i18n/ui-intl-locale'
import { ChevronRight } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type {
  MobileAutomationRow,
  MobileAutomationRun
} from '../../automations/automation-reply-schema'
import { automationNextRunLabel } from '../../automations/automation-next-run-label'
import {
  automationDate,
  automationRunErrorText,
  automationRunStatusLabel,
  runMatchesOutcome
} from '../../automations/automation-run-presentation'
import { formatAutomationSchedule } from '../../automations/automation-schedule-label'
import { AgentSpinner } from '../../agents/presentation/AgentSpinner'
import { MobileSwitch } from '../../components/controls/MobileSwitch'
import { useMobileTranslation, useMobileUiLocale } from '../../i18n/use-mobile-translation'
import { mobileTuiAgentLabel } from '../../agents/mobile-tui-agents'
import type { MobilePalette } from '../../theme/mobile-theme'
import { themedStyleSheet, useThemedStyles } from '../../theme/themed-styles'
import { useMobileColors } from '../../theme/use-mobile-color-scheme'
import { formatTimeAgo } from '../../worktree/agent-lineage/agent-row-display'
import { homeListStylesSheet } from '../home-list-styles'

/** A scheduled automation: tap opens the page, the switch pauses or resumes it. */
export function MobileHomeAutomationRow(props: {
  row: MobileAutomationRow
  enabled: boolean
  disabled: boolean
  onToggle: (enabled: boolean) => void
  onOpen: () => void
}) {
  const list = useThemedStyles(homeListStylesSheet)
  const t = useMobileTranslation()
  const intlLocale = intlLocaleFor(useMobileUiLocale())
  const colors = useMobileColors()
  const styles = useThemedStyles(stylesSheet)
  const [pressed, setPressed] = useState(false)
  const { automation, item } = props.row
  const subtitle = `${formatAutomationSchedule(automation.rrule, t, intlLocale)} · ${mobileTuiAgentLabel(automation.agentId)}`
  const next = automationNextRunLabel(automation, t, intlLocale)
  const lastStatus = item.usageSummary?.lastRunStatus
  const last = lastStatus
    ? t('home.automationsTab.lastStatus', 'Last: {{status}}', {
        status: automationRunStatusLabel(lastStatus, t)
      })
    : automation.enabled
      ? null
      : t('home.automationsTab.paused', 'Paused')
  const lastDate = lastStatus ? automationDate(item.usageSummary?.lastRunAt, t, intlLocale) : null
  return (
    // Siblings, not nested, so screen readers reach the switch apart from the row.
    <View style={[list.row, pressed && list.rowPressed]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[automation.name, subtitle, next, last, lastDate]
          .filter(Boolean)
          .join(', ')}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={props.onOpen}
        style={list.text}
      >
        <Text style={list.title} numberOfLines={1}>
          {automation.name}
        </Text>
        <Text style={list.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {next}
        </Text>
        {last ? (
          <Text style={styles.meta} numberOfLines={1}>
            <Text style={lastStatus ? { color: runStatusColor(lastStatus, colors) } : null}>
              {last}
            </Text>
            {lastDate ? ` · ${lastDate}` : null}
          </Text>
        ) : null}
      </Pressable>
      <View style={list.trailing}>
        <MobileSwitch
          value={props.enabled}
          onValueChange={props.onToggle}
          disabled={props.disabled}
          accessibilityLabel={t('automations.mobile.runOnSchedule', 'Run {{name}} on schedule', {
            name: automation.name
          })}
        />
      </View>
    </View>
  )
}

/** A recent run with its outcome and age; tap opens the page. */
export function MobileHomeAutomationRunRow(props: {
  run: MobileAutomationRun
  now: number
  onOpen: () => void
}) {
  const list = useThemedStyles(homeListStylesSheet)
  const t = useMobileTranslation()
  const intlLocale = intlLocaleFor(useMobileUiLocale())
  const colors = useMobileColors()
  const styles = useThemedStyles(stylesSheet)
  const { run } = props
  const status = automationRunStatusLabel(run.status, t)
  const reason = automationRunErrorText(run, t)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('automations.mobile.runSummary', '{{title}}, {{status}}, {{date}}', {
        title: run.title,
        status,
        date: automationDate(run.scheduledFor, t, intlLocale)
      })}
      onPress={props.onOpen}
      style={({ pressed }) => [list.row, pressed && list.rowPressed]}
    >
      <View style={list.status}>
        <AgentSpinner status={runSpinnerStatus(run)} />
      </View>
      <View style={list.text}>
        <Text style={list.title} numberOfLines={1}>
          {run.title}
        </Text>
        <Text style={list.subtitle} numberOfLines={2}>
          {reason ? `${status} · ${reason}` : status}
        </Text>
      </View>
      <View style={list.trailing}>
        <Text style={styles.age}>
          {formatTimeAgo(run.startedAt ?? run.scheduledFor, props.now, t)}
        </Text>
        <ChevronRight size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  )
}

function runSpinnerStatus(run: MobileAutomationRun) {
  if (runMatchesOutcome(run, 'active')) {
    return 'working'
  }
  if (run.status === 'completed') {
    return 'done'
  }
  return run.status === 'dispatch_failed' ? 'failed' : 'inactive'
}

function runStatusColor(status: string, colors: MobilePalette): string {
  if (status === 'completed') {
    return colors.statusGreen
  }
  return status === 'dispatch_failed' ? colors.statusRed : colors.textMuted
}

const stylesSheet = themedStyleSheet((colors) => ({
  meta: { fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 2 },
  age: { fontSize: 15, color: colors.textMuted }
}))

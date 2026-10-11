import { Badge, type BadgeVariant } from "../../components/Badge.tsx"
import { formatDuration } from "../../format.ts"
import type { TimelineEvent } from "../../types.ts"
import { formatOffset, SOURCE_LABEL } from "./timelineFormat.ts"
import { useFailureTimeline } from "./useFailureTimeline.ts"

type Props = { runId: string; scenarioId: string; iteration: number; hasTrace: boolean }

const SOURCE_VARIANT: Record<TimelineEvent["source"], BadgeVariant> = { step: "neutral", http: "driver-http", device: "driver-mobile" }
const LEVEL_TEXT: Record<TimelineEvent["level"], string> = { error: "text-error", warning: "text-warning", info: "text-fg" }
const DETAIL_TEXT: Record<TimelineEvent["level"], string> = { error: "text-error", warning: "text-warning", info: "text-fg-muted" }

/** The scenario's step attempts, HTTP requests and device log warnings, in the order they happened. */
export function FailureTimeline({ runId, scenarioId, iteration, hasTrace }: Props) {
  const { timeline, error } = useFailureTimeline(runId, scenarioId, iteration)
  if (error) return <p className="text-xs text-error">Could not load the timeline: {error}</p>
  if (!timeline) return <p className="text-xs text-fg-muted">Loading timeline…</p>
  const deviceShown = timeline.events.filter((event) => event.source === "device").length
  const notes = [
    timeline.deviceEntries > deviceShown &&
      `Showing the latest ${deviceShown} of ${timeline.deviceEntries} device log warnings and errors. mobile-logcat.txt has them all.`,
    timeline.deviceClock === "assumed" &&
      "This device log has no year, so its times assume the device uses this computer's time zone.",
    hasTrace && "Browser actions are in the browser trace below, not on this timeline.",
  ].filter((note): note is string => Boolean(note))
  return (
    <div className="flex flex-col gap-2">
      {notes.map((note) => (
        <p key={note} className="text-xs text-fg-muted">
          {note}
        </p>
      ))}
      <ol aria-label="Failure timeline" className="flex flex-col border border-border rounded-xs divide-y divide-border bg-activity">
        {timeline.events.map((event, i) => (
          <li key={`${event.at}-${i}`} className="px-3 py-1.5 flex items-start gap-2 text-xs">
            <span className="w-24 shrink-0 font-mono text-fg-muted">{formatOffset(event.at, timeline.startedAt)}</span>
            <Badge size="xs" variant={SOURCE_VARIANT[event.source]} className="shrink-0">
              {SOURCE_LABEL[event.source]}
            </Badge>
            <span className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className={`truncate ${LEVEL_TEXT[event.level]}`}>{event.title}</span>
              {event.detail && (
                <pre className={`font-mono whitespace-pre-wrap wrap-break-word select-text ${DETAIL_TEXT[event.level]}`}>
                  {event.detail}
                </pre>
              )}
            </span>
            {event.durationMs != null && <span className="shrink-0 text-fg-muted">{formatDuration(event.durationMs)}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

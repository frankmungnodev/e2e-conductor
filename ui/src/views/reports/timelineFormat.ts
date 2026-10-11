/** Time since the scenario started, to the millisecond: +0.042s, +12.300s, +2m 05.120s. A time before the start gets a minus sign. */
export function formatOffset(at: number, startedAt: number): string {
  const ms = at - startedAt
  const sign = ms < 0 ? "-" : "+"
  const abs = Math.abs(ms)
  const minutes = Math.floor(abs / 60_000)
  const seconds = ((abs % 60_000) / 1000).toFixed(3)
  return minutes > 0 ? `${sign}${minutes}m ${seconds.padStart(6, "0")}s` : `${sign}${seconds}s`
}

/** Badge text for an event's source. */
export const SOURCE_LABEL = { step: "Step", http: "HTTP", device: "Device" } as const

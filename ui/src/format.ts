/** Uppercases the first character and leaves the rest as written. */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/** A duration a person reads at a glance: 420ms, 22.5s, 3m 14s, 1h 2m. */
export function formatDuration(ms: number | undefined): string {
  if (ms == null) return "-"
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** Shows `${ctx.songId}` as `{songId}`: the value's name, without the internal scope prefix. */
export function friendlyPlaceholders(text: string): string {
  return text.replace(/\$\{(?:ctx|env|run)\.([^}]+)\}/g, "{$1}")
}

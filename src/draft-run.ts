import { existsSync } from "node:fs"
import type { LoadedConfig } from "./config.ts"
import { withDb } from "./db/connection.ts"
import { getDraft } from "./db/drafts.ts"

/**
 * Why a run of the drafts `ids` may not start on the environment `config` loaded, or undefined when it
 * may. Every id must be a draft or a draft revision, and the loaded environment must carry the draft
 * mark (`allowDrafts`). `run()` and `POST /api/run` both check it, so the CLI and the server share it.
 */
export function draftRunRefusal(config: LoadedConfig, ids: string[]): string | undefined {
  if (ids.length === 0) return "A draft run needs at least one draft"
  const kept = existsSync(config.dbPath) ? withDb(config.dbPath, (db) => ids.filter((id) => !getDraft(db, id))) : ids
  if (kept.length > 0) {
    return `${kept.map((id) => `"${id}"`).join(", ")} ${kept.length === 1 ? "is not a draft" : "are not drafts"}. A draft run runs drafts only.`
  }

  const name = config.activeEnvironment
  if (name && config.environments?.[name]?.allowDrafts) return undefined
  const marked = Object.entries(config.environments ?? {})
    .filter(([, environment]) => environment.allowDrafts)
    .map(([markedName]) => markedName)
  const refused = `Drafts cannot run here: environment "${name ?? "(none)"}" does not allow drafts.`
  return marked.length > 0
    ? `${refused} Environments that allow drafts: ${marked.join(", ")}.`
    : `${refused} No environment allows drafts yet. Set the mark on an environment in the UI's Config view.`
}

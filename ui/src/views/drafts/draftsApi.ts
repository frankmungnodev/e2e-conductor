// Fetchers for the drafts endpoints. They live here, not in `ui/src/api.ts`, because that file is at its line budget.
import type { DraftGroup } from "./draftTypes.ts"

/** Sends a request and returns its JSON, or throws the server's `error` message. */
async function request<T>(path: string, init: RequestInit, failure: string): Promise<T> {
  const res = await fetch(path, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? failure)
  return json as T
}

export async function fetchDrafts(): Promise<DraftGroup[]> {
  const json = await request<{ groups: DraftGroup[] }>("/api/drafts", {}, "Failed to load drafts")
  return json.groups
}

export function keepDraft(id: string): Promise<{ ok: boolean; id: string }> {
  return request(`/api/drafts/${encodeURIComponent(id)}/keep`, { method: "POST" }, "Failed to keep the draft")
}

/** Keeps every draft in the group whose current content passed. `skipped` names revisions that could not be kept. */
export function keepPassingDrafts(key: string): Promise<{ kept: string[]; skipped: Array<{ id: string; message: string }> }> {
  return request(`/api/drafts/groups/${encodeURIComponent(key)}/keep`, { method: "POST" }, "Failed to keep the drafts")
}

export function markBugFound(id: string): Promise<{ ok: boolean; id: string }> {
  return request(`/api/drafts/${encodeURIComponent(id)}/bug-found`, { method: "POST" }, "Failed to mark the draft")
}

export function discardDraft(id: string): Promise<{ ok: boolean; id: string }> {
  return request(`/api/drafts/${encodeURIComponent(id)}`, { method: "DELETE" }, "Failed to discard the draft")
}

export function discardDraftGroup(key: string): Promise<{ ok: boolean; discarded: string[] }> {
  return request(`/api/drafts/groups/${encodeURIComponent(key)}`, { method: "DELETE" }, "Failed to discard the group")
}

/** Sets or clears the mark that lets drafts run on the environment `name`. */
export function setAllowDrafts(name: string, allowed: boolean): Promise<{ ok: boolean }> {
  return request(
    "/api/config/environment/allow-drafts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, allowed }) },
    "Failed to change the draft mark",
  )
}

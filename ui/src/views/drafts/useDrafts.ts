import { useCallback, useEffect, useState } from "react"
import { useToast } from "../../components/Toast.tsx"
import {
  discardDraft,
  discardDraftGroup,
  fetchDrafts,
  keepDraft,
  keepPassingDrafts,
  markBugFound,
} from "./draftsApi.ts"
import type { DraftGroup } from "./draftTypes.ts"

/**
 * The drafts grouped by prompt, and the person's actions on them. Every action reloads the groups,
 * and `onScenariosChanged` reloads the app's scenario list, where a kept draft now runs.
 */
export function useDrafts(onScenariosChanged: () => void) {
  const [groups, setGroups] = useState<DraftGroup[] | null>(null)
  const { error: toastError, success: toastSuccess, warning: toastWarning } = useToast()

  const reload = useCallback(async () => {
    try {
      setGroups(await fetchDrafts())
    } catch (error) {
      toastError((error as Error).message, "Failed to Load Drafts")
      setGroups((current) => current ?? [])
    }
  }, [toastError])

  useEffect(() => {
    void reload()
  }, [reload])

  /** Runs `action`, toasts its failure, then reloads drafts and scenarios either way. */
  const act = async (action: () => Promise<void>, failureTitle: string) => {
    try {
      await action()
    } catch (error) {
      toastError((error as Error).message, failureTitle)
    }
    await reload()
    onScenariosChanged()
  }

  const keep = (id: string, name: string) =>
    act(async () => {
      await keepDraft(id)
      toastSuccess(`"${name}" is now a kept scenario`, "Draft Kept")
    }, "Failed to Keep Draft")

  const keepAllPassing = (key: string) =>
    act(async () => {
      const { kept, skipped } = await keepPassingDrafts(key)
      toastSuccess(`${kept.length} draft${kept.length === 1 ? "" : "s"} kept`, "Drafts Kept")
      for (const skip of skipped) toastWarning(skip.message, "Draft Not Kept")
    }, "Failed to Keep Drafts")

  const markBug = (id: string) => act(async () => void (await markBugFound(id)), "Failed to Mark Bug Found")

  const discard = (id: string) => act(async () => void (await discardDraft(id)), "Failed to Discard Draft")

  const discardGroup = (key: string) => act(async () => void (await discardDraftGroup(key)), "Failed to Discard Group")

  return { groups, keep, keepAllPassing, markBug, discard, discardGroup }
}

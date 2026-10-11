import { useState } from "react"
import { Checkbox } from "../../components/Checkbox.tsx"
import { useToast } from "../../components/Toast.tsx"
import { capitalize } from "../../format.ts"
import type { EnvironmentMeta } from "../../types.ts"
import { setAllowDrafts } from "../drafts/draftsApi.ts"
import type { DraftAwareEnvironment } from "../drafts/draftTypes.ts"

type AllowDraftsToggleProps = {
  envName: string
  environment: EnvironmentMeta
  onConfigReload: () => void
}

/** The draft mark: only an environment with it can run drafts. It saves on its own, apart from Save Profile. */
export function AllowDraftsToggle({ envName, environment, onConfigReload }: AllowDraftsToggleProps) {
  const allowed = Boolean((environment as DraftAwareEnvironment).allowDrafts)
  const [isSaving, setIsSaving] = useState(false)
  const { error: toastError, success: toastSuccess } = useToast()

  const toggle = async (next: boolean) => {
    setIsSaving(true)
    try {
      await setAllowDrafts(envName, next)
      toastSuccess(
        `${capitalize(envName)} ${next ? "now allows" : "no longer allows"} draft runs`,
        "Draft Runs Updated",
      )
      onConfigReload()
    } catch (err) {
      toastError((err as Error).message, "Failed to Update Draft Runs")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Checkbox
      checked={allowed}
      disabled={isSaving}
      onCheckedChange={(next) => void toggle(next)}
      label="Allow Draft Runs"
      description="Agent-written drafts can run here. Turn it on only for an environment that is safe to test against, never production."
    />
  )
}

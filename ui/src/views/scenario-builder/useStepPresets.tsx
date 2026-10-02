import { useEffect, useMemo, useState } from "react"
import { deleteStepPreset, fetchStepPresets, saveStepPreset } from "../../api.ts"
import type { useConfirmDialog } from "../../components/ConfirmModal.tsx"
import { useToast } from "../../components/Toast.tsx"
import type { ScenarioStep, StepPreset } from "../../types.ts"

/** Saved step presets: loading, search, the save-as-preset form, and deletion. */
export function useStepPresets(confirm: ReturnType<typeof useConfirmDialog>["confirm"]) {
  const [stepPresets, setStepPresets] = useState<StepPreset[]>([])
  const [presetSearch, setPresetSearch] = useState("")
  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState(false)
  const [newPresetName, setNewPresetName] = useState("")
  const [newPresetDesc, setNewPresetDesc] = useState("")

  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast()

  const filteredStepPresets = useMemo(() => {
    if (!presetSearch.trim()) return stepPresets
    const q = presetSearch.toLowerCase()
    return stepPresets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.target.toLowerCase().includes(q),
    )
  }, [stepPresets, presetSearch])

  // Load presets from SQLite & .e2e/presets/
  const loadPresets = async () => {
    try {
      const data = await fetchStepPresets()
      setStepPresets(data.presets ?? [])
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadPresets()
  }, [])

  const openSavePreset = (stepName: string) => {
    setNewPresetName(stepName)
    setNewPresetDesc("")
    setIsSavePresetModalOpen(true)
  }

  const closeSavePreset = () => {
    setIsSavePresetModalOpen(false)
    setNewPresetName("")
    setNewPresetDesc("")
  }

  const handleSaveStepAsPreset = async (stepToSave: ScenarioStep | undefined) => {
    if (!newPresetName.trim()) return
    if (!stepToSave) return

    try {
      const presetId = `preset-${newPresetName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || Date.now()}`
      await saveStepPreset({
        id: presetId,
        name: newPresetName.trim(),
        description: newPresetDesc.trim() || undefined,
        target: stepToSave.target,
        step: JSON.parse(JSON.stringify(stepToSave)),
      })
      await loadPresets()
      setIsSavePresetModalOpen(false)
      setNewPresetName("")
      setNewPresetDesc("")
      toastSuccess(`Saved step as preset "${newPresetName.trim()}"`, "Preset Saved")
    } catch (err) {
      toastError((err as Error).message, "Failed to Save Preset")
    }
  }

  const handleDeletePreset = (id: string, name: string) => {
    confirm({
      title: "Delete Preset",
      message: (
        <span>
          Are you sure you want to delete step preset{" "}
          <strong className="text-fg-bright font-mono">"{name}"</strong>?
        </span>
      ),
      confirmText: "Delete Preset",
      variant: "danger",
      onConfirm: async () => {
        try {
          await deleteStepPreset(id)
          await loadPresets()
          toastInfo(`Deleted preset "${name}"`, "Preset Removed")
        } catch (err) {
          toastError((err as Error).message, "Failed to Delete Preset")
        }
      },
    })
  }

  return {
    stepPresets,
    filteredStepPresets,
    presetSearch,
    setPresetSearch,
    isSavePresetModalOpen,
    newPresetName,
    setNewPresetName,
    newPresetDesc,
    setNewPresetDesc,
    openSavePreset,
    closeSavePreset,
    handleSaveStepAsPreset,
    handleDeletePreset,
  }
}

export type StepPresets = ReturnType<typeof useStepPresets>

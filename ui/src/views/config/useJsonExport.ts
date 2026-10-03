import { useState } from "react"
import { exportToJson } from "../../api.ts"
import { useToast } from "../../components/Toast.tsx"
import { exportSummary } from "./exportSummary.ts"

/** Writes SQLite scenarios and presets to JSON files on demand. */
export function useJsonExport() {
  const [isExporting, setIsExporting] = useState(false)
  const { error: toastError, success: toastSuccess } = useToast()

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const { scenarios, presets } = await exportToJson()
      toastSuccess(exportSummary(scenarios.length, presets.length))
    } catch (err) {
      toastError((err as Error).message)
    } finally {
      setIsExporting(false)
    }
  }

  return { isExporting, handleExport }
}

import { useEffect, useState } from "react"
import { saveEnvironment } from "../../api.ts"
import { type EnvVarRow, envRowsToRecord, recordToEnvRows } from "../../components/EnvVariablesEditor.tsx"
import { useToast } from "../../components/Toast.tsx"
import type { ConfigMeta, EnvironmentMeta } from "../../types.ts"

/** Editable form state for the selected environment profile, reset whenever the selection changes. */
export function useEnvironmentProfile(
  config: ConfigMeta | null,
  selectedEnvName: string,
  selectedEnvData: EnvironmentMeta,
  onConfigReload: () => void,
) {
  const { error: toastError, success: toastSuccess } = useToast()
  // In-page Environment Profile Form state
  const [envDescription, setEnvDescription] = useState("")
  const [envScenarios, setEnvScenarios] = useState("")
  const [envFlows, setEnvFlows] = useState("")
  const [envResults, setEnvResults] = useState("")
  const [envRows, setEnvRows] = useState<EnvVarRow[]>([])
  const [isSavingEnv, setIsSavingEnv] = useState(false)

  // Sync profile form when selected environment changes
  useEffect(() => {
    setEnvDescription(selectedEnvData.description || "")
    setEnvScenarios(selectedEnvData.scenarios || config?.scenariosPath || ".e2e/scenarios")
    setEnvFlows(selectedEnvData.flows || ".e2e/flows")
    setEnvResults(selectedEnvData.results || config?.resultsPath || ".e2e/results")
    setEnvRows(
      recordToEnvRows(
        selectedEnvData.env || { APP_ENV: selectedEnvName },
      ),
    )
  }, [selectedEnvName, selectedEnvData, config?.scenariosPath, config?.resultsPath])

  const handleSaveEnvProfile = async () => {
    const parsedVars = envRowsToRecord(envRows)

    setIsSavingEnv(true)
    try {
      await saveEnvironment(selectedEnvName, {
        description: envDescription.trim() || undefined,
        scenarios: envScenarios.trim() || undefined,
        flows: envFlows.trim() || undefined,
        results: envResults.trim() || undefined,
        env: parsedVars,
      })
      toastSuccess(`Updated profile "${selectedEnvName}"`, "Environment Saved")
      onConfigReload()
    } catch (err) {
      toastError((err as Error).message, "Failed to Save Profile")
    } finally {
      setIsSavingEnv(false)
    }
  }

  return {
    envDescription,
    setEnvDescription,
    envScenarios,
    setEnvScenarios,
    envFlows,
    setEnvFlows,
    envResults,
    setEnvResults,
    envRows,
    setEnvRows,
    isSavingEnv,
    handleSaveEnvProfile,
  }
}

export type EnvironmentProfile = ReturnType<typeof useEnvironmentProfile>

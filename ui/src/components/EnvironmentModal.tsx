import { Check, Database, Globe } from "lucide-react"
import { useEffect, useState } from "react"
import { saveEnvironment, setActiveEnvironment } from "../api.ts"
import type { EnvironmentMeta } from "../types.ts"
import { Badge } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import {
  EnvVariablesEditor,
  type EnvVarRow,
  envRowsToRecord,
  recordToEnvRows,
} from "./EnvVariablesEditor.tsx"
import { FormField, Input } from "./FormControls.tsx"
import { Modal } from "./Modal.tsx"
import { useToast } from "./Toast.tsx"

export interface EnvironmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  dismissable?: boolean
  isInitialSetup?: boolean
  initialEnvName?: string
  initialData?: EnvironmentMeta
  initialDbPath?: string
}

export function EnvironmentModal({
  isOpen,
  onClose,
  onSaved,
  dismissable = true,
  isInitialSetup = false,
  initialEnvName = "",
  initialData,
  initialDbPath = ".e2e",
}: EnvironmentModalProps) {
  const isEditing = Boolean(initialEnvName) && !isInitialSetup
  const [dbPath, setDbPath] = useState(initialDbPath || ".e2e")

  const [name, setName] = useState(initialEnvName || (isInitialSetup ? "dev" : ""))
  const [description, setDescription] = useState(
    initialData?.description || (isInitialSetup ? "Local development baseline" : ""),
  )
  const [scenarios, setScenarios] = useState(
    initialData?.scenarios || "e2e-suite/scenarios",
  )
  const [flows, setFlows] = useState(initialData?.flows || ".e2e/flows")
  const [results, setResults] = useState(initialData?.results || ".e2e/results")
  const [envRows, setEnvRows] = useState<EnvVarRow[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const { error: toastError, success: toastSuccess } = useToast()

  useEffect(() => {
    if (!isOpen) return
    if (initialEnvName) {
      setName(initialEnvName)
      setDescription(initialData?.description || "")
      setScenarios(initialData?.scenarios || "e2e-suite/scenarios")
      setFlows(initialData?.flows || ".e2e/flows")
      setResults(initialData?.results || ".e2e/results")
      setEnvRows(recordToEnvRows(initialData?.env))
    } else {
      setName(isInitialSetup ? "dev" : "")
      setDescription(isInitialSetup ? "Local development baseline" : "")
      setScenarios("e2e-suite/scenarios")
      setFlows(".e2e/flows")
      setResults(".e2e/results")
      setEnvRows(recordToEnvRows(isInitialSetup ? { APP_ENV: "dev" } : {}))
    }
  }, [isOpen, initialEnvName, initialData, isInitialSetup])

  const handleSubmit = async () => {
    const cleanName = name.trim()
    if (!cleanName) {
      toastError("Environment name is required", "Validation Error")
      return
    }

    const parsedVars = envRowsToRecord(envRows)

    setIsSaving(true)
    try {
      await saveEnvironment(
        cleanName,
        {
          description: description.trim() || undefined,
          scenarios: scenarios.trim() || undefined,
          flows: flows.trim() || undefined,
          results: results.trim() || undefined,
          env: parsedVars,
        },
        isInitialSetup ? dbPath.trim() || ".e2e" : undefined,
      )

      if (isInitialSetup) {
        try {
          await setActiveEnvironment(cleanName)
        } catch {
          // ignore
        }
      }

      toastSuccess(
        `Environment "${cleanName}" configured`,
        isInitialSetup ? "Setup Complete" : "Environment Saved",
      )
      onSaved()
      onClose()
    } catch (err) {
      toastError((err as Error).message, "Failed to Save Environment")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissable={dismissable}
      maxWidth="2xl"
      title={
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <span>
            {isInitialSetup
              ? "Initial Environment Setup"
              : isEditing
                ? "Edit Environment"
                : "Add Environment"}
          </span>
          {!dismissable && (
            <Badge variant="warning" size="xs">
              Required
            </Badge>
          )}
        </div>
      }
      description={
        isInitialSetup
          ? "Configure your starting test environment profile and folder paths."
          : "Configure directory paths and environment variables for this testing profile."
      }
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          {dismissable && (
            <Button
              size="xs"
              variant="ghost"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
          )}
          <Button
            size="xs"
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSaving}
            icon={<Check className="w-3.5 h-3.5" />}
          >
            {isInitialSetup ? "Save & Initialize Environment" : "Save Environment"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Database Location for initial setup */}
        {isInitialSetup && (
          <div className="p-3 bg-editor border border-primary/30 rounded-xs space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-bright">
              <Database className="w-3.5 h-3.5 text-primary" />
              <span>SQLite Database Storage</span>
            </div>
            <FormField
              label="Database Storage Path"
              hint="Folder or file path where configuration SQLite database will be stored (defaults to .e2e folder root)"
              required
            >
              <Input
                value={dbPath}
                onChange={(e) => setDbPath(e.target.value)}
                placeholder=".e2e"
                mono
              />
            </FormField>
          </div>
        )}

        {/* Identification */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Environment Name"
            hint="Name used in CLI (--env) e.g. dev, staging, local, qa"
            required
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEditing}
              placeholder={isInitialSetup ? "e.g. dev" : "e.g. staging, local, qa"}
              mono
            />
          </FormField>

          <FormField
            label="Description"
            hint="Brief human-readable summary"
          >
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Local development baseline"
            />
          </FormField>
        </div>

        {/* Directory Structure (Max 2 columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Scenarios Folder"
            hint="Directory for scenario test files"
          >
            <Input
              value={scenarios}
              onChange={(e) => setScenarios(e.target.value)}
              placeholder="e.g. e2e-suite/scenarios"
              mono
            />
          </FormField>

          <FormField
            label="Flows Folder"
            hint="Directory for reusable flow files"
          >
            <Input
              value={flows}
              onChange={(e) => setFlows(e.target.value)}
              placeholder="e.g. .e2e/flows"
              mono
            />
          </FormField>
        </div>

        <FormField
          label="Results Folder"
          hint="Directory where test runs save output artifacts"
        >
          <Input
            value={results}
            onChange={(e) => setResults(e.target.value)}
            placeholder="e.g. .e2e/results"
            mono
          />
        </FormField>

        {/* Environment Variables (Full width) */}
        <EnvVariablesEditor
          rows={envRows}
          onChange={setEnvRows}
          disabled={isSaving}
        />
      </div>
    </Modal>
  )
}

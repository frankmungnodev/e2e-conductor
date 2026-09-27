import { Check, Database, Globe } from "lucide-react"
import { useEffect, useState } from "react"
import { saveEnvironment, setActiveEnvironment } from "../api.ts"
import type { EnvironmentMeta } from "../types.ts"
import { Badge } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { FormField, Input, TextArea } from "./FormControls.tsx"
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

type EnvPreset = "dev" | "staging" | "prod" | "custom"

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

  const [preset, setPreset] = useState<EnvPreset>(
    initialEnvName === "staging"
      ? "staging"
      : initialEnvName === "prod"
        ? "prod"
        : initialEnvName === "dev"
          ? "dev"
          : "dev",
  )
  const [name, setName] = useState(initialEnvName || "dev")
  const [description, setDescription] = useState(
    initialData?.description || "Local development baseline",
  )
  const [scenarios, setScenarios] = useState(
    initialData?.scenarios || ".e2e/scenarios",
  )
  const [flows, setFlows] = useState(initialData?.flows || ".e2e/flows")
  const [results, setResults] = useState(initialData?.results || ".e2e/results")
  const [envVarsJson, setEnvVarsJson] = useState(
    initialData?.env
      ? JSON.stringify(initialData.env, null, 2)
      : '{\n  "APP_ENV": "dev"\n}',
  )
  const [isSaving, setIsSaving] = useState(false)

  const { error: toastError, success: toastSuccess } = useToast()

  useEffect(() => {
    if (!isOpen) return
    if (initialEnvName) {
      setName(initialEnvName)
      setDescription(initialData?.description || "")
      setScenarios(initialData?.scenarios || ".e2e/scenarios")
      setFlows(initialData?.flows || ".e2e/flows")
      setResults(initialData?.results || ".e2e/results")
      setEnvVarsJson(
        initialData?.env ? JSON.stringify(initialData.env, null, 2) : "{}",
      )
    } else {
      setName("dev")
      setDescription("Local development baseline")
      setScenarios(".e2e/scenarios")
      setFlows(".e2e/flows")
      setResults(".e2e/results")
      setEnvVarsJson('{\n  "APP_ENV": "dev"\n}')
      setPreset("dev")
    }
  }, [isOpen, initialEnvName, initialData])

  const handleSelectPreset = (p: EnvPreset) => {
    setPreset(p)
    if (p === "dev") {
      setName("dev")
      setDescription("Local development baseline")
      setEnvVarsJson('{\n  "APP_ENV": "dev"\n}')
    } else if (p === "staging") {
      setName("staging")
      setDescription("Staging & pre-release verification")
      setEnvVarsJson('{\n  "APP_ENV": "staging"\n}')
    } else if (p === "prod") {
      setName("prod")
      setDescription("Production sanity verification")
      setEnvVarsJson('{\n  "APP_ENV": "prod"\n}')
    } else {
      setName("custom")
      setDescription("Custom target environment")
      setEnvVarsJson('{\n  "APP_ENV": "custom"\n}')
    }
  }

  const handleSubmit = async () => {
    const cleanName = name.trim().toLowerCase()
    if (!cleanName) {
      toastError("Environment identifier is required", "Validation Error")
      return
    }

    let parsedVars: Record<string, string> | undefined
    if (envVarsJson.trim()) {
      try {
        parsedVars = JSON.parse(envVarsJson.trim())
      } catch {
        toastError(
          "Environment variables must be valid JSON object",
          "JSON Parse Error",
        )
        return
      }
    }

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

        {/* Preset Selector for new environments */}
        {!isEditing && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-fg-bright">
              Environment Preset
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleSelectPreset("dev")}
                className={`p-3 rounded-xs border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  preset === "dev"
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border bg-sidebar hover:border-border-light hover:bg-hover"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-fg-bright">Dev</span>
                  <Badge variant={preset === "dev" ? "primary" : "neutral"} size="xs">
                    Default
                  </Badge>
                </div>
                <span className="text-xs text-fg-muted leading-tight">
                  Local dev baseline
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset("staging")}
                className={`p-3 rounded-xs border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  preset === "staging"
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border bg-sidebar hover:border-border-light hover:bg-hover"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-fg-bright">Staging</span>
                  <Badge variant={preset === "staging" ? "primary" : "neutral"} size="xs">
                    Staging
                  </Badge>
                </div>
                <span className="text-xs text-fg-muted leading-tight">
                  Pre-release testing
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset("prod")}
                className={`p-3 rounded-xs border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  preset === "prod"
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border bg-sidebar hover:border-border-light hover:bg-hover"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-fg-bright">Prod</span>
                  <Badge variant={preset === "prod" ? "primary" : "neutral"} size="xs">
                    Prod
                  </Badge>
                </div>
                <span className="text-xs text-fg-muted leading-tight">
                  Production sanity
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Identification */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Environment Identifier"
            hint="Identifier used in CLI (--env) e.g. dev, staging, prod"
            required
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              disabled={isEditing}
              placeholder="e.g. dev"
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
              placeholder="e.g. .e2e/scenarios"
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
        <FormField
          label="Environment Variables (JSON)"
          hint="Key-value pairs accessible as ${env.KEY} in scenarios"
        >
          <TextArea
            rows={5}
            value={envVarsJson}
            onChange={(e) => setEnvVarsJson(e.target.value)}
            placeholder={`{\n  "APP_ENV": "main"\n}`}
            mono
          />
        </FormField>
      </div>
    </Modal>
  )
}

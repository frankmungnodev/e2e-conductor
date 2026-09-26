import {
  AlertTriangle,
  Check,
  Code2,
  Database,
  FileCode,
  Globe,
  Layers,
  Plus,
  RefreshCw,
  Save,
  Server,
  Smartphone,
  Sparkles,
} from "lucide-react"
import { useEffect, useState } from "react"
import { fetchConfigCode, initProjectConfig, saveConfigCode } from "../api.ts"
import type { ConfigMeta } from "../types.ts"
import { Badge } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { useToast } from "./Toast.tsx"

type ConfigViewProps = {
  config: ConfigMeta | null
  onConfigReload: () => void
}

const TEMPLATES = {
  httpService: `    backend: {
      url: "http://localhost:8080",
      health: "/health",
      start: { cwd: "./backend", cmd: "pnpm run dev" },
    },`,
  webTarget: `    web: {
      driver: "web",
      service: "frontend",
      modules: "./web",
      slowMo: 100,
    },`,
  mobileTarget: `    app: {
      driver: "mobile",
      platform: "android",
      appId: "com.example.app",
      flows: "./flows",
      reversePorts: [8080],
    },`,
}

export function ConfigView({ config, onConfigReload }: ConfigViewProps) {
  const [configCode, setConfigCode] = useState("")
  const [configPath, setConfigPath] = useState("")
  const [fileExists, setFileExists] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { error: toastError, success: toastSuccess } = useToast()

  const loadCode = async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const data = await fetchConfigCode()
      setConfigCode(data.content)
      setConfigPath(data.path)
      setFileExists(data.exists)
    } catch (err) {
      setErrorMessage((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadCode()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await saveConfigCode(configCode)
      setSaveSuccess(true)
      toastSuccess("Configuration saved and reloaded", "Config Saved")
      setFileExists(true)
      onConfigReload()
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err) {
      const msg = (err as Error).message
      setErrorMessage(msg)
      toastError(msg, "Invalid Configuration")
    } finally {
      setIsSaving(false)
    }
  }

  const handleInitProject = async () => {
    setIsInitializing(true)
    setErrorMessage(null)
    try {
      const res = await initProjectConfig()
      toastSuccess(
        `Created: ${res.created.join(", ")}`,
        "Project Initialized",
      )
      await loadCode()
      onConfigReload()
    } catch (err) {
      toastError((err as Error).message, "Failed to Initialize Project")
    } finally {
      setIsInitializing(false)
    }
  }

  const insertSnippet = (snippet: string) => {
    setConfigCode((prev) => `${prev}\n\n// Added Snippet:\n${snippet}`)
    toastSuccess("Snippet appended to editor", "Template Inserted")
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-editor overflow-hidden select-text">
      {/* Top Header Bar */}
      <div className="px-4 py-2 border-b border-border bg-titlebar flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileCode className="w-4 h-4 text-primary" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-fg-bright">Project Configuration</span>
              <span className="text-[10px] font-mono text-fg-muted bg-sidebar px-1.5 py-0.2 rounded-xs border border-border">
                e2e.config.ts
              </span>
              {fileExists ? (
                <Badge variant="success" size="xs">
                  Active On Disk
                </Badge>
              ) : (
                <Badge variant="warning" size="xs">
                  Starter Mode (No File)
                </Badge>
              )}
            </div>
            <div className="text-[10px] font-mono text-fg-muted truncate max-w-xl">
              {configPath || config?.configDir}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!fileExists && (
            <Button
              size="xs"
              variant="secondary"
              onClick={handleInitProject}
              isLoading={isInitializing}
              icon={<Sparkles className="w-3 h-3 text-warning" />}
            >
              Initialize Project Files
            </Button>
          )}

          <Button
            size="xs"
            variant="ghost"
            onClick={loadCode}
            disabled={isLoading}
            title="Reload from disk"
            icon={<RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />}
          >
            Reload
          </Button>

          <Button
            size="xs"
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
            isLoading={isSaving}
            icon={saveSuccess ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
          >
            {saveSuccess ? "Saved!" : isSaving ? "Saving..." : "Save Config"}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-error-bg border-b border-error-border p-2.5 px-4 text-xs text-error flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Configuration Error:</div>
            <pre className="text-[11px] font-mono mt-0.5 whitespace-pre-wrap">{errorMessage}</pre>
          </div>
        </div>
      )}

      {/* Main Content Area: Split 2 columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Config Overview & Snippets */}
        <div className="w-80 border-r border-border bg-sidebar p-3 space-y-4 overflow-y-auto">
          {/* Services Overview */}
          <div>
            <div className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Server className="w-3 h-3 text-info" /> Configured Services
              </span>
              <Badge variant="neutral" size="xs">
                {Object.keys(config?.services ?? {}).length}
              </Badge>
            </div>
            {Object.keys(config?.services ?? {}).length === 0 ? (
              <div className="text-xs text-fg-muted bg-panel p-2 rounded-xs border border-border">
                No services configured.
              </div>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(config?.services ?? {}).map(([name, s]) => (
                  <div key={name} className="bg-panel p-2 rounded-xs border border-border text-xs">
                    <div className="font-semibold text-fg-bright flex items-center justify-between">
                      <span>{name}</span>
                      <span className="text-[10px] font-mono text-primary truncate max-w-[120px]">
                        {s.url}
                      </span>
                    </div>
                    {s.hasStart && (
                      <div className="text-[10px] text-fg-muted mt-1 font-mono truncate">
                        $ {s.startCmd}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Targets Overview */}
          <div>
            <div className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-primary" /> Configured Targets
              </span>
              <Badge variant="neutral" size="xs">
                {Object.keys(config?.targets ?? {}).length}
              </Badge>
            </div>
            {Object.keys(config?.targets ?? {}).length === 0 ? (
              <div className="text-xs text-fg-muted bg-panel p-2 rounded-xs border border-border">
                No targets configured.
              </div>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(config?.targets ?? {}).map(([name, t]) => (
                  <div key={name} className="bg-panel p-2 rounded-xs border border-border text-xs">
                    <div className="font-semibold text-fg-bright flex items-center justify-between">
                      <span>{name}</span>
                      <Badge variant="neutral" size="xs">
                        {String(t.driver ?? "http").toUpperCase()}
                      </Badge>
                    </div>
                    {t.driver === "mobile" && t.appId && (
                      <div className="text-[10px] text-fg-muted mt-1 font-mono truncate">
                        App: {t.appId}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fixtures Overview */}
          <div>
            <div className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3 text-warning" /> Registered Fixtures
              </span>
              <Badge variant="neutral" size="xs">
                {(config?.fixtures ?? []).length}
              </Badge>
            </div>
            {(config?.fixtures ?? []).length === 0 ? (
              <div className="text-xs text-fg-muted bg-panel p-2 rounded-xs border border-border">
                No fixtures declared.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {(config?.fixtures ?? []).map((f) => (
                  <span
                    key={f}
                    className="px-1.5 py-0.5 bg-input border border-border rounded-xs font-mono text-[11px] text-fg"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Quick Snippet Generator */}
          <div className="pt-2 border-t border-border">
            <div className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Plus className="w-3 h-3 text-secondary" /> Add Snippets to Config
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => insertSnippet(TEMPLATES.httpService)}
                className="w-full text-left px-2 py-1.5 text-xs bg-panel hover:bg-input border border-border rounded-xs text-fg transition-colors cursor-pointer flex items-center justify-between"
              >
                <span>+ Backend Service</span>
                <Server className="w-3 h-3 text-info" />
              </button>
              <button
                type="button"
                onClick={() => insertSnippet(TEMPLATES.webTarget)}
                className="w-full text-left px-2 py-1.5 text-xs bg-panel hover:bg-input border border-border rounded-xs text-fg transition-colors cursor-pointer flex items-center justify-between"
              >
                <span>+ Web Target (Playwright)</span>
                <Globe className="w-3 h-3 text-primary" />
              </button>
              <button
                type="button"
                onClick={() => insertSnippet(TEMPLATES.mobileTarget)}
                className="w-full text-left px-2 py-1.5 text-xs bg-panel hover:bg-input border border-border rounded-xs text-fg transition-colors cursor-pointer flex items-center justify-between"
              >
                <span>+ Mobile Target (Android)</span>
                <Smartphone className="w-3 h-3 text-success" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Code Editor */}
        <div className="flex-1 flex flex-col bg-editor overflow-hidden">
          <div className="px-3 py-1.5 bg-sidebar/50 border-b border-border flex items-center justify-between text-xs text-fg-muted">
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              <Code2 className="w-3.5 h-3.5 text-primary" /> TypeScript Config Editor
            </span>
            <span className="text-[10px]">Changes are validated with TypeScript on save</span>
          </div>

          <div className="flex-1 p-2 relative overflow-hidden">
            <textarea
              value={configCode}
              onChange={(e) => setConfigCode(e.target.value)}
              placeholder="import { defineConfig } from 'e2e-orchestrator'..."
              spellCheck={false}
              className="w-full h-full p-3 font-mono text-xs text-fg-bright bg-transparent border-0 resize-none focus:outline-none selection:bg-selection selection:text-white leading-relaxed"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

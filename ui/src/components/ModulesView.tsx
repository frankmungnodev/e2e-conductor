import {
  Check,
  Code2,
  Copy,
  Database,
  FileCode,
  FolderTree,
  Globe,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Wrench,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { deleteModule, fetchModules, saveModule } from "../api.ts"
import type { ConfigMeta, ModuleFile } from "../types.ts"
import { Badge } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { useToast } from "./Toast.tsx"

type ModulesViewProps = {
  config: ConfigMeta | null
  initialSelectedId?: string
}

const TEMPLATES = {
  webStandard: `import { defineWebStep } from "e2e-orchestrator"

/**
 * Standard web step. Navigates, interacts, and returns data for extraction/assertion.
 */
export default defineWebStep(async ({ page, params, baseUrl, env, log }) => {
  log("Navigating to page")
  await page.goto("/")
  await page.waitForLoadState("networkidle")

  return {}
})
`,
  webAuth: `import { defineWebStep } from "e2e-orchestrator"

/**
 * Authentication web step. Enters credentials and waits for session redirect.
 */
export default defineWebStep(async ({ page, params, log }) => {
  const email = (params.email as string) || "admin@example.com"
  const password = (params.password as string) || "password123"

  await page.goto("/login")
  await page.locator('input[type="email"], #email').fill(email)
  await page.locator('input[type="password"], #password').fill(password)
  await page.getByRole("button", { name: /log in|sign in|continue/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"))

  log(\`Successfully logged in as \${email}\`)
  return { email }
})
`,
  fixtureDatabase: `import { type FixtureFn, runShell } from "e2e-orchestrator"

/**
 * Database fixture. Runs reset or seeding before scenario execution.
 */
export const resetDb: FixtureFn = async ({ configDir, env, log }) => {
  log("Resetting test database...")
  const res = await runShell("pnpm run db:reset", { cwd: configDir, log })
  if (res.exitCode !== 0) {
    throw new Error(\`Database reset failed with code \${res.exitCode}: \${res.stderr}\`)
  }
}
`,
  helperEmpty: `// Helper utilities and shared test constants

export const TEST_CONSTANTS = {
  DEFAULT_TIMEOUT: 10000,
}
`,
}

export function ModulesView({ config, initialSelectedId }: ModulesViewProps) {
  const [modules, setModules] = useState<ModuleFile[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId || null)
  const [editedCode, setEditedCode] = useState("")
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [copiedSnippet, setCopiedSnippet] = useState(false)

  // Filter & Search
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<"all" | "web" | "fixture" | "helper">("all")

  // Modal for new file
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newCategory, setNewCategory] = useState<"web" | "fixture" | "helper">("web")
  const [newTarget, setNewTarget] = useState("")
  const [newFileName, setNewFileName] = useState("")
  const [newTemplateType, setNewTemplateType] = useState<"webStandard" | "webAuth" | "fixtureDatabase" | "helperEmpty">("webStandard")

  const { success: toastSuccess, error: toastError } = useToast()

  // Web targets from config
  const webTargets = useMemo(() => {
    if (!config?.targets) return []
    return Object.entries(config.targets)
      .filter(([_, t]) => t.driver === "web")
      .map(([name]) => name)
  }, [config])

  const loadModulesList = async (selectIdAfterLoad?: string) => {
    setIsLoading(true)
    try {
      const list = await fetchModules()
      setModules(list)
      const targetId = selectIdAfterLoad || selectedId
      if (targetId && list.some((m) => m.id === targetId)) {
        const item = list.find((m) => m.id === targetId)
        if (item) {
          setSelectedId(item.id)
          setEditedCode(item.content)
          setIsDirty(false)
        }
      } else if (list.length > 0) {
        setSelectedId(list[0].id)
        setEditedCode(list[0].content)
        setIsDirty(false)
      } else {
        setSelectedId(null)
        setEditedCode("")
        setIsDirty(false)
      }
    } catch (err) {
      toastError(`Failed to load modules: ${(err as Error).message}`)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadModulesList(initialSelectedId)
  }, [])

  const selectedModule = useMemo(() => {
    return modules.find((m) => m.id === selectedId) || null
  }, [modules, selectedId])

  const handleSelectModule = (item: ModuleFile) => {
    if (isDirty && selectedId && selectedId !== item.id) {
      if (!confirm("You have unsaved changes in the current file. Discard and switch?")) {
        return
      }
    }
    setSelectedId(item.id)
    setEditedCode(item.content)
    setIsDirty(false)
  }

  const handleSave = async () => {
    if (!selectedModule) return
    setIsSaving(true)
    try {
      const updated = await saveModule({
        category: selectedModule.category,
        target: selectedModule.target,
        name: selectedModule.name,
        content: editedCode,
      })
      toastSuccess(`Saved ${selectedModule.name}`)
      setIsDirty(false)
      await loadModulesList(updated.id)
    } catch (err) {
      toastError(`Failed to save: ${(err as Error).message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedModule) return
    if (!confirm(`Are you sure you want to permanently delete "${selectedModule.name}"?`)) {
      return
    }
    try {
      await deleteModule({
        category: selectedModule.category,
        target: selectedModule.target,
        name: selectedModule.name,
      })
      toastSuccess(`Deleted ${selectedModule.name}`)
      setSelectedId(null)
      setIsDirty(false)
      await loadModulesList()
    } catch (err) {
      toastError(`Failed to delete: ${(err as Error).message}`)
    }
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    let cleanName = newFileName.trim()
    if (!cleanName) {
      toastError("Please enter a file name")
      return
    }
    if (!cleanName.endsWith(".ts") && !cleanName.endsWith(".js")) {
      cleanName = `${cleanName}.ts`
    }
    if (newCategory === "web" && !newTarget) {
      toastError("Please select a target for the web module")
      return
    }

    const templateContent = TEMPLATES[newTemplateType] || ""
    try {
      const created = await saveModule({
        category: newCategory,
        target: newCategory === "web" ? newTarget : undefined,
        name: cleanName,
        content: templateContent,
      })
      toastSuccess(`Created ${cleanName}`)
      setIsCreateModalOpen(false)
      setNewFileName("")
      await loadModulesList(created.id)
    } catch (err) {
      toastError(`Failed to create file: ${(err as Error).message}`)
    }
  }

  // Filtered files
  const filteredModules = useMemo(() => {
    return modules.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        Boolean(m.target?.toLowerCase().includes(search.toLowerCase()))
      const matchesCategory = categoryFilter === "all" || m.category === categoryFilter
      return matchesSearch && matchesCategory
    })
  }, [modules, search, categoryFilter])

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        if (isDirty) {
          handleSave()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isDirty, selectedModule, editedCode])

  const usageSnippet = useMemo(() => {
    if (!selectedModule) return ""
    if (selectedModule.category === "web") {
      const nameWithoutExt = selectedModule.name.replace(/\.(ts|js)$/, "")
      return JSON.stringify(
        {
          name: `Step: ${nameWithoutExt}`,
          target: selectedModule.target || "web",
          driver: "web",
          module: nameWithoutExt,
          params: {},
        },
        null,
        2,
      )
    }
    if (selectedModule.category === "fixture") {
      const nameWithoutExt = selectedModule.name.replace(/\.(ts|js)$/, "")
      return `// In e2e.config.ts fixtures:
import { ${nameWithoutExt} } from "./fixtures/${selectedModule.name}"

export default defineConfig({
  fixtures: {
    "${nameWithoutExt}": ${nameWithoutExt},
  },
})`
    }
    return `// In your step module:
import { ... } from "./${selectedModule.name}"`
  }, [selectedModule])

  const copyUsageSnippet = () => {
    if (!usageSnippet) return
    navigator.clipboard.writeText(usageSnippet)
    setCopiedSnippet(true)
    setTimeout(() => setCopiedSnippet(false), 2000)
    toastSuccess("Snippet copied to clipboard")
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-bg text-fg overflow-hidden">
      {/* Sidebar File Explorer */}
      <aside className="w-80 border-r border-border bg-sidebar flex flex-col shrink-0">
        {/* Sidebar Header */}
        <div className="p-3 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-primary" />
            <span className="font-semibold text-xs tracking-tight text-fg-bright uppercase">Code Modules</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setNewCategory("web")
                setNewTarget(webTargets[0] || "")
                setNewTemplateType("webStandard")
                setIsCreateModalOpen(true)
              }}
              title="Create new step module or fixture"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              New
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted hover:text-fg"
              onClick={() => loadModulesList()}
              title="Refresh files"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="p-3 border-b border-border flex flex-col gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Filter modules..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-input border border-border rounded text-xs text-fg placeholder:text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto text-[11px] pb-1">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={`px-2 py-0.5 rounded-full border transition-colors ${
                categoryFilter === "all"
                  ? "bg-primary/20 border-primary text-primary font-medium"
                  : "border-border text-muted hover:text-fg hover:border-fg/30"
              }`}
            >
              All ({modules.length})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter("web")}
              className={`px-2 py-0.5 rounded-full border transition-colors ${
                categoryFilter === "web"
                  ? "bg-primary/20 border-primary text-primary font-medium"
                  : "border-border text-muted hover:text-fg hover:border-fg/30"
              }`}
            >
              Web Steps ({modules.filter((m) => m.category === "web").length})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter("fixture")}
              className={`px-2 py-0.5 rounded-full border transition-colors ${
                categoryFilter === "fixture"
                  ? "bg-primary/20 border-primary text-primary font-medium"
                  : "border-border text-muted hover:text-fg hover:border-fg/30"
              }`}
            >
              Fixtures ({modules.filter((m) => m.category === "fixture").length})
            </button>
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredModules.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted">
              {modules.length === 0
                ? "No code modules found. Click + New to create a web step module or fixture script."
                : "No files match your search filter."}
            </div>
          ) : (
            filteredModules.map((item) => {
              const isSelected = item.id === selectedId
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => handleSelectModule(item)}
                  className={`w-full text-left px-2.5 py-2 rounded flex flex-col gap-1 transition-colors border ${
                    isSelected
                      ? "bg-accent/40 border-primary/40 text-fg-bright shadow-xs"
                      : "border-transparent text-fg hover:bg-hover hover:border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 w-full">
                    <div className="flex items-center gap-1.5 truncate">
                      {item.category === "web" ? (
                        <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      ) : item.category === "fixture" ? (
                        <Database className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <Wrench className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      )}
                      <span className="text-xs font-mono font-medium truncate">{item.name}</span>
                    </div>
                    {item.target && (
                      <Badge variant="neutral" className="text-[10px] shrink-0 font-mono">
                        {item.target}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted pl-5">
                    <span>{item.category === "web" ? "Web Step" : item.category === "fixture" ? "Fixture" : "Helper"}</span>
                    <span>{(item.size / 1024).toFixed(1)} KB</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Editor & Details Workspace */}
      <main className="flex-1 flex flex-col bg-bg min-w-0 overflow-hidden">
        {selectedModule ? (
          <>
            {/* Editor Top Bar */}
            <div className="h-12 border-b border-border bg-activity px-4 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-mono truncate text-fg-bright">
                  <span className="text-muted">
                    {selectedModule.category === "web"
                      ? `${selectedModule.target || "web"} / `
                      : `${selectedModule.category}s / `}
                  </span>
                  <span className="font-semibold text-primary">{selectedModule.name}</span>
                </div>
                <Badge variant={selectedModule.category === "web" ? "info" : "warning"}>
                  {selectedModule.category === "web" ? "Web Step" : "Fixture"}
                </Badge>
                {isDirty && (
                  <Badge variant="warning">
                    Unsaved Changes
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  className="h-8 px-2.5 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50"
                  title="Delete file"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Delete
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={!isDirty || isSaving}
                  className="h-8 px-3 text-xs"
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {isSaving ? "Saving..." : "Save Module"}
                </Button>
              </div>
            </div>

            {/* Code Editor Body */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#090d16]">
              <textarea
                value={editedCode}
                onChange={(e) => {
                  setEditedCode(e.target.value)
                  setIsDirty(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault()
                    const start = e.currentTarget.selectionStart
                    const end = e.currentTarget.selectionEnd
                    const updated = `${editedCode.substring(0, start)}  ${editedCode.substring(end)}`
                    setEditedCode(updated)
                    setIsDirty(true)
                    setTimeout(() => {
                      if (e.currentTarget) {
                        e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2
                      }
                    }, 0)
                  }
                }}
                spellCheck={false}
                className="w-full flex-1 p-4 bg-transparent font-mono text-xs text-fg-bright leading-relaxed resize-none focus:outline-none focus:ring-0 select-text"
              />
            </div>

            {/* Bottom Reference & Usage Bar */}
            <div className="border-t border-border bg-activity/80 p-3 shrink-0 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted tracking-wider uppercase flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-primary" />
                  How to use this {selectedModule.category === "web" ? "Step in Scenarios" : "Fixture in Config"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted hover:text-fg"
                  onClick={copyUsageSnippet}
                >
                  {copiedSnippet ? <Check className="w-3 h-3 text-emerald-400 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                  {copiedSnippet ? "Copied" : "Copy Snippet"}
                </Button>
              </div>
              <pre className="p-2 bg-input/80 border border-border/80 rounded text-[11px] font-mono text-fg overflow-x-auto select-all max-h-24">
                {usageSnippet}
              </pre>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-bg/50">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3">
              <FileCode className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-fg-bright mb-1">No Module Selected</h3>
            <p className="text-xs text-muted max-w-sm mb-4">
              Select a web step module or fixture script from the sidebar, or create a new one to begin authoring.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setNewCategory("web")
                setNewTarget(webTargets[0] || "")
                setNewTemplateType("webStandard")
                setIsCreateModalOpen(true)
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create New Module
            </Button>
          </div>
        )}
      </main>

      {/* Modal: Create New Module */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <form onSubmit={handleCreateSubmit}>
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-sm text-fg-bright">Create New Code Module</h3>
                <p className="text-xs text-muted mt-0.5">
                  Add a Playwright web step or fixture helper script to your project.
                </p>
              </div>

              <div className="p-4 space-y-4">
                {/* Category Selection */}
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Module Category</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewCategory("web")
                        setNewTemplateType("webStandard")
                      }}
                      className={`p-2.5 rounded border text-left flex flex-col gap-1 transition-colors ${
                        newCategory === "web"
                          ? "bg-primary/20 border-primary text-primary"
                          : "border-border text-muted hover:border-fg/30"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <Globe className="w-3.5 h-3.5" />
                        Web Step Module
                      </div>
                      <span className="text-[10px] text-muted">Playwright browser automation</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNewCategory("fixture")
                        setNewTemplateType("fixtureDatabase")
                      }}
                      className={`p-2.5 rounded border text-left flex flex-col gap-1 transition-colors ${
                        newCategory === "fixture"
                          ? "bg-amber-500/20 border-amber-500 text-amber-400"
                          : "border-border text-muted hover:border-fg/30"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <Database className="w-3.5 h-3.5" />
                        Fixture Script
                      </div>
                      <span className="text-[10px] text-muted">Setup & database seed scripts</span>
                    </button>
                  </div>
                </div>

                {/* Target for Web */}
                {newCategory === "web" && (
                  <div>
                    <label className="block text-xs font-medium text-fg mb-1">Web Target</label>
                    <select
                      value={newTarget}
                      onChange={(e) => setNewTarget(e.target.value)}
                      className="w-full px-3 py-1.5 bg-input border border-border rounded text-xs text-fg focus:outline-none focus:border-primary"
                    >
                      {webTargets.length === 0 && <option value="">No web targets in config</option>}
                      {webTargets.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* File Name */}
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">
                    File Path (relative to {newCategory === "web" ? "web/" : "fixtures/"})
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={newCategory === "web" ? "admin/login.ts or checkout.ts" : "database.ts or seed.ts"}
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-input border border-border rounded text-xs font-mono text-fg focus:outline-none focus:border-primary"
                  />
                  <span className="text-[10px] text-muted mt-1 block">
                    Subdirectories (e.g. <code>admin/songs/create.ts</code>) are created automatically.
                  </span>
                </div>

                {/* Starter Template */}
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Starter Template</label>
                  <select
                    value={newTemplateType}
                    onChange={(e) => setNewTemplateType(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-input border border-border rounded text-xs text-fg focus:outline-none focus:border-primary"
                  >
                    {newCategory === "web" ? (
                      <>
                        <option value="webStandard">Standard Web Step (Navigation & Selectors)</option>
                        <option value="webAuth">Authentication Form Step (Login & Redirect)</option>
                        <option value="helperEmpty">Empty Template</option>
                      </>
                    ) : (
                      <>
                        <option value="fixtureDatabase">Database / Shell Command Fixture</option>
                        <option value="helperEmpty">Empty Template</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="p-4 border-t border-border bg-activity flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                >
                  Create Module
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

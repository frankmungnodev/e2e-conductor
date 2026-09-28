import { Plus, Trash2 } from "lucide-react"
import { Button } from "./Button.tsx"
import { Input } from "./FormControls.tsx"

export interface EnvVarRow {
  id: string
  key: string
  value: string
}

export function recordToEnvRows(record?: Record<string, string>): EnvVarRow[] {
  if (!record || Object.keys(record).length === 0) return []
  return Object.entries(record).map(([key, value]) => ({
    id: Math.random().toString(36).slice(2, 9),
    key,
    value: String(value ?? ""),
  }))
}

export function envRowsToRecord(rows: EnvVarRow[]): Record<string, string> | undefined {
  const result: Record<string, string> = {}
  for (const row of rows) {
    const k = row.key.trim()
    if (k) {
      result[k] = row.value
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

export interface EnvVariablesEditorProps {
  rows: EnvVarRow[]
  onChange: (rows: EnvVarRow[]) => void
  disabled?: boolean
}

export function EnvVariablesEditor({ rows, onChange, disabled }: EnvVariablesEditorProps) {
  const handleAdd = () => {
    onChange([
      ...rows,
      {
        id: Math.random().toString(36).slice(2, 9),
        key: "",
        value: "",
      },
    ])
  }

  const handleUpdate = (id: string, field: "key" | "value", val: string) => {
    onChange(
      rows.map((row) => {
        if (row.id === id) {
          return { ...row, [field]: val }
        }
        return row
      }),
    )
  }

  const handleRemove = (id: string) => {
    onChange(rows.filter((row) => row.id !== id))
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-fg-bright">
          Environment Variables
        </label>
        {rows.length > 0 && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={handleAdd}
            disabled={disabled}
            icon={<Plus className="w-3 h-3" />}
          >
            Add Variable
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-4 border border-dashed border-border-light rounded text-center bg-editor/40">
          <p className="text-xs text-fg-muted mb-2">No environment variables configured</p>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={handleAdd}
            disabled={disabled}
            icon={<Plus className="w-3 h-3" />}
          >
            Add Variable
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1 text-xs font-semibold text-fg-muted">
            <div className="flex-1">Variable Name</div>
            <span className="opacity-0 select-none">=</span>
            <div className="flex-1">Value</div>
            <div className="w-7 shrink-0" />
          </div>

          <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    value={row.key}
                    onChange={(e) => handleUpdate(row.id, "key", e.target.value)}
                    placeholder="e.g. API_KEY"
                    disabled={disabled}
                    mono
                  />
                </div>
                <span className="text-fg-muted font-mono select-none text-xs">=</span>
                <div className="flex-1">
                  <Input
                    value={row.value}
                    onChange={(e) => handleUpdate(row.id, "value", e.target.value)}
                    placeholder="e.g. secret_val"
                    disabled={disabled}
                    mono
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(row.id)}
                  disabled={disabled}
                  title="Remove variable"
                  icon={<Trash2 className="w-3.5 h-3.5 text-error" />}
                  className="shrink-0 text-error hover:bg-error/10"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-fg-muted leading-relaxed">
        Environment variables accessible to steps and services during scenario execution.
      </p>
    </div>
  )
}

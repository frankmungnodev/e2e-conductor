import { Input, Textarea } from "../../components/FormControls.tsx"
import { NumberInput } from "../../components/NumberInput.tsx"
import type { StepAction } from "../../types.ts"
import type { StepDriver } from "./stepDefaults.ts"

export interface ActionInputsProps {
  act: StepAction
  actType: string
  stepDriver: StepDriver
  onUpdate: (updates: Partial<StepAction>) => void
}

/** Inputs for HTTP request and shell command actions. */
export function HttpShellActionInputs({ act, actType, onUpdate }: ActionInputsProps) {
  return (
    <>
      {/* HTTP Actions */}
      {actType.startsWith("http_") && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_130px] gap-2 items-start">
            <Input
              size="xs"
              label="URL / Endpoint"
              value={act.url ?? ""}
              onChange={(e) => onUpdate({ url: e.target.value })}
              placeholder="e.g. /api/users or https://api.example.com"
              mono
            />
            <NumberInput
              size="xs"
              label="Expected Status"
              value={act.status ?? 200}
              onChange={(val) => onUpdate({ status: val })}
              min={100}
              max={599}
            />
          </div>
          {["http_post", "http_put", "http_patch"].includes(actType) && (
            <Textarea
              size="xs"
              label="Request Body (JSON)"
              rows={3}
              value={typeof act.body === "object" ? JSON.stringify(act.body, null, 2) : String(act.body ?? "")}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value)
                  onUpdate({ body: parsed })
                } catch {
                  onUpdate({ body: e.target.value })
                }
              }}
              placeholder='{"key": "value"}'
              mono
            />
          )}
        </div>
      )}

      {/* Shell Action */}
      {actType === "shell" && (
        <div className="space-y-2">
          <Input
            size="xs"
            label="Shell Command"
            value={act.command ?? (typeof act.value === "string" ? act.value : "")}
            onChange={(e) => onUpdate({ command: e.target.value })}
            placeholder="e.g. pnpm run seed, curl -sf http://localhost:4173/"
            mono
          />
          <div className="grid grid-cols-[1fr_130px] gap-2 items-start">
            <Input
              size="xs"
              label="Working Directory (Optional)"
              value={act.cwd ?? ""}
              onChange={(e) => onUpdate({ cwd: e.target.value })}
              placeholder="Default: workspace root"
              mono
            />
            <NumberInput
              size="xs"
              label="Expected Exit Code"
              value={act.exit_code ?? 0}
              onChange={(val) => onUpdate({ exit_code: val })}
              min={0}
              max={255}
            />
          </div>
        </div>
      )}
    </>
  )
}

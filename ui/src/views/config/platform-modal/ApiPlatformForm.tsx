import { Checkbox } from "../../../components/Checkbox.tsx"
import { FormField, Input } from "../../../components/FormControls.tsx"
import type { ApiFormValues } from "./platformForms.ts"

export interface ApiPlatformFormProps {
  values: ApiFormValues
  set: <K extends keyof ApiFormValues>(key: K, value: ApiFormValues[K]) => void
  isOverride: boolean
  capitalizedEnv: string
}

export function ApiPlatformForm({ values, set, isOverride, capitalizedEnv }: ApiPlatformFormProps) {
  return (
    <div className="space-y-4 pt-2 border-t border-border">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Target Name"
          hint={isOverride ? "Platform identifier (read-only)" : "Identifier in scenario steps e.g. api"}
          required
        >
          <Input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. api"
            mono
            disabled={isOverride}
          />
        </FormField>

        <FormField
          label="Service Endpoint URL"
          hint={isOverride ? `Root URL where the API runs in ${capitalizedEnv}` : "Root URL where the API service runs"}
          required
        >
          <Input
            value={values.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="e.g. http://localhost:3000"
            mono
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Health Check Path"
          hint="Endpoint used to verify service readiness"
        >
          <Input
            value={values.health}
            onChange={(e) => set("health", e.target.value)}
            placeholder="e.g. /health"
            mono
          />
        </FormField>

        <FormField
          label="Start Command"
          hint={isOverride ? `Command to launch in ${capitalizedEnv} (leave empty if backend already running)` : "Optional command to launch backend service"}
        >
          <Input
            value={values.startCmd}
            onChange={(e) => set("startCmd", e.target.value)}
            placeholder="e.g. pnpm run dev"
            mono
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Working Directory (CWD)"
          hint="Relative path where API start command is run"
        >
          <Input
            value={values.cwd}
            onChange={(e) => set("cwd", e.target.value)}
            placeholder="e.g. apps/api"
            mono
          />
        </FormField>
      </div>

      <div className="pt-1">
        <Checkbox
          size="sm"
          checked={values.exclusive}
          onCheckedChange={(v) => set("exclusive", v)}
          label="Exclusive service (never reuse an already running instance; always start freshly)"
        />
      </div>
    </div>
  )
}

import { Checkbox } from "../../../components/Checkbox.tsx"
import { FormField, Input } from "../../../components/FormControls.tsx"
import { NumberInput } from "../../../components/NumberInput.tsx"
import type { WebFormValues } from "./platformForms.ts"

export interface WebPlatformFormProps {
  values: WebFormValues
  set: <K extends keyof WebFormValues>(key: K, value: WebFormValues[K]) => void
  isOverride: boolean
  capitalizedEnv: string
}

export function WebPlatformForm({ values, set, isOverride, capitalizedEnv }: WebPlatformFormProps) {
  return (
    <div className="space-y-4 pt-2 border-t border-border">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Target Name"
          hint={isOverride ? "Platform identifier (read-only)" : "Identifier in scenario steps e.g. web"}
          required
        >
          <Input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. web"
            mono
            disabled={isOverride}
          />
        </FormField>

        <FormField
          label="Application URL"
          hint={isOverride ? `Address where web app runs in ${capitalizedEnv}` : "Address where web app runs"}
          required
        >
          <Input
            value={values.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="e.g. http://localhost:5173"
            mono
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Dev Start Command"
          hint={isOverride ? `Command to launch in ${capitalizedEnv} (leave empty if already running)` : "Optional command to launch app automatically"}
        >
          <Input
            value={values.startCmd}
            onChange={(e) => set("startCmd", e.target.value)}
            placeholder="e.g. pnpm run dev"
            mono
          />
        </FormField>

        <FormField
          label="Working Directory (CWD)"
          hint="Relative path where start command is executed"
        >
          <Input
            value={values.cwd}
            onChange={(e) => set("cwd", e.target.value)}
            placeholder="e.g. apps/frontend"
            mono
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Modules Directory"
          hint="Location for Playwright action modules"
        >
          <Input
            value={values.modules}
            onChange={(e) => set("modules", e.target.value)}
            placeholder="e.g. .e2e/modules/web"
            mono
          />
        </FormField>

        <FormField
          label="Slow-Mo Delay (ms)"
          hint="Action slowdown for visual debugging"
        >
          <NumberInput
            value={values.slowMo}
            onChange={(val) => set("slowMo", val ?? 0)}
            min={0}
            step={25}
            suffix="ms"
          />
        </FormField>
      </div>

      <FormField
        label="Needs Platforms"
        hint="Platforms this web app calls (comma separated), e.g. api. Their services are started and checked whenever it runs. Applies to every environment."
      >
        <Input
          value={values.needs}
          onChange={(e) => set("needs", e.target.value)}
          placeholder="e.g. api"
          mono
        />
      </FormField>

      <div className="space-y-2 pt-1">
        <Checkbox
          size="sm"
          checked={values.headless}
          onCheckedChange={(v) => set("headless", v)}
          label="Run browser in headless mode (no visual browser window)"
        />

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

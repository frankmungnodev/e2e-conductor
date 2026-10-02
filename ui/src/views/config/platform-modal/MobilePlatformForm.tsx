import { FormField, Input } from "../../../components/FormControls.tsx"
import type { MobileFormValues } from "./platformForms.ts"

export interface MobilePlatformFormProps {
  values: MobileFormValues
  set: <K extends keyof MobileFormValues>(key: K, value: MobileFormValues[K]) => void
  isOverride: boolean
}

export function MobilePlatformForm({ values, set, isOverride }: MobilePlatformFormProps) {
  return (
    <div className="space-y-4 pt-2 border-t border-border">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Target Name"
          hint={isOverride ? "Platform identifier (read-only)" : "Identifier in scenario steps e.g. app"}
          required
        >
          <Input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. app"
            mono
            disabled={isOverride}
          />
        </FormField>

        <FormField
          label="Application ID (Package)"
          hint="Android package name to test"
          required
        >
          <Input
            value={values.appId}
            onChange={(e) => set("appId", e.target.value)}
            placeholder="e.g. com.example.app"
            mono
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Flows Directory"
          hint="Folder for YAML mobile action flows"
        >
          <Input
            value={values.flows}
            onChange={(e) => set("flows", e.target.value)}
            placeholder="e.g. .e2e/flows"
            mono
          />
        </FormField>

        <FormField
          label="Install Command"
          hint="Command to build/install debug APK"
        >
          <Input
            value={values.installCmd}
            onChange={(e) => set("installCmd", e.target.value)}
            placeholder="e.g. ./gradlew installDebug"
            mono
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Working Directory (CWD)"
          hint="Relative path for install command execution"
        >
          <Input
            value={values.cwd}
            onChange={(e) => set("cwd", e.target.value)}
            placeholder="e.g. apps/mobile"
            mono
          />
        </FormField>

        <FormField
          label="Reverse Port Forwarding"
          hint="Forward local host ports to device (comma separated)"
        >
          <Input
            value={values.reversePorts}
            onChange={(e) => set("reversePorts", e.target.value)}
            placeholder="e.g. 8080, 8787"
            mono
          />
        </FormField>
      </div>

      <FormField
        label="Grant Runtime Permissions"
        hint="Android permissions to auto-grant on launch (comma separated)"
      >
        <Input
          value={values.grantPermissions}
          onChange={(e) => set("grantPermissions", e.target.value)}
          placeholder="e.g. android.permission.POST_NOTIFICATIONS, android.permission.CAMERA"
          mono
        />
      </FormField>
    </div>
  )
}

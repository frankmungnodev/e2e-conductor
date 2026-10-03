import { Check, Layers, RotateCcw, SlidersHorizontal } from "lucide-react"
import { useEffect, useState } from "react"
import { deleteEnvPlatform, detectWorkspaceProjects, saveEnvPlatform, savePlatform } from "../../../api.ts"
import { Button } from "../../../components/Button.tsx"
import { Checkbox } from "../../../components/Checkbox.tsx"
import { Modal } from "../../../components/Modal.tsx"
import { useToast } from "../../../components/Toast.tsx"
import { capitalize } from "../../../format.ts"
import type {
  ConfigMeta,
  DetectedService,
  EnvPlatformRecord,
  PlatformWithEnvOverrides,
  WizardComponentType,
} from "../../../types.ts"
import { ApiPlatformForm } from "./ApiPlatformForm.tsx"
import { DetectionHints } from "./DetectionHints.tsx"
import { MobilePlatformForm } from "./MobilePlatformForm.tsx"
import { PlatformTypePicker } from "./PlatformTypePicker.tsx"
import {
  API_DEFAULTS,
  buildNewPlatform,
  buildOverridePayload,
  detectApi,
  detectMobile,
  detectWeb,
  extractComponentsFromConfig,
  MOBILE_DEFAULTS,
  overrideFormValues,
  useFormValues,
  WEB_DEFAULTS,
} from "./platformForms.ts"
import { WebPlatformForm } from "./WebPlatformForm.tsx"

export interface PlatformModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  config?: ConfigMeta
  overridePlatform?: PlatformWithEnvOverrides | null
  targetEnv?: string
  allEnvPlatforms?: EnvPlatformRecord[]
}

export function PlatformModal({
  isOpen,
  onClose,
  onSaved,
  config,
  overridePlatform,
  targetEnv,
  allEnvPlatforms,
}: PlatformModalProps) {
  const isOverride = Boolean(overridePlatform && targetEnv)
  const capitalizedEnv = targetEnv
    ? capitalize(targetEnv)
    : ""
  const pivot = allEnvPlatforms?.find(
    (ep) => ep.envName === targetEnv && ep.platformId === overridePlatform?.id,
  )
  const hasExistingOverrides = Boolean(
    overridePlatform?.hasOverrides ||
      (pivot &&
        (pivot.url !== undefined ||
          pivot.startCmd !== undefined ||
          pivot.health !== undefined ||
          pivot.cwd !== undefined ||
          pivot.headless !== undefined ||
          pivot.slowMo !== undefined ||
          pivot.appId !== undefined ||
          pivot.configJson !== undefined)),
  )

  const [platform, setPlatform] = useState<WizardComponentType>("web")
  const [detected, setDetected] = useState<DetectedService[]>([])
  const [isApplying, setIsApplying] = useState(false)
  const [scaffoldFiles, setScaffoldFiles] = useState(true)

  const web = useFormValues(WEB_DEFAULTS)
  const mobile = useFormValues(MOBILE_DEFAULTS)
  const api = useFormValues(API_DEFAULTS)
  const forms = { web: web.values, mobile: mobile.values, api: api.values }

  const { error: toastError, success: toastSuccess } = useToast()

  // Initialize or reset state when modal opens
  useEffect(() => {
    if (!isOpen) return
    // A scan from an earlier open must not overwrite the values of a later one.
    let ignore = false

    if (overridePlatform && targetEnv) {
      setPlatform(overridePlatform.type)
      const currentPivot = allEnvPlatforms?.find(
        (ep) => ep.envName === targetEnv && ep.platformId === overridePlatform.id,
      )
      const loaded = overrideFormValues(overridePlatform, currentPivot)
      if (loaded.web) web.setValues(loaded.web)
      if (loaded.mobile) mobile.setValues(loaded.mobile)
      if (loaded.api) api.setValues(loaded.api)
    } else {
      setPlatform("web")
      web.setValues(WEB_DEFAULTS)
      mobile.setValues(MOBILE_DEFAULTS)
      api.setValues(API_DEFAULTS)

      detectWorkspaceProjects()
        .then((res) => {
          if (ignore) return
          const found = res.detected ?? []
          setDetected(found)
          if (found.length > 0) {
            applyDetection(found[0])
          }
        })
        .catch(() => {
          // ignore scan errors
        })
    }
    return () => {
      ignore = true
    }
  }, [isOpen, overridePlatform, targetEnv, allEnvPlatforms])

  const applyDetection = (det: DetectedService) => {
    setPlatform(det.suggestedType)
    if (det.suggestedType === "web") web.setValues((current) => detectWeb(current, det))
    else if (det.suggestedType === "android") mobile.setValues((current) => detectMobile(current, det))
    else if (det.suggestedType === "api") api.setValues((current) => detectApi(current, det))
  }

  const handleResetOverrides = async () => {
    if (!overridePlatform || !targetEnv) return
    setIsApplying(true)
    try {
      await deleteEnvPlatform(targetEnv, overridePlatform.id)
      toastSuccess(
        `Reset overrides for "${overridePlatform.name}" in ${capitalizedEnv}`,
        "Defaults Restored",
      )
      onSaved()
      onClose()
    } catch (err) {
      toastError((err as Error).message, "Failed to Reset Overrides")
    } finally {
      setIsApplying(false)
    }
  }

  const handleSubmit = async () => {
    if (isOverride && overridePlatform && targetEnv) {
      const currentPivot = allEnvPlatforms?.find(
        (ep) => ep.envName === targetEnv && ep.platformId === overridePlatform.id,
      )
      const isPlatEnabled = currentPivot
        ? currentPivot.enabled
        : overridePlatform.enabled !== false

      const built = buildOverridePayload(platform, forms, {
        envName: targetEnv,
        platformId: overridePlatform.id,
        enabled: isPlatEnabled,
      })
      if (!built.ok) {
        toastError(built.error, "Validation Error")
        return
      }

      setIsApplying(true)
      try {
        await saveEnvPlatform(built.value)
        toastSuccess(
          `Saved overrides for "${overridePlatform.name}" in ${capitalizedEnv}`,
          "Overrides Saved",
        )
        onSaved()
        onClose()
      } catch (err) {
        toastError((err as Error).message, "Failed to Save Overrides")
      } finally {
        setIsApplying(false)
      }
      return
    }

    const built = buildNewPlatform(platform, forms)
    if (!built.ok) {
      toastError(built.error, "Validation Error")
      return
    }
    const component = built.value

    const existingComponents = extractComponentsFromConfig(config)
    if (
      existingComponents.some(
        (c) => c.name.toLowerCase() === component.name.toLowerCase(),
      )
    ) {
      toastError(
        `A platform named "${component.name}" already exists. Please choose a different name.`,
        "Validation Error",
      )
      return
    }

    setIsApplying(true)
    try {
      await savePlatform(component, scaffoldFiles)
      toastSuccess(
        `Platform "${component.name}" added`,
        "Platform Added",
      )
      onSaved()
      onClose()
    } catch (err) {
      toastError((err as Error).message, "Failed to Add Platform")
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissable={true}
      maxWidth="xl"
      title={
        <div className="flex items-center gap-2">
          {isOverride ? (
            <>
              <SlidersHorizontal className="w-4 h-4 text-primary" />
              <span>
                Platform Overrides: {overridePlatform?.name} ({capitalizedEnv})
              </span>
            </>
          ) : (
            <>
              <Layers className="w-4 h-4 text-primary" />
              <span>Add Platform</span>
            </>
          )}
        </div>
      }
      description={
        isOverride
          ? `Configure environment-specific settings for "${capitalizedEnv}". Values take precedence over default platform settings.`
          : "Configure a new platform (Web, Android, or REST API) for this project."
      }
      footer={
        <div className="flex items-center justify-between w-full">
          {isOverride ? (
            hasExistingOverrides ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={handleResetOverrides}
                disabled={isApplying}
                icon={<RotateCcw className="w-3.5 h-3.5 text-warning" />}
              >
                Reset Defaults
              </Button>
            ) : (
              <div />
            )
          ) : (
            <Checkbox
              size="sm"
              checked={scaffoldFiles}
              onCheckedChange={setScaffoldFiles}
              label="Scaffold starter test files and smoke scenario"
            />
          )}

          <div className="flex items-center gap-2">
            <Button size="xs" variant="ghost" onClick={onClose} disabled={isApplying}>
              Cancel
            </Button>
            <Button
              size="xs"
              variant="primary"
              onClick={handleSubmit}
              isLoading={isApplying}
              icon={<Check className="w-3.5 h-3.5" />}
            >
              {isOverride ? "Save Overrides" : "Add Platform"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Workspace Detected Banner */}
        {detected.length > 0 && !isOverride && (
          <DetectionHints detected={detected} applyDetection={applyDetection} />
        )}

        {/* Platform Selection */}
        <PlatformTypePicker platform={platform} setPlatform={setPlatform} isOverride={isOverride} />

        {platform === "web" && (
          <WebPlatformForm values={web.values} set={web.set} isOverride={isOverride} capitalizedEnv={capitalizedEnv} />
        )}
        {platform === "android" && (
          <MobilePlatformForm values={mobile.values} set={mobile.set} isOverride={isOverride} />
        )}
        {platform === "api" && (
          <ApiPlatformForm values={api.values} set={api.set} isOverride={isOverride} capitalizedEnv={capitalizedEnv} />
        )}
      </div>
    </Modal>
  )
}

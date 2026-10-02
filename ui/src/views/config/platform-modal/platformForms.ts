import { useCallback, useState } from "react"
import type {
  ConfigMeta,
  DetectedService,
  EnvPlatformRecord,
  PlatformWithEnvOverrides,
  WizardComponent,
  WizardComponentType,
} from "../../../types.ts"

export type WebFormValues = {
  name: string
  url: string
  startCmd: string
  cwd: string
  modules: string
  slowMo: number
  headless: boolean
  exclusive: boolean
}

export type MobileFormValues = {
  name: string
  appId: string
  flows: string
  installCmd: string
  cwd: string
  reversePorts: string
  grantPermissions: string
}

export type ApiFormValues = {
  name: string
  url: string
  health: string
  startCmd: string
  cwd: string
  exclusive: boolean
}

export type PlatformForms = { web: WebFormValues; mobile: MobileFormValues; api: ApiFormValues }

export const WEB_DEFAULTS: WebFormValues = {
  name: "web",
  url: "http://localhost:5173",
  startCmd: "pnpm run dev",
  cwd: "",
  modules: ".e2e/modules/web",
  slowMo: 50,
  headless: false,
  exclusive: false,
}

export const MOBILE_DEFAULTS: MobileFormValues = {
  name: "app",
  appId: "com.example.app",
  flows: ".e2e/flows",
  installCmd: "./gradlew installDebug",
  cwd: "",
  reversePorts: "8080",
  grantPermissions: "",
}

export const API_DEFAULTS: ApiFormValues = {
  name: "api",
  url: "http://localhost:3000",
  health: "/health",
  startCmd: "pnpm run dev",
  cwd: "",
  exclusive: false,
}

/** Form state as one object, with a typed single-field setter. */
export function useFormValues<T extends object>(defaults: T) {
  const [values, setValues] = useState<T>(defaults)
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
  }, [])
  return { values, set, setValues }
}

/** Form values for editing an existing platform's overrides in one environment. */
export function overrideFormValues(
  overridePlatform: PlatformWithEnvOverrides,
  currentPivot: EnvPlatformRecord | undefined,
): Partial<PlatformForms> {
  const cfg = (currentPivot?.configJson || overridePlatform.configJson) as Record<string, unknown> | undefined

  if (overridePlatform.type === "web") {
    return {
      web: {
        name: overridePlatform.name,
        url: currentPivot?.url ?? overridePlatform.url ?? "http://localhost:5173",
        startCmd: currentPivot?.startCmd ?? overridePlatform.startCmd ?? "",
        cwd: currentPivot?.cwd ?? overridePlatform.cwd ?? "",
        modules: (cfg?.modules as string) ?? overridePlatform.modules ?? ".e2e/modules/web",
        slowMo: currentPivot?.slowMo ?? overridePlatform.slowMo ?? 50,
        headless: currentPivot?.headless ?? overridePlatform.headless ?? false,
        exclusive: (cfg?.exclusive as boolean) ?? overridePlatform.exclusive ?? false,
      },
    }
  }
  if (overridePlatform.type === "android") {
    const ports = (cfg?.reversePorts as number[]) ?? overridePlatform.reversePorts ?? []
    const perms = (cfg?.grantPermissions as string[]) ?? overridePlatform.grantPermissions ?? []
    return {
      mobile: {
        name: overridePlatform.name,
        appId: currentPivot?.appId ?? overridePlatform.appId ?? "com.example.app",
        flows: (cfg?.flows as string) ?? overridePlatform.flows ?? ".e2e/flows",
        installCmd: (cfg?.installCmd as string) ?? overridePlatform.installCmd ?? "./gradlew installDebug",
        cwd: currentPivot?.cwd ?? overridePlatform.cwd ?? "",
        reversePorts: ports.length > 0 ? ports.join(", ") : "8080",
        grantPermissions: perms.join(", "),
      },
    }
  }
  if (overridePlatform.type === "api") {
    return {
      api: {
        name: overridePlatform.name,
        url: currentPivot?.url ?? overridePlatform.url ?? "http://localhost:3000",
        health: currentPivot?.health ?? overridePlatform.health ?? "/health",
        startCmd: currentPivot?.startCmd ?? overridePlatform.startCmd ?? "",
        cwd: currentPivot?.cwd ?? overridePlatform.cwd ?? "",
        exclusive: (cfg?.exclusive as boolean) ?? overridePlatform.exclusive ?? false,
      },
    }
  }
  return {}
}

/** Applies a web workspace detection result on top of the current web form values. */
export function detectWeb(current: WebFormValues, det: DetectedService): WebFormValues {
  const web = { ...current, name: det.name || "web" }
  web.url = det.port ? `http://localhost:${det.port}` : "http://localhost:5173"
  if (det.startCmd) web.startCmd = det.startCmd
  if (det.path && det.path !== ".") web.cwd = det.path
  return web
}

/** Applies an Android workspace detection result on top of the current mobile form values. */
export function detectMobile(current: MobileFormValues, det: DetectedService): MobileFormValues {
  const mobile = { ...current, name: det.name || "app" }
  if (det.appId) mobile.appId = det.appId
  if (det.startCmd) mobile.installCmd = det.startCmd
  if (det.path && det.path !== ".") mobile.cwd = det.path
  return mobile
}

/** Applies an API workspace detection result on top of the current API form values. */
export function detectApi(current: ApiFormValues, det: DetectedService): ApiFormValues {
  const api = { ...current, name: det.name || "api" }
  api.url = det.port ? `http://localhost:${det.port}` : "http://localhost:3000"
  if (det.startCmd) api.startCmd = det.startCmd
  if (det.path && det.path !== ".") api.cwd = det.path
  return api
}

function parsePorts(text: string): number[] {
  return text
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0)
}

function parseList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export type BuildResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** The environment override record for the selected platform type, or the validation error to show. */
export function buildOverridePayload(
  platform: WizardComponentType,
  forms: PlatformForms,
  base: { envName: string; platformId: string; enabled: boolean },
): BuildResult<EnvPlatformRecord> {
  const { web, mobile, api } = forms
  if (platform === "web") {
    if (!web.url.trim()) return { ok: false, error: "Please enter an application URL" }
    return {
      ok: true,
      value: {
        ...base,
        url: web.url.trim(),
        startCmd: web.startCmd.trim(),
        cwd: web.cwd.trim(),
        headless: web.headless,
        slowMo: web.slowMo || undefined,
        configJson: {
          modules: web.modules.trim() || undefined,
          exclusive: web.exclusive,
        },
      },
    }
  }
  if (platform === "android") {
    if (!mobile.appId.trim()) return { ok: false, error: "Please enter an Application ID" }
    const ports = parsePorts(mobile.reversePorts)
    const permissions = parseList(mobile.grantPermissions)
    return {
      ok: true,
      value: {
        ...base,
        cwd: mobile.cwd.trim(),
        appId: mobile.appId.trim(),
        configJson: {
          flows: mobile.flows.trim() || undefined,
          installCmd: mobile.installCmd.trim() || undefined,
          reversePorts: ports.length > 0 ? ports : undefined,
          grantPermissions: permissions.length > 0 ? permissions : undefined,
        },
      },
    }
  }
  if (!api.url.trim()) return { ok: false, error: "Please enter a service endpoint URL" }
  return {
    ok: true,
    value: {
      ...base,
      url: api.url.trim(),
      health: api.health.trim(),
      startCmd: api.startCmd.trim(),
      cwd: api.cwd.trim(),
      configJson: {
        exclusive: api.exclusive,
      },
    },
  }
}

/** The new platform for the selected type, or the validation error to show. */
export function buildNewPlatform(platform: WizardComponentType, forms: PlatformForms): BuildResult<WizardComponent> {
  const { web, mobile, api } = forms
  if (platform === "web") {
    if (!web.name.trim()) return { ok: false, error: "Please enter a target name for the web platform" }
    if (!web.url.trim()) return { ok: false, error: "Please enter a web application URL" }
    return {
      ok: true,
      value: {
        id: `web-${Date.now()}`,
        type: "web",
        name: web.name.trim(),
        order: 1,
        url: web.url.trim(),
        startCmd: web.startCmd.trim() || undefined,
        cwd: web.cwd.trim() || undefined,
        modules: web.modules.trim() || ".e2e/modules/web",
        slowMo: web.slowMo || undefined,
        headless: web.headless,
        exclusive: web.exclusive,
      },
    }
  }
  if (platform === "android") {
    if (!mobile.name.trim()) return { ok: false, error: "Please enter a target name for the mobile platform" }
    if (!mobile.appId.trim()) return { ok: false, error: "Please enter an Application ID" }
    const ports = parsePorts(mobile.reversePorts)
    const permissions = parseList(mobile.grantPermissions)
    return {
      ok: true,
      value: {
        id: `mobile-${Date.now()}`,
        type: "android",
        name: mobile.name.trim(),
        order: 1,
        appId: mobile.appId.trim(),
        flows: mobile.flows.trim() || ".e2e/flows",
        installCmd: mobile.installCmd.trim() || undefined,
        cwd: mobile.cwd.trim() || undefined,
        reversePorts: ports.length > 0 ? ports : undefined,
        grantPermissions: permissions.length > 0 ? permissions : undefined,
      },
    }
  }
  if (!api.name.trim()) return { ok: false, error: "Please enter a target name for the API platform" }
  if (!api.url.trim()) return { ok: false, error: "Please enter a service endpoint URL" }
  return {
    ok: true,
    value: {
      id: `api-${Date.now()}`,
      type: "api",
      name: api.name.trim(),
      order: 1,
      url: api.url.trim(),
      health: api.health.trim() || undefined,
      startCmd: api.startCmd.trim() || undefined,
      cwd: api.cwd.trim() || undefined,
      exclusive: api.exclusive,
    },
  }
}

export function extractComponentsFromConfig(config?: ConfigMeta): WizardComponent[] {
  if (!config?.targets) return []
  const components: WizardComponent[] = []
  let order = 1

  for (const [name, target] of Object.entries(config.targets)) {
    if (target.driver === "web") {
      components.push({
        id: `web-${name}`,
        type: "web",
        name,
        order: order++,
        service: target.service,
        url: config.services?.[target.service]?.url,
        startCmd: config.services?.[target.service]?.startCmd,
        cwd: config.services?.[target.service]?.startCwd,
        modules: target.modules,
        slowMo: target.slowMo,
        headless: target.headless,
      })
    } else if (target.driver === "mobile") {
      components.push({
        id: `mobile-${name}`,
        type: "android",
        name,
        order: order++,
        appId: target.appId,
        flows: target.flows,
        installCmd: target.install?.cmd,
        cwd: target.install?.cwd,
        reversePorts: target.reversePorts,
      })
    } else if (target.driver === "http") {
      components.push({
        id: `api-${name}`,
        type: "api",
        name,
        order: order++,
        url: config.services?.[target.service]?.url || "http://localhost:3000",
        health: config.services?.[target.service]?.health,
        startCmd: config.services?.[target.service]?.startCmd,
        cwd: config.services?.[target.service]?.startCwd,
      })
    }
  }
  return components
}

// Unit tests for the pure helpers extracted from the UI views. Expected values follow the
// behavior of the original components (PlatformModal, RunnerView) before the split.
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getTargetBadgeVariant, getTargetDriver } from "../ui/src/targetDriver.ts"
import type { ConfigMeta, DetectedService, EnvPlatformRecord, PlatformWithEnvOverrides, RunEvent, ScenarioItem } from "../ui/src/types.ts"
import { exportSummary } from "../ui/src/views/config/exportSummary.ts"
import {
  API_DEFAULTS,
  buildNewPlatform,
  buildOverridePayload,
  detectApi,
  detectMobile,
  detectWeb,
  MOBILE_DEFAULTS,
  overrideFormValues,
  type PlatformForms,
  WEB_DEFAULTS,
} from "../ui/src/views/config/platform-modal/platformForms.ts"
import { buildExecutionTree } from "../ui/src/views/runner/executionTree.ts"

const defaults = (): PlatformForms => ({ web: { ...WEB_DEFAULTS }, mobile: { ...MOBILE_DEFAULTS }, api: { ...API_DEFAULTS } })
const base = { envName: "dev", platformId: "plat-x", enabled: true }

function platform(fields: Partial<PlatformWithEnvOverrides>): PlatformWithEnvOverrides {
  return { id: "plat-x", name: "x", enabled: true, ...fields } as PlatformWithEnvOverrides
}

describe("overrideFormValues", () => {
  it("prefers the environment pivot, then the base platform, then the form default (web)", () => {
    const plat = platform({ type: "web", name: "site", url: "http://base", startCmd: "base-start", modules: "./m", slowMo: 10 })
    const pivot = { envName: "dev", platformId: "plat-x", enabled: true, url: "http://pivot", headless: true } as EnvPlatformRecord
    assert.deepEqual(overrideFormValues(plat, pivot), {
      web: {
        name: "site",
        url: "http://pivot",
        startCmd: "base-start",
        cwd: "",
        modules: "./m",
        slowMo: 10,
        headless: true,
        exclusive: false,
      },
    })
  })

  it("loads Android fields, joining ports and permissions, with 8080 when no ports are set", () => {
    const plat = platform({ type: "android", name: "phone", appId: "com.base", grantPermissions: ["a.CAMERA", "b.MIC"] })
    const pivot = { envName: "dev", platformId: "plat-x", enabled: true, appId: "com.pivot", configJson: { flows: "./f" } } as EnvPlatformRecord
    assert.deepEqual(overrideFormValues(plat, pivot).mobile, {
      name: "phone",
      appId: "com.pivot",
      flows: "./f",
      installCmd: "./gradlew installDebug",
      cwd: "",
      reversePorts: "8080",
      grantPermissions: "a.CAMERA, b.MIC",
    })
    assert.equal(overrideFormValues(platform({ type: "android", reversePorts: [3000, 4000] }), undefined).mobile?.reversePorts, "3000, 4000")
  })

  it("loads REST API fields and only replaces the matching platform type", () => {
    const loaded = overrideFormValues(platform({ type: "api", name: "backend", health: "/up", exclusive: true }), undefined)
    assert.deepEqual(Object.keys(loaded), ["api"])
    assert.deepEqual(loaded.api, {
      name: "backend",
      url: "http://localhost:3000",
      health: "/up",
      startCmd: "",
      cwd: "",
      exclusive: true,
    })
  })
})

describe("workspace detection", () => {
  const det = (fields: Partial<DetectedService>) => ({ name: "", suggestedType: "web", ...fields }) as DetectedService

  it("sets name and URL always, and start command and cwd only when detected", () => {
    const current = { ...WEB_DEFAULTS, startCmd: "mine", cwd: "keep" }
    assert.deepEqual(detectWeb(current, det({ name: "shop", port: 4000 })), {
      ...current,
      name: "shop",
      url: "http://localhost:4000",
    })
    assert.equal(detectWeb(current, det({ path: "apps/web" })).cwd, "apps/web")
    assert.equal(detectWeb(current, det({ path: "." })).cwd, "keep")
    assert.equal(detectWeb(current, det({})).url, "http://localhost:5173")
  })

  it("maps an Android start command to the install command and keeps the URL-less fields", () => {
    const result = detectMobile({ ...MOBILE_DEFAULTS }, det({ suggestedType: "android", appId: "com.found", startCmd: "make install" }))
    assert.equal(result.name, "app")
    assert.equal(result.appId, "com.found")
    assert.equal(result.installCmd, "make install")
  })

  it("defaults an API without a port to localhost:3000", () => {
    assert.equal(detectApi({ ...API_DEFAULTS, url: "http://other" }, det({ suggestedType: "api", name: "svc" })).url, "http://localhost:3000")
  })
})

describe("buildOverridePayload", () => {
  it("trims web fields and nests modules and exclusive in configJson", () => {
    const forms = defaults()
    forms.web = { ...forms.web, url: " http://x ", startCmd: " s ", modules: " ", slowMo: 0 }
    assert.deepEqual(buildOverridePayload("web", forms, base), {
      ok: true,
      value: {
        ...base,
        url: "http://x",
        startCmd: "s",
        cwd: "",
        headless: false,
        slowMo: undefined,
        configJson: { modules: undefined, exclusive: false },
      },
    })
  })

  it("parses Android ports and permissions, dropping invalid entries", () => {
    const forms = defaults()
    forms.mobile = { ...forms.mobile, reversePorts: "8080, abc, -1, 9090", grantPermissions: " a.X , ,b.Y" }
    const result = buildOverridePayload("android", forms, base)
    assert.ok(result.ok)
    assert.deepEqual(result.value.configJson, {
      flows: ".e2e/flows",
      installCmd: "./gradlew installDebug",
      reversePorts: [8080, 9090],
      grantPermissions: ["a.X", "b.Y"],
    })
  })

  it("returns the original validation messages for a missing required field", () => {
    const forms = defaults()
    forms.web.url = " "
    forms.mobile.appId = ""
    forms.api.url = ""
    assert.deepEqual(buildOverridePayload("web", forms, base), { ok: false, error: "Please enter an application URL" })
    assert.deepEqual(buildOverridePayload("android", forms, base), { ok: false, error: "Please enter an Application ID" })
    assert.deepEqual(buildOverridePayload("api", forms, base), { ok: false, error: "Please enter a service endpoint URL" })
  })
})

describe("buildNewPlatform", () => {
  it("checks the target name before the URL, with the original messages", () => {
    const forms = defaults()
    forms.web = { ...forms.web, name: "", url: "" }
    forms.mobile = { ...forms.mobile, name: "", appId: "" }
    forms.api = { ...forms.api, name: "", url: "" }
    assert.deepEqual(buildNewPlatform("web", forms), { ok: false, error: "Please enter a target name for the web platform" })
    assert.deepEqual(buildNewPlatform("android", forms), { ok: false, error: "Please enter a target name for the mobile platform" })
    assert.deepEqual(buildNewPlatform("api", forms), { ok: false, error: "Please enter a target name for the API platform" })
    forms.web.name = "w"
    assert.deepEqual(buildNewPlatform("web", forms), { ok: false, error: "Please enter a web application URL" })
  })

  it("falls back to default modules and flows folders and omits empty optional fields", () => {
    const forms = defaults()
    forms.web = { ...forms.web, modules: " ", startCmd: "", cwd: "" }
    forms.mobile = { ...forms.mobile, flows: "", installCmd: "", reversePorts: "", grantPermissions: "" }
    const web = buildNewPlatform("web", forms)
    const mobile = buildNewPlatform("android", forms)
    assert.ok(web.ok && mobile.ok)
    assert.equal(web.value.modules, ".e2e/modules/web")
    assert.equal(web.value.startCmd, undefined)
    assert.equal(mobile.value.flows, ".e2e/flows")
    assert.equal(mobile.value.reversePorts, undefined)
    assert.equal(mobile.value.grantPermissions, undefined)
  })
})

describe("buildExecutionTree", () => {
  const scenarios = [
    { id: "s1", name: "One", steps: [{ name: "a", target: "shell" }, { name: "b", target: "shell" }] },
  ] as unknown as ScenarioItem[]

  it("creates one pending entry per iteration with the scenario's configured steps", () => {
    const tree = buildExecutionTree(
      [{ type: "run_start", runId: "r", totalScenarios: 1, repeat: 2, scenarios: [{ id: "s1", name: "One", stepsCount: 2 }] }],
      scenarios,
    )
    assert.deepEqual(
      tree.map((s) => [s.iteration, s.totalIterations, s.status, s.steps.map((st) => st.status)]),
      [
        [1, 2, "pending", ["pending", "pending"]],
        [2, 2, "pending", ["pending", "pending"]],
      ],
    )
  })

  it("applies step results to the running iteration and records the failing step's error", () => {
    const events: RunEvent[] = [
      { type: "run_start", runId: "r", totalScenarios: 1, repeat: 2, scenarios: [{ id: "s1", name: "One", stepsCount: 2 }] },
      { type: "scenario_start", scenarioId: "s1", scenarioName: "One", iteration: 1, totalIterations: 2 },
      { type: "step_pass", scenarioId: "s1", stepName: "a", target: "shell", index: 0, duration_ms: 5 },
      { type: "step_fail", scenarioId: "s1", stepName: "b", target: "shell", index: 1, duration_ms: 7, error: "boom" },
      { type: "scenario_end", scenarioId: "s1", iteration: 1, passed: false, duration_ms: 12, error: "boom" },
      { type: "scenario_start", scenarioId: "s1", scenarioName: "One", iteration: 2, totalIterations: 2 },
      { type: "step_start", scenarioId: "s1", stepName: "extra", target: "web", index: 2, totalSteps: 3 },
    ]
    const [first, second] = buildExecutionTree(events, scenarios)
    assert.equal(first.status, "failed")
    assert.equal(first.duration_ms, 12)
    assert.deepEqual(first.steps[1], { name: "b", target: "shell", status: "failed", duration_ms: 7, error: "boom" })
    assert.equal(second.status, "running")
    // A step index the scenario did not configure is added from the event itself.
    assert.deepEqual(second.steps[2], { name: "extra", target: "web", status: "running" })
  })
})

describe("getTargetDriver", () => {
  const config = { targets: { app: { driver: "web" }, backend: { driver: "http" } } } as unknown as ConfigMeta

  it("uses the configured driver before guessing from the name", () => {
    assert.equal(getTargetDriver("app", config), "web")
    assert.equal(getTargetBadgeVariant("app", config), "driver-web")
  })

  it("guesses from the name when the target is not configured", () => {
    assert.equal(getTargetDriver("shell"), "shell")
    assert.equal(getTargetDriver("web-admin"), "web")
    assert.equal(getTargetDriver("mobile-app"), "mobile")
    assert.equal(getTargetDriver("payments"), "http")
    assert.equal(getTargetBadgeVariant("payments"), "driver-http")
  })
})

describe("exportSummary", () => {
  it("pluralizes scenario and preset counts", () => {
    assert.equal(exportSummary(2, 1), "Exported 2 scenarios and 1 preset to JSON files")
    assert.equal(exportSummary(1, 0), "Exported 1 scenario and 0 presets to JSON files")
  })
})

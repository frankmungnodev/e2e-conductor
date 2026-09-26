import type { ChildProcess } from "node:child_process"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { LoadedConfig, MobileTarget, ServiceConfig } from "./config.ts"
import { color, type RunLog } from "./logger.ts"
import { adbPath, runShell, sleep, startBackground, stopBackground } from "./process.ts"

export type StartedService = { name: string; process: ChildProcess; pidFile: string }

/** Stop a service this run started, and forget its pid file. */
export function stopService(started: StartedService) {
  stopBackground(started.process)
  rmSync(started.pidFile, { force: true })
}

/**
 * Stop a service left running by an earlier run that crashed before its cleanup. Only a
 * process group named in that run's pid file is touched, never one started by hand.
 */
async function stopLeftover(pidFile: string, service: ServiceConfig): Promise<boolean> {
  if (!existsSync(pidFile)) return false
  const groupId = Number(readFileSync(pidFile, "utf8"))
  rmSync(pidFile, { force: true })
  try {
    process.kill(-groupId, "SIGTERM")
  } catch {
    return false // already gone, so what is running now is not ours
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(500)
    if (!(await isUp(service))) return true
  }
  return false
}

async function isUp(service: ServiceConfig): Promise<boolean> {
  try {
    const response = await fetch(new URL(service.health ?? "/", service.url), { signal: AbortSignal.timeout(3000) })
    return response.status < 500
  } catch {
    return false
  }
}

/**
 * Check every service. With `start`, launch the ones that are down and wait for them.
 * Returns the services this run started, so they can be stopped at the end.
 */
const UNFINISHED_GIT_OPERATIONS = ["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"]

/**
 * A service's repo in the middle of a rebase or merge (e.g. an IDE's automatic pull that hit a
 * conflict) serves half-applied code with conflict markers, which fails steps far from the cause.
 * Returns what is unfinished, or undefined when the repo is clean or not a git repo.
 */
function unfinishedGitOperation(cwd: string): string | undefined {
  const result = spawnSync("git", ["-C", cwd, "rev-parse", "--absolute-git-dir"], { encoding: "utf8" })
  if (result.status !== 0) return undefined
  const gitDir = result.stdout.trim()
  const found = UNFINISHED_GIT_OPERATIONS.find((entry) => existsSync(join(gitDir, entry)))
  return found && (found.startsWith("rebase") ? "a rebase" : `a ${found.replace("_HEAD", "").toLowerCase().replace("_", "-")}`)
}

export async function prepareServices(
  config: LoadedConfig,
  names: Set<string>,
  options: { start: boolean; logsDir: string },
  out: RunLog,
): Promise<StartedService[]> {
  const started: StartedService[] = []
  const problems: string[] = []

  for (const name of names) {
    const service = config.services?.[name]
    if (!service) continue
    const repo = service.start && resolve(config.configDir, service.start.cwd ?? ".")
    const unfinished = repo && unfinishedGitOperation(repo)
    if (unfinished) {
      problems.push(`service ${name}: ${repo} has ${unfinished} in progress; finish or abort it first`)
      out.line(`  ${color.red("✗")} service ${name}: ${unfinished} in progress in its repo`)
      continue
    }
    const pidFile = join(options.logsDir, `${name}.pid`)
    if (await isUp(service)) {
      if (!service.exclusive) {
        out.line(`  ${color.green("✓")} service ${name} ${color.dim(service.url)}`)
        continue
      }
      if (!(await stopLeftover(pidFile, service))) {
        problems.push(
          `service ${name} is already running at ${service.url}; stop it, since this run must start it itself (exclusive)`,
        )
        out.line(`  ${color.red("✗")} service ${name} already running ${color.dim(service.url)}`)
        continue
      }
      out.line(`  ${color.green("✓")} service ${name}: stopped the one a crashed run left behind`)
    }
    if (!(options.start || service.exclusive) || !service.start) {
      problems.push(
        `service ${name} is down at ${service.url}${service.start ? " (pass --start to launch it)" : ""}`,
      )
      out.line(`  ${color.red("✗")} service ${name} down ${color.dim(service.url)}`)
      continue
    }

    const cwd = resolve(config.configDir, service.start.cwd ?? ".")
    mkdirSync(options.logsDir, { recursive: true })
    const logFile = join(options.logsDir, `${name}.log`)
    out.line(`  … starting ${name}: ${service.start.cmd} ${color.dim(`(log: ${logFile})`)}`)
    const child = startBackground(service.start.cmd, cwd, logFile)
    writeFileSync(pidFile, String(child.pid))
    started.push({ name, process: child, pidFile })

    let ready = false
    for (let attempt = 0; attempt < 90 && !ready; attempt++) {
      await sleep(1000)
      ready = await isUp(service)
    }
    if (ready) out.line(`  ${color.green("✓")} service ${name} started`)
    else problems.push(`service ${name} did not become ready within 90s; see ${options.logsDir}/${name}.log`)
  }

  if (problems.length > 0) throw new Error(problems.join("\n"))
  return started
}

export type MobileSetup = { device: string; adb: string }

function pickDevice(adb: string, env: Record<string, string>): string {
  const list = spawnSync(adb, ["devices"], { encoding: "utf8" }).stdout ?? ""
  const devices = list
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === "device")
    .map(([serial]) => serial)

  if (env.E2E_DEVICE) {
    if (!devices.includes(env.E2E_DEVICE)) throw new Error(`E2E_DEVICE=${env.E2E_DEVICE} is not connected`)
    return env.E2E_DEVICE
  }
  if (devices.length === 0) {
    const unauthorized = list.includes("unauthorized") ? " (a device is unauthorized: accept the USB debugging prompt)" : ""
    throw new Error(`no Android device connected${unauthorized}`)
  }
  return devices[0]
}

// Where the keyboards disabled for a run are saved: on the device, so a crashed run can be undone.
const SAVED_IMES = "e2e_saved_imes"

function adbShell(adb: string, device: string, command: string): string {
  return spawnSync(adb, ["-s", device, "shell", command], { encoding: "utf8" }).stdout?.trim() ?? ""
}

/** Re-enable the keyboards a run disabled, and make the saved default keyboard current again. */
export function restoreKeyboards(adb: string, device: string) {
  const saved = adbShell(adb, device, `settings get global ${SAVED_IMES}`)
  if (!saved || saved === "null") return
  const [current, ...enabled] = saved.split(",")
  for (const ime of enabled) adbShell(adb, device, `ime enable ${ime}`)
  if (current && current !== "null") adbShell(adb, device, `ime set ${current}`)
  adbShell(adb, device, `settings delete global ${SAVED_IMES}`)
}

/**
 * Disable every on-screen keyboard for the run. `input text` then types straight into the
 * focused field, and no keyboard popup (suggestions, stylus onboarding) can take the text.
 */
function disableKeyboards(adb: string, device: string) {
  const enabled = adbShell(adb, device, "ime list -s").split("\n").map((line) => line.trim()).filter(Boolean)
  if (enabled.length === 0) return
  const current = adbShell(adb, device, "settings get secure default_input_method")
  adbShell(adb, device, `settings put global ${SAVED_IMES} ${[current, ...enabled].join(",")}`)
  for (const ime of enabled) adbShell(adb, device, `ime disable ${ime}`)
}

/** Find the device, forward ports, and make sure the app is installed. */
export async function prepareMobile(
  config: LoadedConfig,
  name: string,
  target: MobileTarget,
  options: { install: boolean },
  out: RunLog,
): Promise<MobileSetup> {
  const adb = adbPath()
  if (!adb) throw new Error("adb not found (install Android platform-tools or set ANDROID_HOME)")

  const device = pickDevice(adb, config.env)
  restoreKeyboards(adb, device) // undo a run that crashed before its cleanup
  const model = spawnSync(adb, ["-s", device, "shell", "getprop", "ro.product.model"], { encoding: "utf8" }).stdout.trim()
  out.line(`  ${color.green("✓")} ${name}: device ${device} ${color.dim(model)}`)

  // A uiautomator dump left by an interrupted run holds UiAutomation and makes every later
  // dump hang. Clear it before starting.
  spawnSync(adb, ["-s", device, "shell", "pkill", "-f", "uiautomator"])

  for (const port of target.reversePorts ?? []) {
    const reverse = spawnSync(adb, ["-s", device, "reverse", `tcp:${port}`, `tcp:${port}`], { encoding: "utf8" })
    if (reverse.status !== 0) throw new Error(`adb reverse tcp:${port} failed: ${reverse.stderr.trim()}`)
    out.line(`  ${color.green("✓")} ${name}: adb reverse tcp:${port}`)
  }

  if (options.install) {
    if (!target.install) throw new Error(`target ${name} has no install command`)
    const cwd = resolve(config.configDir, target.install.cwd ?? ".")
    out.line(`  … ${name}: ${target.install.cmd}`)
    const result = await runShell(target.install.cmd, { cwd, log: (line) => out.detail(line) })
    if (result.exitCode !== 0) {
      throw new Error(`install failed (exit ${result.exitCode}):\n${(result.stdout + result.stderr).trim().split("\n").slice(-15).join("\n")}`)
    }
  }

  const packages = spawnSync(adb, ["-s", device, "shell", "pm", "list", "packages", target.appId], { encoding: "utf8" }).stdout
  if (!packages.split("\n").some((line) => line.trim() === `package:${target.appId}`)) {
    throw new Error(`${target.appId} is not installed on ${device}${target.install ? " (pass --install)" : ""}`)
  }
  out.line(`  ${color.green("✓")} ${name}: ${target.appId} installed`)

  // Last, so a failed check above never leaves the device without a keyboard.
  disableKeyboards(adb, device)
  out.line(`  ${color.green("✓")} ${name}: on-screen keyboards off for the run`)
  return { device, adb }
}

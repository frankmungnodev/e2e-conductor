import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { closeSync, existsSync, openSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Logger } from "./config.ts"

export type CommandResult = { exitCode: number; stdout: string; stderr: string }

/** Run a command, stream each output line to `log`, and collect the output. */
export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; log?: Logger; shell?: boolean } = {},
): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, shell: options.shell ?? false })
    let stdout = ""
    let stderr = ""
    const forward = (chunk: Buffer, sink: "out" | "err") => {
      const text = chunk.toString()
      if (sink === "out") stdout += text
      else stderr += text
      if (options.log) {
        for (const line of text.split("\n")) if (line.trim()) options.log(line)
      }
    }
    child.stdout.on("data", (chunk) => forward(chunk, "out"))
    child.stderr.on("data", (chunk) => forward(chunk, "err"))

    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGTERM")
          reject(new Error(`timed out after ${options.timeoutMs}ms: ${command} ${args.join(" ")}`))
        }, options.timeoutMs)
      : undefined

    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolvePromise({ exitCode: code ?? 1, stdout, stderr })
    })
  })
}

/** Run a shell command line (`sh -c`). */
export function runShell(line: string, options: { cwd?: string; timeoutMs?: number; log?: Logger } = {}) {
  return runCommand("sh", ["-c", line], options)
}

/**
 * Start a long-running shell command in its own process group, with output going straight
 * to `logFile`, so it keeps running if this process exits.
 */
export function startBackground(line: string, cwd: string, logFile: string): ChildProcess {
  const fd = openSync(logFile, "w")
  const child = spawn("sh", ["-c", line], { cwd, detached: true, stdio: ["ignore", fd, fd] })
  closeSync(fd)
  child.unref()
  return child
}

/** Stop a process started with `startBackground`, including its children. */
export function stopBackground(child: ChildProcess) {
  if (child.pid && child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGTERM")
    } catch {
      // already gone
    }
  }
}

function onPath(binary: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${binary}`]).status === 0
}

/** Find a CLI on PATH or in its usual install folders. */
export function findTool(binary: string, fallbacks: string[]): string | undefined {
  if (onPath(binary)) return binary
  return fallbacks.find((path) => existsSync(path))
}

export function adbPath(): string | undefined {
  const sdkRoots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(homedir(), "Library/Android/sdk")]
  return findTool(
    "adb",
    sdkRoots.filter((root): root is string => Boolean(root)).map((root) => join(root, "platform-tools/adb")),
  )
}

export const sleep = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

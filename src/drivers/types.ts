import type { Logger } from "../config.ts"
import type { Step } from "../scenario.ts"

/** What a step produced. `extract` and `json_match` read from `data`. */
export type StepResult = {
  data: unknown
  status?: number
  exitCode?: number
  output?: string
}

export type StepRun = {
  /** Step with all placeholders already substituted. */
  step: Step
  env: Record<string, string>
  /** Folder for this scenario's screenshots, traces and debug output. */
  artifactsDir: string
  log: Logger
}

export interface Driver {
  run(input: StepRun): Promise<StepResult>
  /** Called before a scenario's first step, so evidence kept at its end covers only that scenario. */
  startScenario?(): Promise<void>
  /** Called when a scenario ends. `failed` tells the driver to keep evidence. */
  endScenario?(failed: boolean, artifactsDir: string): Promise<void>
  /** Saves the current screen as a PNG at `path`. Only drivers with a screen have it. */
  captureScreen?(path: string): Promise<void>
  close?(): Promise<void>
}

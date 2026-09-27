import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

const ANSI = /\x1b\[[0-9;]*m/g

export const stripAnsi = (text: string) => text.replace(ANSI, "")

export const color = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
}

export type LogListener = (line: string, isDetail: boolean) => void

/** Writes to the console and to a plain-text log file. */
export class RunLog {
  private file: string
  private listener?: LogListener

  constructor(file: string, onLine?: LogListener) {
    this.file = file
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, "")
    this.listener = onLine
  }

  line(text = "") {
    console.log(text)
    const clean = stripAnsi(text)
    appendFileSync(this.file, `${clean}\n`)
    this.listener?.(clean, false)
  }

  /** Detail lines go to the file only, unless E2E_VERBOSE=1. */
  detail(text: string) {
    if (process.env.E2E_VERBOSE === "1") console.log(color.dim(`      ${text}`))
    const clean = stripAnsi(text)
    appendFileSync(this.file, `      ${clean}\n`)
    this.listener?.(clean, true)
  }
}


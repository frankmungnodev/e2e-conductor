import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

const ANSI = /\x1b\[[0-9;]*m/g

export const stripAnsi = (text: string) => text.replace(ANSI, "")

export const color = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
}

/** Writes to the console and to a plain-text log file. */
export class RunLog {
  constructor(private readonly file: string) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, "")
  }

  line(text = "") {
    console.log(text)
    appendFileSync(this.file, `${stripAnsi(text)}\n`)
  }

  /** Detail lines go to the file only, unless E2E_VERBOSE=1. */
  detail(text: string) {
    if (process.env.E2E_VERBOSE === "1") console.log(color.dim(`      ${text}`))
    appendFileSync(this.file, `      ${stripAnsi(text)}\n`)
  }
}

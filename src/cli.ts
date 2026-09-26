import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { type LoadedConfig, loadConfig, starterConfig } from "./config.ts"
import { initProject, runInteractiveInit } from "./init.ts"
import { color } from "./logger.ts"
import { run } from "./runner.ts"
import { loadScenarios } from "./scenario.ts"
import { startServer } from "./server.ts"

const HELP = `Usage: e2e <command> [options]

Commands:
  run     Run scenarios (default)
  check   Preflight only: services, devices, installed apps
  list    List scenarios and validate them
  init    Write a starter config and scenario (never overwrites)
  ui      Start the web GUI dashboard

Options:
  -c, --config <path>     Config file (default: ./e2e.config.ts)
  -s, --scenario <text>   Only scenarios whose file name contains <text> (repeatable)
  -r, --repeat <n>        Run each scenario n times (flakiness check)
      --start             Start services that are down
      --install           Build and install mobile apps before running
      --headless          Hide the browser (same as E2E_HEADLESS=1)
  -v, --verbose           Print step details (same as E2E_VERBOSE=1)
  -i, --interactive       Interactive setup wizard (for init)
      --port <n>          Port for web UI (default: 4173)
      --host <addr>       Host address for web UI (default: 127.0.0.1)
      --no-open           Do not automatically open the browser on UI launch
  -h, --help
`

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string", short: "c", default: "e2e.config.ts" },
      scenario: { type: "string", short: "s", multiple: true, default: [] },
      repeat: { type: "string", short: "r", default: "1" },
      start: { type: "boolean", default: false },
      install: { type: "boolean", default: false },
      headless: { type: "boolean", default: false },
      verbose: { type: "boolean", short: "v", default: false },
      interactive: { type: "boolean", short: "i", default: false },
      port: { type: "string", default: "4173" },
      host: { type: "string", default: "127.0.0.1" },
      open: { type: "boolean", default: true },
      "no-open": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  })

  const command = positionals[0] ?? "run"
  if (values.help || !["run", "check", "list", "init", "ui"].includes(command)) {
    console.log(HELP)
    process.exit(values.help ? 0 : 2)
  }
  if (values.headless) process.env.E2E_HEADLESS = "1"
  if (values.verbose) process.env.E2E_VERBOSE = "1"

  if (command === "init") {
    const isInteractive = values.interactive
    const { created, skipped } = isInteractive ? await runInteractiveInit(values.config) : initProject(values.config)
    for (const file of created) console.log(`${color.green("created")} ${file}`)
    for (const file of skipped) console.log(`${color.yellow("skipped")} ${file} ${color.dim("(exists)")}`)
    if (created.length > 0) console.log(`\nNext: verify your setup in ${values.config}, then run: e2e check`)
    return
  }

  if (command === "ui") {
    const port = Number(values.port)
    if (Number.isNaN(port) || port < 1 || port > 65535) throw new Error("--port must be a valid port number (1-65535)")
    const configPath = resolve(values.config)
    let config: LoadedConfig
    if (!existsSync(configPath)) {
      console.log(color.yellow(`Note: ${values.config} not found. Running UI in starter mode.`))
      config = starterConfig()
    } else {
      config = await loadConfig(values.config)
    }

    const shouldOpen = !values["no-open"] && values.open !== false
    const { url } = await startServer(config, {
      port,
      host: values.host,
      open: shouldOpen,
    })
    console.log(`${color.green("✓")} e2e UI ready at ${color.bold(url)}`)
    console.log(color.dim("Press Ctrl+C to stop"))
    return
  }

  const config = await loadConfig(values.config)

  if (command === "list") {
    for (const scenario of loadScenarios(config, values.scenario)) {
      const targets = [...new Set(scenario.steps.map((step) => step.target))].join(", ")
      console.log(`${scenario.id.padEnd(36)} ${scenario.name} ${color.dim(`[${targets}]`)}`)
    }
    return
  }

  const repeat = Number(values.repeat)
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error("--repeat must be a positive integer")

  const summary = await run(config, {
    scenarios: values.scenario,
    repeat,
    start: values.start,
    install: values.install,
    checkOnly: command === "check",
  })
  process.exit(summary.status === "PASSED" ? 0 : 1)
}

// A step module that leaves a promise unawaited (e.g. a waitForResponse whose click threw) must
// not kill the run: that would skip the failure report and the service and device cleanup.
process.on("unhandledRejection", (reason) => {
  console.error(color.yellow(`unhandled rejection (ignored): ${reason instanceof Error ? reason.message : String(reason)}`))
})

main().catch((error: Error) => {
  console.error(color.red(error.message))
  process.exit(1)
})

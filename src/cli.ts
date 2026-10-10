import { relative } from "node:path"
import { parseArgs } from "node:util"
import { type LoadedConfig, loadConfig, starterConfig } from "./config.ts"
import { resolveCliPaths, resolveProjectDir } from "./db/paths.ts"
import { exportToJson } from "./export.ts"
import { importFromJson } from "./import.ts"
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
  export  Write scenarios and step presets from SQLite to JSON files
  import  Save scenario JSON files into SQLite, replacing changed ones
  init    Initialize SQLite configuration and starter scenario under .e2e
  ui      Start the web GUI dashboard

Options:
  -d, --dir <path>        Project directory (default: .)
      --db <path>         SQLite database path (default: .e2e/e2e.db)
  -c, --config <path>     Directory or database path alias
  -e, --env <name>        Target environment profile (e.g. main, staging, prod)
  -s, --scenario <text>   Only scenarios whose file name contains <text> (repeatable)
  -r, --repeat <n>        Run each scenario n times (flakiness check)
      --start             Start services that are down
      --install           Build and install mobile apps before running
      --strict            Fail the run when a step passed only on a retry
      --screenshots       Save a screenshot after every web and Android step
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
      dir: { type: "string", short: "d" },
      db: { type: "string" },
      config: { type: "string", short: "c" },
      env: { type: "string", short: "e" },
      scenario: { type: "string", short: "s", multiple: true, default: [] },
      repeat: { type: "string", short: "r", default: "1" },
      start: { type: "boolean", default: false },
      install: { type: "boolean", default: false },
      strict: { type: "boolean", default: false },
      screenshots: { type: "boolean", default: false },
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
  if (values.help || !["run", "check", "list", "export", "import", "init", "ui"].includes(command)) {
    console.log(HELP)
    process.exit(values.help ? 0 : 2)
  }
  if (values.env) process.env.E2E_ENV = values.env
  if (values.headless) process.env.E2E_HEADLESS = "1"
  if (values.verbose) process.env.E2E_VERBOSE = "1"

  const { projectPath, dbPath } = resolveCliPaths(values)

  if (command === "init") {
    const isInteractive = values.interactive
    const { created, skipped } = isInteractive ? await runInteractiveInit(projectPath, dbPath) : initProject(projectPath, dbPath)
    for (const file of created) console.log(`${color.green("created")} ${file}`)
    for (const file of skipped) console.log(`${color.yellow("skipped")} ${file} ${color.dim("(exists)")}`)
    if (created.length > 0) console.log(`\nNext: verify your setup in .e2e/e2e.db, then run: e2e check`)
    return
  }

  if (command === "ui") {
    const port = Number(values.port)
    if (Number.isNaN(port) || port < 1 || port > 65535) throw new Error("--port must be a valid port number (1-65535)")
    let config: LoadedConfig
    try {
      config = await loadConfig(projectPath, undefined, dbPath)
    } catch {
      config = starterConfig(resolveProjectDir(projectPath), dbPath)
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

  const config = await loadConfig(projectPath, values.env, dbPath)

  if (command === "list") {
    for (const scenario of loadScenarios(config, values.scenario)) {
      const targets = [...new Set(scenario.steps.map((step) => step.target))].join(", ")
      console.log(`${scenario.id.padEnd(36)} ${scenario.name} ${color.dim(`[${targets}]`)}`)
    }
    return
  }

  if (command === "export") {
    const { scenarios, presets } = exportToJson(config)
    for (const file of [...scenarios, ...presets]) console.log(`${color.green("wrote")} ${relative(process.cwd(), file)}`)
    console.log(color.dim(`${scenarios.length} scenarios, ${presets.length} presets`))
    return
  }

  if (command === "import") {
    const { added, updated, unchanged, invalid } = importFromJson(config)
    for (const id of added) console.log(`${color.green("added")}   ${id}`)
    for (const id of updated) console.log(`${color.yellow("updated")} ${id}`)
    for (const { file, problems } of invalid) {
      console.log(`${color.red("invalid")} ${relative(process.cwd(), file)}`)
      for (const problem of problems) console.log(color.dim(`  ${problem}`))
    }
    console.log(color.dim(`${added.length} added, ${updated.length} updated, ${unchanged.length} unchanged, ${invalid.length} invalid`))
    if (invalid.length > 0) process.exit(1)
    return
  }

  const repeat = Number(values.repeat)
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error("--repeat must be a positive integer")

  const summary = await run(config, {
    scenarios: values.scenario,
    repeat,
    start: values.start,
    install: values.install,
    strict: values.strict,
    stepScreenshots: values.screenshots,
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

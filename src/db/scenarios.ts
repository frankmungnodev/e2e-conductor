import type { DatabaseSync } from "node:sqlite"
import { safeJsonParse } from "./connection.ts"

export type Assert = {
  status?: number
  exit_code?: number
  output_contains?: string
  json_match?: Record<string, unknown>
}

export type StepAction = {
  id?: string
  name?: string
  action: string
  selector?: string
  target_selector?: string
  value?: string
  url?: string
  key?: string
  ms?: number
  timeout_ms?: number
  width?: number
  height?: number
  method?: string
  headers?: Record<string, string>
  body?: unknown
  status?: number
  command?: string
  cwd?: string
  exit_code?: number
}

export type Step = {
  id?: string
  name: string
  target: string
  actions?: StepAction[]
  extract?: Record<string, string>
  assert?: Assert
  timeout_ms?: number
  retry?: { times: number; delay_ms?: number }
  // http
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: unknown
  // declarative actions (web & mobile single action fallback)
  action?: string
  selector?: string
  target_selector?: string
  value?: string
  key?: string
  ms?: number
  width?: number
  height?: number
  // web / mobile fallback
  run?: string
  flow?: string
  launch?: "fresh" | "restart"
  params?: Record<string, unknown>
  // shell
  command?: string
  cwd?: string
}

export type Scenario = {
  id: string
  name: string
  description?: string
  setup?: string[]
  vars?: Record<string, unknown>
  steps: Step[]
}

const STEP_COMMON_KEYS = new Set([
  "id",
  "name",
  "target",
  "extract",
  "assert",
  "timeout_ms",
  "retry",
])

type ScenarioRow = {
  id: string
  name: string
  description?: string | null
  setup_fixtures?: string | null
  vars?: string | null
}

type StepRow = {
  id: string
  scenario_id: string
  order_num: number
  name: string
  target: string
  timeout_ms?: number | null
  retry_times?: number | null
  retry_delay_ms?: number | null
  assert_json?: string | null
  extract_json?: string | null
  driver_config?: string | null
}

function mapStepRow(row: StepRow): Step {
  const assertObj = safeJsonParse<Assert>(row.assert_json)
  const extractObj = safeJsonParse<Record<string, string>>(row.extract_json)
  const driverConfig = safeJsonParse<Record<string, unknown>>(row.driver_config) ?? {}

  return {
    id: row.id,
    name: row.name,
    target: row.target,
    timeout_ms: row.timeout_ms ?? undefined,
    retry: row.retry_times != null ? { times: row.retry_times, delay_ms: row.retry_delay_ms ?? 1000 } : undefined,
    assert: assertObj,
    extract: extractObj,
    ...driverConfig,
  }
}

function mapScenarioRow(row: ScenarioRow, steps: Step[]): Scenario {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    setup: safeJsonParse<string[]>(row.setup_fixtures),
    vars: safeJsonParse<Record<string, unknown>>(row.vars),
    steps,
  }
}

export function getScenarios(db: DatabaseSync): Scenario[] {
  const scRows = db.prepare("SELECT * FROM scenarios ORDER BY id ASC").all() as ScenarioRow[]
  const stepRows = db.prepare("SELECT * FROM scenario_steps ORDER BY scenario_id ASC, order_num ASC").all() as StepRow[]

  const stepsByScenario = new Map<string, Step[]>()
  for (const row of stepRows) {
    const list = stepsByScenario.get(row.scenario_id) ?? []
    list.push(mapStepRow(row))
    stepsByScenario.set(row.scenario_id, list)
  }

  return scRows.map((r) => mapScenarioRow(r, stepsByScenario.get(r.id) ?? []))
}

export function getScenario(db: DatabaseSync, id: string): Scenario | undefined {
  const row = db.prepare("SELECT * FROM scenarios WHERE id = ?").get(id) as ScenarioRow | undefined
  if (!row) return undefined

  const stepRows = db.prepare("SELECT * FROM scenario_steps WHERE scenario_id = ? ORDER BY order_num ASC").all(id) as StepRow[]
  return mapScenarioRow(row, stepRows.map(mapStepRow))
}

export function saveScenario(db: DatabaseSync, scenario: Scenario): void {
  const now = Date.now()
  const setupJson = scenario.setup ? JSON.stringify(scenario.setup) : null
  const varsJson = scenario.vars ? JSON.stringify(scenario.vars) : null

  db.prepare(`
    INSERT INTO scenarios (id, name, description, setup_fixtures, vars, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      setup_fixtures = excluded.setup_fixtures,
      vars = excluded.vars,
      updated_at = excluded.updated_at
  `).run(
    scenario.id,
    scenario.name,
    scenario.description || null,
    setupJson,
    varsJson,
    now,
    now,
  )

  db.prepare("DELETE FROM scenario_steps WHERE scenario_id = ?").run(scenario.id)

  const insertStep = db.prepare(`
    INSERT INTO scenario_steps (
      id, scenario_id, order_num, name, target, timeout_ms, retry_times, retry_delay_ms,
      assert_json, extract_json, driver_config, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  scenario.steps.forEach((step, idx) => {
    const orderNum = idx + 1
    const stepId = step.id || `${scenario.id}:step:${orderNum}`
    step.id = stepId
    const assertJson = step.assert ? JSON.stringify(step.assert) : null
    const extractJson = step.extract ? JSON.stringify(step.extract) : null

    const driverConfig: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(step)) {
      if (!STEP_COMMON_KEYS.has(k) && v !== undefined) {
        driverConfig[k] = v
      }
    }
    const driverConfigJson = Object.keys(driverConfig).length > 0 ? JSON.stringify(driverConfig) : null

    insertStep.run(
      stepId,
      scenario.id,
      orderNum,
      step.name,
      step.target,
      step.timeout_ms ?? null,
      step.retry?.times ?? null,
      step.retry?.delay_ms ?? null,
      assertJson,
      extractJson,
      driverConfigJson,
      now,
      now,
    )
  })
}

export function deleteScenario(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM scenario_steps WHERE scenario_id = ?").run(id)
  db.prepare("DELETE FROM scenarios WHERE id = ?").run(id)
}

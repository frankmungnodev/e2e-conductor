import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, describe, it } from "node:test"
import { checkFlow, parseFlow } from "../src/flow.ts"

const dir = mkdtempSync(join(tmpdir(), "e2e-flow-"))
after(() => rmSync(dir, { recursive: true, force: true }))

function flowFile(source: string): string {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.yaml`)
  writeFileSync(file, source)
  return file
}

describe("parseFlow", () => {
  it("treats a single document as the command list", () => {
    const flow = parseFlow("- launchApp\n- back\n")
    assert.equal(flow.header, undefined)
    assert.deepEqual(flow.commands, ["launchApp", "back"])
    assert.equal(flow.documentCount, 1)
  })

  it("splits a header from the commands", () => {
    const flow = parseFlow("appId: com.example\n---\n- launchApp\n")
    assert.deepEqual(flow.header, { appId: "com.example" })
    assert.deepEqual(flow.commands, ["launchApp"])
  })

  it("reports YAML syntax errors", () => {
    assert.ok(parseFlow("- [unclosed\n").syntaxErrors.length > 0)
  })
})

describe("checkFlow", () => {
  it("accepts a valid flow", () => {
    const file = flowFile(
      [
        "version: 1",
        "appId: com.example",
        "---",
        "- launchApp",
        "- tapOn: Login",
        "- tapOn: { id: submit, below: { text: Email } }",
        "- inputText: ${EMAIL}",
        "- extendedWaitUntil: { visible: Home, timeout: 5000 }",
        "",
      ].join("\n"),
    )
    assert.deepEqual(checkFlow(file), [])
  })

  it("rejects an unknown command", () => {
    const problems = checkFlow(flowFile("- tapOnn: Login\n"))
    assert.ok(problems.some((problem) => problem.startsWith("commands ") && problem.includes('"tapOnn"')))
  })

  it("rejects a bare command that needs an argument", () => {
    assert.ok(checkFlow(flowFile("- tapOn\n")).length > 0)
  })

  it("rejects an unknown header key", () => {
    const problems = checkFlow(flowFile("appID: x\n---\n- back\n"))
    assert.ok(problems.some((problem) => problem.startsWith("header ") && problem.includes('"appID"')))
  })

  it("rejects a header that is not a mapping", () => {
    assert.deepEqual(checkFlow(flowFile("- back\n---\n- back\n")), ["header (the first YAML document) must be a mapping"])
  })

  it("rejects commands that are not a list", () => {
    assert.deepEqual(checkFlow(flowFile("launchApp: null\n")), ["commands must be a YAML list"])
  })

  it("rejects more than two documents", () => {
    assert.deepEqual(checkFlow(flowFile("a: 1\n---\n- back\n---\n- back\n")), [
      "has 3 YAML documents; expected a header, then the commands",
    ])
  })
})

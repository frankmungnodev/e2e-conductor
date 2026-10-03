import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { expect } from "playwright/test"
import { AssertionFailure, checkAssert, extract, failureLabel } from "../src/assertions.ts"
import { AdbFlowRunner } from "../src/drivers/adb-flow.ts"
import { fakeAdb } from "./fake-adb.ts"
import { tempDir } from "./temp-dir.ts"

describe("checkAssert and extract", () => {
  it("throws AssertionFailure for status 200 against assert.status 201, labeled Assertion failed", () => {
    const error = catchError(() => checkAssert({ name: "create", target: "api", assert: { status: 201 } }, { data: {}, status: 200 }))
    assert.ok(error instanceof AssertionFailure)
    assert.match(error.message, /status: expected 201, got 200/)
    assert.equal(failureLabel(error, []), "Assertion failed")
  })

  it("throws AssertionFailure for a shell exit code 3 with no assert.exit_code", () => {
    const error = catchError(() => checkAssert({ name: "seed", target: "shell" }, { data: {}, exitCode: 3 }))
    assert.ok(error instanceof AssertionFailure)
    assert.match(error.message, /exit code: expected 0, got 3/)
  })

  it("throws AssertionFailure when an extract path has nothing", () => {
    const error = catchError(() =>
      extract({ name: "login", target: "api", extract: { token: "body.token" } }, { data: { body: {} } }, {}),
    )
    assert.ok(error instanceof AssertionFailure)
    assert.match(error.message, /extract token: nothing at "body.token"/)
  })
})

describe("failureLabel", () => {
  it("labels a plain timeout with a healthy environment as Step error", () => {
    assert.equal(failureLabel(new Error("Timeout 30000ms exceeded"), []), "Step error")
  })

  it("labels any error as Environment down when something is down", () => {
    assert.equal(failureLabel(new Error("Timeout 30000ms exceeded"), ["service api"]), "Environment down")
    assert.equal(failureLabel(new AssertionFailure("status: expected 201, got 500"), ["device emulator-5554"]), "Environment down")
  })

  it("labels a Playwright expect failure from a web module as Assertion failed", () => {
    const error = catchError(() => expect(1).toBe(2))
    assert.equal(failureLabel(error, []), "Assertion failed")
  })
})

describe("AdbFlowRunner assertions", () => {
  it("surfaces a failing assertVisible as AssertionFailure after runCommands adds its prefix", { timeout: 30_000 }, async () => {
    // A fake adb whose UI dump is an empty screen, so the element never appears.
    const adb = fakeAdb(tempDir("fake-adb"), "adb", 'echo "<hierarchy></hierarchy>"')
    const runner = new AdbFlowRunner(adb, "emulator-5554", () => {})

    const error = await runner.runCommands([{ assertVisible: "Welcome" }], "com.example").catch((caught: unknown) => caught)
    assert.ok(error instanceof AssertionFailure)
    assert.match(error.message, /^assertVisible "Welcome": "Welcome" still not visible/)
  })
})

function catchError(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  assert.fail("expected an error")
}

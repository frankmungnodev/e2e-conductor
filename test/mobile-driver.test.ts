import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { MobileTarget } from "../src/config.ts"
import { MobileDriver, parseSelector } from "../src/drivers/mobile.ts"
import { fakeAdb } from "./fake-adb.ts"
import { tempDir } from "./temp-dir.ts"

describe("mobile action selectors", () => {
  it("reads id= as a resource id and anything else as a text pattern", () => {
    assert.deepEqual(parseSelector("id=search_text_field"), { id: "search_text_field" })
    assert.deepEqual(parseSelector("text=id=literal"), { text: "id=literal" })
    assert.deepEqual(parseSelector("\\d+\\. Hymn"), { text: "\\d+\\. Hymn" })
  })
})

describe("mobile screen capture", () => {
  const target: MobileTarget = { driver: "mobile", platform: "android", appId: "com.example", flows: "flows" }

  it("writes the screencap bytes to the given path", async () => {
    const dir = tempDir("mobile-capture")
    const adb = fakeAdb(dir, "adb", `[ "$3 $4 $5" = "exec-out screencap -p" ] && printf 'PNGDATA' && exit 0\nexit 1`)
    const path = join(dir, "step-1.png")
    await new MobileDriver(target, "emulator-5554", adb).captureScreen(path)
    assert.equal(readFileSync(path, "utf8"), "PNGDATA")
  })

  it("rejects and writes nothing when screencap fails", async () => {
    const dir = tempDir("mobile-capture-fail")
    const adb = fakeAdb(dir, "adb", "exit 1")
    const path = join(dir, "step-1.png")
    await assert.rejects(new MobileDriver(target, "emulator-5554", adb).captureScreen(path))
    assert.equal(existsSync(path), false)
  })
})

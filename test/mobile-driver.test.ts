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

describe("mobile failure evidence", () => {
  const target: MobileTarget = { driver: "mobile", platform: "android", appId: "com.example", flows: "flows" }
  // Answers each adb call by its first arguments after `-s <device>`, and logs every call.
  const script = (dir: string) => `echo "$3 $4" >> ${join(dir, "calls")}
case "$3 $4" in
  "exec-out screencap") printf 'PNGDATA' ;;
  "logcat -d") echo "E AndroidRuntime: FATAL EXCEPTION: main" ;;
  "shell "*) echo '<?xml version="1.0"?><hierarchy rotation="0"></hierarchy>' ;;
esac
exit 0`

  it("clears the device log when a scenario starts", async () => {
    const dir = tempDir("mobile-start")
    await new MobileDriver(target, "emulator-5554", fakeAdb(dir, "adb", script(dir))).startScenario()
    assert.equal(readFileSync(join(dir, "calls"), "utf8"), "logcat -c\n")
  })

  it("keeps the screen, device log and view hierarchy when a scenario fails", async () => {
    const dir = tempDir("mobile-evidence")
    await new MobileDriver(target, "emulator-5554", fakeAdb(dir, "adb", script(dir))).endScenario(true, dir)
    assert.equal(readFileSync(join(dir, "mobile-failure.png"), "utf8"), "PNGDATA")
    assert.match(readFileSync(join(dir, "mobile-logcat.txt"), "utf8"), /FATAL EXCEPTION/)
    assert.match(readFileSync(join(dir, "mobile-ui.xml"), "utf8"), /<hierarchy/)
  })

  it("keeps nothing when a scenario passes", async () => {
    const dir = tempDir("mobile-pass")
    await new MobileDriver(target, "emulator-5554", fakeAdb(dir, "adb", script(dir))).endScenario(false, dir)
    assert.equal(existsSync(join(dir, "calls")), false)
  })

  it("captures the log with the year and UTC times, and falls back to the plain format when adb rejects them", async () => {
    const dir = tempDir("mobile-old-logcat")
    // Android before 7: logcat refuses the year and UTC modifiers.
    const adb = fakeAdb(dir, "adb", `echo "$*" >> ${join(dir, "calls")}
[ "$3" = "logcat" ] && [ "$8" = "year" ] && exit 1
[ "$3" = "logcat" ] && echo "10-11 12:00:00.000  1  1 E App: crash" && exit 0
exit 0`)
    await new MobileDriver(target, "emulator-5554", adb).endScenario(true, dir)
    assert.match(readFileSync(join(dir, "calls"), "utf8"), /logcat -d -v threadtime -v year -v UTC\n.*logcat -d -v threadtime\n/)
    assert.match(readFileSync(join(dir, "mobile-logcat.txt"), "utf8"), /E App: crash/)
  })

  it("writes no view hierarchy when the dump fails, and still keeps the log", async () => {
    const dir = tempDir("mobile-no-dump")
    const adb = fakeAdb(dir, "adb", `[ "$3" = "logcat" ] && echo "I ActivityManager: start" && exit 0\nexit 0`)
    await new MobileDriver(target, "emulator-5554", adb).endScenario(true, dir)
    assert.equal(existsSync(join(dir, "mobile-ui.xml")), false)
    assert.ok(existsSync(join(dir, "mobile-logcat.txt")))
  })
})

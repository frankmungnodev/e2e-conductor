import assert from "node:assert/strict"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { AdbFlowRunner } from "../src/drivers/adb-flow.ts"
import { disableAutofill, disableKeyboards, restoreKeyboards } from "../src/preflight.ts"
import { fakeAdb } from "./fake-adb.ts"
import { tempDir } from "./temp-dir.ts"

/**
 * A fake device with two text fields, each with a label inside it. Tapping a field focuses it and
 * shows a keyboard that covers the screen below y=250, so it takes any tap on the second field,
 * like the fallback keyboard some devices show with every listed keyboard disabled. A file named
 * `drop` makes the next tap focus nothing, like an app that clears focus when focusing scrolls it.
 */
function formDevice(dir: string): string {
  const field = (key: string, label: string, y1: number) =>
    `<node text=\\"$(cat ${dir}/${key} 2>/dev/null)\\" class=\\"android.widget.EditText\\" focused=\\"$([ x$(cat ${dir}/focus 2>/dev/null) = x${key} ] && echo true || echo false)\\" bounds=\\"[0,${y1}][500,${y1 + 100}]\\" />` +
    `<node text=\\"${label}\\" class=\\"android.widget.TextView\\" bounds=\\"[10,${y1 + 10}][100,${y1 + 30}]\\" />`
  return fakeAdb(
    dir,
    "adb",
    `shift 2; [ "$1" = shell ] && shift
case "$1" in
  rm*) echo "<hierarchy>${field("a", "First", 100)}${field("b", "Second", 300)}</hierarchy>" ;;
  dumpsys) [ -f ${dir}/kb ] && echo "mInputShown=true" || echo "mInputShown=false" ;;
  input)
    case "$2" in
      tap)
        [ -f ${dir}/drop ] && rm ${dir}/drop && exit 0
        [ -f ${dir}/kb ] && [ "$4" -gt 250 ] && exit 0
        [ "$4" -ge 100 ] && [ "$4" -le 200 ] && echo a > ${dir}/focus && touch ${dir}/kb
        [ "$4" -ge 300 ] && [ "$4" -le 400 ] && echo b > ${dir}/focus && touch ${dir}/kb ;;
      text) printf '%s' "$3" >> ${dir}/$(cat ${dir}/focus) ;;
      keyevent) [ "$3" = 4 ] && rm -f ${dir}/kb ;;
    esac ;;
esac
exit 0`,
  )
}

describe("AdbFlowRunner typing", () => {
  it("hides the keyboard after typing, so the next field's tap reaches it", { timeout: 30_000 }, async () => {
    const dir = tempDir("adb-typing")
    const runner = new AdbFlowRunner(formDevice(dir), "emulator-5554", () => {})
    await runner.runCommands(
      [{ tapOn: "First" }, { inputText: "one" }, { tapOn: "Second" }, { inputText: "two" }],
      "com.example",
    )
    assert.equal(readFileSync(join(dir, "a"), "utf8"), "one")
    assert.equal(readFileSync(join(dir, "b"), "utf8"), "two")
    assert.equal(existsSync(join(dir, "kb")), false)
  })

  it("taps again when the first tap leaves no field focused", { timeout: 30_000 }, async () => {
    const dir = tempDir("adb-typing-retap")
    writeFileSync(join(dir, "drop"), "")
    const runner = new AdbFlowRunner(formDevice(dir), "emulator-5554", () => {})
    await runner.runCommands([{ tapOn: "Second" }, { inputText: "two" }], "com.example")
    assert.equal(readFileSync(join(dir, "b"), "utf8"), "two")
  })

  it("refuses to type when a tap left focus on the previous field", { timeout: 30_000 }, async () => {
    const dir = tempDir("adb-typing-missed")
    const runner = new AdbFlowRunner(formDevice(dir), "emulator-5554", () => {})
    // Tapping the first field shows the keyboard, which then takes the tap on the second.
    const error = await runner
      .runCommands([{ tapOn: "First" }, { tapOn: "Second" }, { inputText: "two" }], "com.example")
      .catch((caught: unknown) => caught)
    assert.ok(error instanceof Error)
    assert.match(error.message, /^inputText "two": the tap at \(55,320\) left focus on the text field showing ""; .*keyboard/)
    assert.equal(existsSync(join(dir, "a")), false)
  })
})

describe("disableKeyboards", () => {
  it("reports the keyboard Android falls back to once the listed ones are off", () => {
    const dir = tempDir("adb-fallback")
    writeFileSync(join(dir, "ime"), "com.example.board/.Ime")
    const adb = fakeAdb(
      dir,
      "adb",
      `case "$4" in
  "ime list -s") [ -f ${dir}/off ] || echo com.example.board/.Ime ;;
  "ime disable "*) touch ${dir}/off; echo com.vendor.keys/.Ime > ${dir}/ime ;;
  "settings get secure default_input_method") cat ${dir}/ime ;;
esac
exit 0`,
    )
    assert.equal(disableKeyboards(adb, "emulator-5554"), "com.vendor.keys/.Ime")
  })

  it("reports nothing when no keyboard is current afterwards", () => {
    const dir = tempDir("adb-no-fallback")
    const adb = fakeAdb(
      dir,
      "adb",
      `case "$4" in
  "ime list -s") [ -f ${dir}/off ] || echo com.example.board/.Ime ;;
  "ime disable "*) touch ${dir}/off ;;
  "settings get secure default_input_method") [ -f ${dir}/off ] && echo null || echo com.example.board/.Ime ;;
esac
exit 0`,
    )
    assert.equal(disableKeyboards(adb, "emulator-5554"), undefined)
  })
})

describe("autofill", () => {
  // Keeps device settings in files named after them, and logs every adb shell command.
  const settingsDevice = (dir: string) =>
    fakeAdb(
      dir,
      "adb",
      `echo "$4" >> ${join(dir, "calls")}
set -- $4
case "$1 $2" in
  "settings get") cat ${dir}/$3.$4 2>/dev/null || echo null ;;
  "settings put") echo "$5" > ${dir}/$3.$4 ;;
  "settings delete") rm -f ${dir}/$3.$4 ;;
esac
exit 0`,
    )

  it("turns autofill off for the run, and turns it back on before re-enabling keyboards", async () => {
    const dir = tempDir("adb-autofill")
    writeFileSync(join(dir, "secure.autofill_service"), "com.example/.Autofill\n")
    writeFileSync(join(dir, "global.e2e_saved_imes"), "com.example/.Ime,com.example/.Ime\n")
    const adb = settingsDevice(dir)
    assert.equal(disableAutofill(adb, "emulator-5554"), true)
    assert.equal(readFileSync(join(dir, "secure.autofill_service"), "utf8"), "null\n")

    await restoreKeyboards(adb, "emulator-5554")
    assert.equal(readFileSync(join(dir, "secure.autofill_service"), "utf8"), "com.example/.Autofill\n")
    assert.equal(existsSync(join(dir, "global.e2e_saved_autofill")), false)
    const calls = readFileSync(join(dir, "calls"), "utf8")
    assert.ok(calls.indexOf("settings put secure autofill_service com.example") < calls.indexOf("ime enable"))
  })

  it("waits for a keyboard Android does not know yet when re-enabling it", { timeout: 30_000 }, async () => {
    const dir = tempDir("adb-late-ime")
    writeFileSync(join(dir, "global.e2e_saved_imes"), "null,com.example/.Late\n")
    // Unknown for the first two tries, like autofill's keyboard just after autofill is back on.
    const adb = fakeAdb(
      dir,
      "adb",
      `case "$4" in
  "settings get global e2e_saved_imes") cat ${dir}/global.e2e_saved_imes 2>/dev/null || echo null ;;
  "settings delete global e2e_saved_imes") rm -f ${dir}/global.e2e_saved_imes ;;
  "ime enable "*)
    echo x >> ${dir}/tries
    [ $(wc -l < ${dir}/tries) -le 2 ] && echo "Unknown input method com.example/.Late cannot be enabled" && exit 0
    echo enabled > ${dir}/enabled ;;
esac
exit 0`,
    )
    await restoreKeyboards(adb, "emulator-5554")
    assert.equal(existsSync(join(dir, "enabled")), true)
  })

  it("leaves a device without autofill alone", () => {
    const dir = tempDir("adb-no-autofill")
    assert.equal(disableAutofill(settingsDevice(dir), "emulator-5554"), false)
    assert.doesNotMatch(readFileSync(join(dir, "calls"), "utf8"), /settings put/)
  })
})

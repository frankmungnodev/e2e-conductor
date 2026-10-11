import { AssertionFailure, prefixError } from "../assertions.ts"
import type { Logger } from "../config.ts"
import { runAdb, sleep } from "../process.ts"

/**
 * Runs YAML flows with plain adb: `uiautomator dump` to find elements, `input` to act.
 * The commands and selectors it accepts are defined in schema/v1/flow.schema.json.
 */

type Selector = {
  text?: string
  id?: string
  index?: number
  optional?: boolean
  checked?: boolean
  below?: unknown
  above?: unknown
  containsDescendants?: unknown[]
  /** How long assertVisible and assertNotVisible wait, in ms. Mobile actions set it from `timeout_ms`. */
  timeout?: number
}
type Bounds = { x1: number; y1: number; x2: number; y2: number }
/** Where a tapOn landed, and the text field that had focus on the screen it tapped. */
type Tap = { x: number; y: number; focused?: Node }
type Node = {
  text: string
  id: string
  desc: string
  className: string
  focused: boolean
  checked: boolean
  bounds: Bounds
  x: number
  y: number
}

const DEFAULT_WAIT_MS = 10_000
const POLL_MS = 300
// Pause between keys when retyping text slowly (see typeText).
const KEY_DELAY_MS = 120

/** Shell command that prints the screen's view hierarchy as XML, or nothing when the dump fails. */
export const UI_DUMP = "rm -f /sdcard/e2e-ui.xml; uiautomator dump /sdcard/e2e-ui.xml >/dev/null 2>&1; cat /sdcard/e2e-ui.xml 2>/dev/null; true"

export class AdbFlowRunner {
  /** The nodes of the latest UI dump. */
  private screen: Node[] = []
  /** The tapOn just before the current command, which inputText checks focus against. */
  private lastTap?: Tap

  constructor(
    private readonly adb: string,
    private readonly device: string,
    private readonly log: Logger,
  ) {}

  private shell(args: string[]): string {
    return runAdb(this.adb, this.device, ["shell", ...args])
  }

  private dump(): Node[] {
    // A dump taken while the screen changes (e.g. a cold start's splash screen) can fail without
    // writing the file. Delete the old file first, so a failed dump never returns the previous
    // screen, and read a failed dump as an empty screen, so waits keep polling.
    const xml = this.shell([UI_DUMP])
    const nodes: Node[] = []
    for (const match of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
      const attr = (name: string) => match[1].match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? ""
      const bounds = attr("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
      if (!bounds) continue
      const [x1, y1, x2, y2] = bounds.slice(1).map(Number)
      if (x2 <= x1 || y2 <= y1) continue
      nodes.push({
        text: decode(attr("text")),
        id: attr("resource-id"),
        desc: decode(attr("content-desc")),
        className: attr("class"),
        focused: attr("focused") === "true",
        checked: attr("checked") === "true",
        bounds: { x1, y1, x2, y2 },
        x: Math.round((x1 + x2) / 2),
        y: Math.round((y1 + y2) / 2),
      })
    }
    this.screen = nodes
    return nodes
  }

  private find(selector: Selector): Node | undefined {
    return this.findIn(this.dump(), selector)
  }

  private findIn(nodes: Node[], selector: Selector): Node | undefined {
    const below = selector.below === undefined ? undefined : this.findIn(nodes, toSelector(selector.below))
    const above = selector.above === undefined ? undefined : this.findIn(nodes, toSelector(selector.above))
    if ((selector.below !== undefined && !below) || (selector.above !== undefined && !above)) return undefined
    const descendants = (selector.containsDescendants ?? []).map(toSelector)
    const matches = nodes.filter((node) => {
      if (below && node.y <= below.y) return false
      if (above && node.y >= above.y) return false
      if (selector.checked !== undefined && node.checked !== selector.checked) return false
      if (descendants.some((inner) => !this.findIn(nodes.filter((other) => other !== node && inside(other, node.bounds)), inner))) {
        return false
      }
      if (selector.id !== undefined && !fullMatch(selector.id, node.id) && !node.id.endsWith(`:id/${selector.id}`)) {
        return false
      }
      if (selector.text !== undefined && !fullMatch(selector.text, node.text) && !fullMatch(selector.text, node.desc)) {
        return false
      }
      return true
    })
    return matches[selector.index ?? 0]
  }

  /** `Timeout` is the error class for running out of time; an assertion passes AssertionFailure. */
  private async waitFor(
    selector: Selector,
    visible: boolean,
    timeoutMs: number,
    Timeout: new (message: string) => Error = Error,
  ): Promise<Node | undefined> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const node = this.find(selector)
      if (visible ? node : !node) return node
      if (Date.now() > deadline) {
        throw new Timeout(`${describe(selector)} still ${visible ? "not visible" : "visible"} after ${timeoutMs}ms`)
      }
      await sleep(POLL_MS)
    }
  }

  private sendText(text: string) {
    this.shell(["input", "text", text.replace(/ /g, "%s").replace(/(["'`$&|;<>()\\])/g, "\\$1")])
  }

  private focusedText(): string | undefined {
    return this.dump().find((node) => node.focused)?.text
  }

  /**
   * With the on-screen keyboards off, `input text` is plain key presses. Typed with no text field
   * focused, they move focus or click the focused button (a space pressed Back once). So refuse.
   *
   * After a tapOn outside the field that had focus, that field keeping focus means something else
   * took the tap: a keyboard Android shows even with every listed keyboard disabled covers the
   * fields below it. The keys would land in the wrong field, so refuse that too.
   *
   * A tap that leaves no field focused gets one more try at the same spot: an app that clears focus
   * on scroll (e.g. to close the keyboard) loses it when focusing scrolls the field into view.
   */
  private async focusedField(tap?: Tap): Promise<Node> {
    const before = tap?.focused?.className.endsWith("EditText") ? tap.focused : undefined
    const missed = (field: Node) =>
      before !== undefined && sameBounds(field.bounds, before.bounds) && !inside(tap as Tap, before.bounds)
    let deadline = Date.now() + 2_000
    let retapped = false
    for (;;) {
      const focused = this.dump().find((node) => node.focused)
      if (focused?.className.endsWith("EditText") && !missed(focused)) return focused
      if (Date.now() > deadline && tap && !focused && !retapped) {
        this.log(`inputText: no text field has focus after the tap at (${tap.x},${tap.y}), tapping again`)
        this.shell(["input", "tap", String(tap.x), String(tap.y)])
        retapped = true
        deadline = Date.now() + 2_000
        await sleep(POLL_MS)
        continue
      }
      if (Date.now() > deadline) {
        if (focused?.className.endsWith("EditText")) {
          throw new Error(
            `the tap at (${tap?.x},${tap?.y}) left focus on the text field showing "${focused.text}"; something on screen, such as a keyboard, took the tap`,
          )
        }
        const what = focused ? `${focused.className} "${focused.text || focused.desc}"` : "nothing"
        throw new Error(`no text field has focus (focused: ${what}); tap the field itself, not its label`)
      }
      await sleep(POLL_MS)
    }
  }

  /**
   * Press Back if a keyboard shows. Disabling the keyboards does not stop every device from showing
   * one: some fall back to a system keyboard (e.g. Transsion's on Infinix) that covers the fields
   * below the one typed into.
   */
  private async hideKeyboard() {
    if (this.shell(["dumpsys", "input_method"]).includes("mInputShown=true")) {
      this.shell(["input", "keyevent", "4"])
      await sleep(POLL_MS)
    }
  }

  /**
   * `input text` sends every key at once. A field whose value round-trips through app state
   * (e.g. a Compose TextField fed by a StateFlow) can drop keys at that speed. So check the
   * focused field afterwards; if keys went missing, clear it and type one key at a time.
   */
  private async typeText(text: string, tap?: Tap) {
    const before = (await this.focusedField(tap)).text
    this.sendText(text)
    const expected = before + text
    const deadline = Date.now() + 2_000
    let actual = this.focusedText()
    while (actual !== expected && Date.now() < deadline) {
      await sleep(POLL_MS)
      actual = this.focusedText()
    }
    if (actual === expected) return this.hideKeyboard()

    this.log(`inputText: field shows "${actual}", retyping slowly`)
    this.shell(["input", "keyevent", "123", ...Array((actual ?? expected).length + 1).fill("67")]) // end, then delete
    for (const char of expected) {
      this.sendText(char)
      await sleep(KEY_DELAY_MS)
    }
    await sleep(POLL_MS)
    actual = this.focusedText()
    if (actual !== expected) throw new Error(`field shows "${actual}", expected "${expected}"`)
    await this.hideKeyboard()
  }

  private screenSize(): { width: number; height: number } {
    const [width, height] = this.shell(["wm", "size"]).trim().split(" ").pop()?.split("x").map(Number) ?? [1080, 1920]
    return { width, height }
  }

  private async command(name: string, arg: unknown, appId: string) {
    const selector = toSelector(arg)
    const tap = this.lastTap
    this.lastTap = undefined
    switch (name) {
      case "launchApp":
        this.shell(["monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"])
        return
      case "stopApp":
        this.shell(["am", "force-stop", appId])
        return
      case "clearState":
        this.shell(["pm", "clear", appId])
        return
      case "back":
        this.shell(["input", "keyevent", "4"])
        await sleep(POLL_MS)
        return
      case "hideKeyboard":
        await this.hideKeyboard()
        return
      case "inputText":
        await this.typeText(String(arg), tap)
        return
      case "tapOn": {
        const node = await this.waitFor(selector, true, DEFAULT_WAIT_MS).catch((error) => {
          if (selector.optional) return undefined
          throw error
        })
        if (node) {
          const focused = this.screen.find((other) => other.focused)
          this.shell(["input", "tap", String(node.x), String(node.y)])
          this.lastTap = { x: node.x, y: node.y, focused }
          await sleep(POLL_MS)
        }
        return
      }
      // Running out of time is the check failing here; an adb error still means the step broke.
      case "assertVisible":
        await this.waitFor(selector, true, selector.timeout ?? DEFAULT_WAIT_MS, AssertionFailure)
        return
      case "assertNotVisible":
        await this.waitFor(selector, false, selector.timeout ?? DEFAULT_WAIT_MS, AssertionFailure)
        return
      case "extendedWaitUntil": {
        const { visible, notVisible, timeout } = arg as { visible?: unknown; notVisible?: unknown; timeout?: number }
        await this.waitFor(toSelector(visible ?? notVisible), visible !== undefined, timeout ?? DEFAULT_WAIT_MS)
        return
      }
      case "scrollUntilVisible": {
        const { element, direction = "DOWN", timeout = 20_000 } = arg as { element: unknown; direction?: string; timeout?: number }
        const target = toSelector(element)
        const { width, height } = this.screenSize()
        const [from, to] = direction === "UP" ? [0.3, 0.7] : [0.7, 0.3]
        const deadline = Date.now() + timeout
        while (!this.find(target)) {
          if (Date.now() > deadline) throw new Error(`${describe(target)} not found after scrolling ${timeout}ms`)
          const x = String(Math.round(width / 2))
          this.shell(["input", "swipe", x, String(Math.round(height * from)), x, String(Math.round(height * to)), "300"])
          await sleep(POLL_MS)
        }
        return
      }
      case "swipe": {
        // Swipe from the element's center toward the screen edge.
        const { from, direction = "RIGHT", duration = 400 } = arg as { from: unknown; direction?: string; duration?: number }
        const node = await this.waitFor(toSelector(from), true, DEFAULT_WAIT_MS)
        if (!node) return
        const { width, height } = this.screenSize()
        const to = {
          RIGHT: [width - 1, node.y],
          LEFT: [0, node.y],
          DOWN: [node.x, height - 1],
          UP: [node.x, 0],
        }[direction.toUpperCase()]
        if (!to) throw new Error(`unknown swipe direction "${direction}"`)
        this.shell(["input", "swipe", String(node.x), String(node.y), String(to[0]), String(to[1]), String(duration)])
        await sleep(POLL_MS)
        return
      }
      default:
        throw new Error(`unsupported flow command "${name}"`)
    }
  }

  /** Run flow commands in order, logging each with its duration. */
  async runCommands(entries: unknown[], appId: string) {
    for (const entry of entries) {
      const [name, arg] = typeof entry === "string" ? [entry, undefined] : Object.entries(entry as object)[0]
      const began = Date.now()
      try {
        await this.command(name, arg, appId)
      } catch (error) {
        throw prefixError(`${name} ${describeArg(arg)}: `, error)
      }
      this.log(`${name} ${describeArg(arg)} ✓ ${Date.now() - began}ms`)
    }
  }
}

function inside(point: { x: number; y: number }, bounds: Bounds): boolean {
  return point.x >= bounds.x1 && point.x <= bounds.x2 && point.y >= bounds.y1 && point.y <= bounds.y2
}

function sameBounds(a: Bounds, b: Bounds): boolean {
  return a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2
}

function decode(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#10;/g, "\n")
    .replace(/&amp;/g, "&")
}

/** Text selectors match as a full regex; fall back to plain equality for invalid patterns. */
function fullMatch(pattern: string, value: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`, "s").test(value)
  } catch {
    return pattern === value
  }
}

function toSelector(arg: unknown): Selector {
  if (typeof arg === "string") return { text: arg }
  return (arg ?? {}) as Selector
}

function describe(selector: Selector): string {
  const own =
    [
      selector.checked !== undefined && (selector.checked ? "checked" : "unchecked"),
      selector.id && `id "${selector.id}"`,
      selector.text && `"${selector.text}"`,
    ]
      .filter(Boolean)
      .join(" ") || "element"
  const relative = [
    selector.below !== undefined && `below ${describe(toSelector(selector.below))}`,
    selector.above !== undefined && `above ${describe(toSelector(selector.above))}`,
    ...(selector.containsDescendants ?? []).map((inner) => `containing ${describe(toSelector(inner))}`),
  ].filter(Boolean)
  return [own, ...relative].join(" ")
}

function describeArg(arg: unknown): string {
  return arg === undefined ? "" : typeof arg === "string" ? `"${arg}"` : JSON.stringify(arg)
}

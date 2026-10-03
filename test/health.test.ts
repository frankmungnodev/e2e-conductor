import assert from "node:assert/strict"
import { chmodSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { after, describe, it } from "node:test"
import { findDown, listDevicesBounded } from "../src/health.ts"
import { tempDir } from "./temp-dir.ts"

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  after(() => server.close())
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/** A port nothing listens on: bind one, then close it. */
async function closedPortUrl(): Promise<string> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}

const noDevices = () => assert.fail("adb must not be called when no device was picked")

describe("findDown services", () => {
  it("reports only the service that refuses connections, by name", async () => {
    const healthy = await listen(createServer((_request, response) => response.end("ok")))
    const refused = await closedPortUrl()
    const down = await findDown({ api: { url: healthy }, web: { url: refused } }, [], noDevices)
    assert.equal(down.length, 1)
    assert.match(down[0], /^service web\b/)
  })

  it("probes a service with no health path at /", async () => {
    const paths: string[] = []
    const url = await listen(
      createServer((request, response) => {
        paths.push(request.url ?? "")
        response.statusCode = request.url === "/" ? 200 : 503
        response.end()
      }),
    )
    assert.deepEqual(await findDown({ api: { url } }, [], noDevices), [])
    assert.deepEqual(paths, ["/"])
  })
})

describe("findDown devices", () => {
  it("reports a picked device the adb listing lacks", async () => {
    const down = await findDown({}, ["emulator-5554", "R58M"], () => ({ serials: ["R58M"] }))
    assert.deepEqual(down, ["device emulator-5554"])
  })

  it("passes on what the adb lister found wrong", async () => {
    assert.deepEqual(await findDown({}, ["R58M"], () => ({ problem: "adb not responding" })), ["adb not responding"])
  })
})

describe("listDevicesBounded", () => {
  const dir = tempDir("health-adb")
  function fakeAdb(name: string, script: string): string {
    const path = join(dir, name)
    writeFileSync(path, `#!/bin/sh\n${script}\n`)
    chmodSync(path, 0o755)
    return path
  }

  it("lists ready serials", () => {
    const adb = fakeAdb("ok", 'printf "List of devices attached\\nR58M\\tdevice\\nX1\\toffline\\n"')
    assert.deepEqual(listDevicesBounded(adb), { serials: ["R58M"] })
  })

  it("reports adb not responding when adb hangs past 5 seconds", { timeout: 15_000 }, () => {
    const adb = fakeAdb("hang", "exec sleep 30")
    const began = Date.now()
    assert.deepEqual(listDevicesBounded(adb), { problem: "adb not responding" })
    assert.ok(Date.now() - began < 7_000)
  })

  it("reports adb not found when there is no adb", () => {
    assert.deepEqual(listDevicesBounded(undefined), { problem: "adb not found" })
    assert.deepEqual(listDevicesBounded(join(dir, "missing-adb")), { problem: "adb not found" })
  })
})

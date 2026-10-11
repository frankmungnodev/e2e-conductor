import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import { HttpDriver, redact } from "../src/drivers/http.ts"
import type { Step } from "../src/scenario.ts"
import { tempDir } from "./temp-dir.ts"

let server: Server
let url = ""

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/big") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ access_token: "big-secret", padding: "x".repeat(70 * 1024) }))
      return
    }
    if (req.url === "/form") {
      res.writeHead(200, { "content-type": "application/x-www-form-urlencoded" })
      res.end("access_token=form-secret&token_type=bearer")
      return
    }
    if (req.url === "/echo") {
      let body = ""
      req.on("data", (chunk) => {
        body += chunk
      })
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ method: req.method, tag: req.headers["x-tag"], body: body ? JSON.parse(body) : null }))
      })
      return
    }
    res.writeHead(req.url?.startsWith("/login") ? 200 : 500, { "content-type": "application/json", "set-cookie": "sid=abc" })
    res.end(JSON.stringify({ access_token: "secret-token", user: { name: "Ann" } }))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => new Promise<void>((resolve) => server.close(() => resolve())))

const run = (driver: HttpDriver, step: Partial<Step>) =>
  driver.run({ step: { name: "Login", target: "api", ...step } as Step, env: {}, artifactsDir: "", log: () => {} })

describe("HTTP failure evidence", () => {
  it("writes each request and response of a failed scenario, with credentials redacted", async () => {
    const dir = tempDir("http-evidence")
    const driver = new HttpDriver({ url })
    await run(driver, {
      method: "POST",
      url: "/login?api_key=k1&page=2",
      headers: { Authorization: "Bearer t0" },
      body: { email: "a@b.c", password: "hunter2" },
    })
    await run(driver, { name: "Profile", url: "/profile" })
    await driver.endScenario(true, dir)

    const exchanges = JSON.parse(readFileSync(join(dir, "http-exchanges.json"), "utf8"))
    assert.deepEqual(
      exchanges.map((e: { step: string; response: { status: number } }) => [e.step, e.response.status]),
      [
        ["Login", 200],
        ["Profile", 500],
      ],
    )
    const [login, profile] = exchanges
    assert.equal(login.request.url, `${url}/login?api_key=%5Bredacted%5D&page=2`)
    assert.equal(login.request.headers.Authorization, "[redacted]")
    assert.deepEqual(login.request.body, { email: "a@b.c", password: "[redacted]" })
    assert.deepEqual(login.response.body, { access_token: "[redacted]", user: { name: "Ann" } })
    assert.equal(login.response.headers["set-cookie"], "[redacted]")
    assert.equal(profile.request.headers.Cookie, "[redacted]", "the session cookie sent on is redacted too")
    assert.doesNotMatch(readFileSync(join(dir, "http-exchanges.json"), "utf8"), /hunter2|secret-token|Bearer t0|k1|abc/)
  })

  it("writes nothing when the scenario passes, and starts the next scenario empty", async () => {
    const dir = tempDir("http-pass")
    const driver = new HttpDriver({ url })
    await run(driver, { url: "/login" })
    await driver.endScenario(false, dir)
    assert.equal(existsSync(join(dir, "http-exchanges.json")), false)

    await driver.endScenario(true, dir)
    assert.equal(existsSync(join(dir, "http-exchanges.json")), false)
  })

  it("records a request that never got a response with its error", async () => {
    const dir = tempDir("http-error")
    const driver = new HttpDriver({ url: "http://127.0.0.1:1" })
    await assert.rejects(run(driver, { url: "/login" }))
    await driver.endScenario(true, dir)

    const [exchange] = JSON.parse(readFileSync(join(dir, "http-exchanges.json"), "utf8"))
    assert.equal(exchange.response, undefined)
    assert.match(exchange.error, /fetch failed/)
  })

  it("redacts a response body before cutting it to size", async () => {
    const dir = tempDir("http-big")
    const driver = new HttpDriver({ url })
    await run(driver, { url: "/big" })
    await driver.endScenario(true, dir)

    const file = readFileSync(join(dir, "http-exchanges.json"), "utf8")
    const [exchange] = JSON.parse(file)
    assert.match(exchange.response.body, /chars, cut\)$/)
    assert.doesNotMatch(file, /big-secret/)
  })

  it("redacts credentials in a text body, such as a form-encoded token response", async () => {
    const dir = tempDir("http-form")
    const driver = new HttpDriver({ url })
    await run(driver, { url: "/form" })
    await driver.endScenario(true, dir)

    const [exchange] = JSON.parse(readFileSync(join(dir, "http-exchanges.json"), "utf8"))
    assert.equal(exchange.response.body, "access_token=[redacted]&token_type=[redacted]")
  })

  it("sends each action with the step's headers and body, records every exchange, and returns the last result", async () => {
    const dir = tempDir("http-actions")
    const driver = new HttpDriver({ url })
    const result = await run(driver, {
      url: "/echo",
      headers: { "X-Tag": "step" },
      body: { from: "step" },
      actions: [
        { action: "http_post" },
        { action: "http_put", headers: { "X-Tag": "action" }, body: { from: "action" } },
      ],
    } as Partial<Step>)
    await driver.endScenario(true, dir)

    assert.deepEqual(result.data, { method: "PUT", tag: "action", body: { from: "action" } })
    const exchanges = JSON.parse(readFileSync(join(dir, "http-exchanges.json"), "utf8"))
    assert.deepEqual(
      exchanges.map((e: { request: { method: string }; response: { body: unknown } }) => [e.request.method, e.response.body]),
      [
        ["POST", { method: "POST", tag: "step", body: { from: "step" } }],
        ["PUT", { method: "PUT", tag: "action", body: { from: "action" } }],
      ],
    )
  })

  it("redacts credential fields at any depth, inside arrays too", () => {
    assert.deepEqual(redact({ items: [{ token: "x", id: 1 }], nested: { clientSecret: "y" } }), {
      items: [{ token: "[redacted]", id: 1 }],
      nested: { clientSecret: "[redacted]" },
    })
  })
})

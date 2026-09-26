import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getPath, mismatch, type Scope, stringify, substitute } from "../src/context.ts"

const scope: Scope = {
  ctx: { userId: 42, user: { name: "Ann", tags: ["a", "b"] } },
  env: { HOST: "localhost" },
  run: { id: "run-1" },
}

describe("substitute", () => {
  it("replaces placeholders inside a string", () => {
    assert.equal(substitute("http://${env.HOST}/users/${ctx.userId}", scope), "http://localhost/users/42")
  })

  it("keeps the value's type when the string is one placeholder", () => {
    assert.equal(substitute("${ctx.userId}", scope), 42)
    assert.deepEqual(substitute("${ctx.user.tags}", scope), ["a", "b"])
  })

  it("writes non-string values as JSON inside a longer string", () => {
    assert.equal(substitute("tags=${ctx.user.tags}", scope), 'tags=["a","b"]')
  })

  it("walks arrays and objects, keys included", () => {
    const input = { "${ctx.user.name}": ["${run.id}", 1, null], plain: true }
    assert.deepEqual(substitute(input, scope), { Ann: ["run-1", 1, null], plain: true })
  })

  it("throws on an undefined placeholder", () => {
    assert.throws(() => substitute("${ctx.missing}", scope), /\$\{ctx\.missing\} is not defined/)
  })

  it("leaves unknown roots alone", () => {
    assert.equal(substitute("${NAME}", scope), "${NAME}")
  })
})

describe("getPath", () => {
  it("reads dotted and indexed paths", () => {
    assert.equal(getPath({ data: [{ id: 7 }] }, "data[0].id"), 7)
  })

  it("returns undefined when a part is missing", () => {
    assert.equal(getPath({ data: null }, "data.id"), undefined)
    assert.equal(getPath({}, "a.b.c"), undefined)
  })

  it("returns the source for an empty path", () => {
    const source = { a: 1 }
    assert.equal(getPath(source, ""), source)
  })
})

describe("stringify", () => {
  it("keeps strings, writes everything else as JSON", () => {
    assert.equal(stringify("x"), "x")
    assert.equal(stringify(1), "1")
    assert.equal(stringify({ a: 1 }), '{"a":1}')
  })
})

describe("mismatch", () => {
  it("matches deeply equal plain values", () => {
    assert.equal(mismatch({ a: [1] }, { a: [1] }), undefined)
    assert.equal(mismatch(1, 2), "expected 2, got 1")
  })

  it("checks $exists", () => {
    assert.equal(mismatch(0, { $exists: true }), undefined)
    assert.equal(mismatch(undefined, { $exists: false }), undefined)
    assert.match(mismatch(undefined, { $exists: true }) ?? "", /expected \$exists true/)
  })

  it("checks $contains and $notContains against the JSON text", () => {
    assert.equal(mismatch({ msg: "hello world" }, { $contains: "world" }), undefined)
    assert.ok(mismatch(undefined, { $contains: "x" }))
    assert.equal(mismatch("abc", { $notContains: "z" }), undefined)
    assert.equal(mismatch(undefined, { $notContains: "z" }), undefined)
    assert.ok(mismatch("abc", { $notContains: "b" }))
  })

  it("checks $gt and $gte on numbers only", () => {
    assert.equal(mismatch(2, { $gt: 1 }), undefined)
    assert.ok(mismatch(1, { $gt: 1 }))
    assert.equal(mismatch(1, { $gte: 1 }), undefined)
    assert.ok(mismatch("2", { $gt: 1 }))
  })

  it("combines operators in one object", () => {
    assert.equal(mismatch(5, { $gt: 1, $exists: true }), undefined)
    assert.ok(mismatch(0, { $gt: 1, $exists: true }))
  })

  it("rejects unknown operators", () => {
    assert.equal(mismatch(1, { $lt: 2 }), "unknown operator $lt")
  })

  it("treats an object with plain and $ keys as a plain value", () => {
    assert.equal(mismatch({ a: 1, $b: 2 }, { a: 1, $b: 2 }), undefined)
  })
})

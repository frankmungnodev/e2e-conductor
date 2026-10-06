import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseSelector } from "../src/drivers/mobile.ts"

describe("mobile action selectors", () => {
  it("reads id= as a resource id and anything else as a text pattern", () => {
    assert.deepEqual(parseSelector("id=search_text_field"), { id: "search_text_field" })
    assert.deepEqual(parseSelector("text=id=literal"), { text: "id=literal" })
    assert.deepEqual(parseSelector("\\d+\\. Hymn"), { text: "\\d+\\. Hymn" })
  })
})

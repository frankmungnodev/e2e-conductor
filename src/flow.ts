import { readFileSync } from "node:fs"
import { parseAllDocuments } from "yaml"
import { describeErrors, validateFlowDocument } from "./schema.ts"

/**
 * Problems in a flow file, found before a run so a typo fails without a device.
 * Checks the file as written, before `${NAME}` placeholders are replaced.
 */
export function checkFlow(file: string): string[] {
  const documents = parseAllDocuments(readFileSync(file, "utf8"))
  const syntax = documents.flatMap((doc) => doc.errors.map((error) => error.message))
  if (syntax.length > 0) return syntax

  const values = documents.map((doc) => doc.toJS())
  if (values.length > 2) return [`has ${values.length} YAML documents; expected a header, then the commands`]
  const [header, commands] = values.length === 2 ? values : [undefined, values[0]]

  const problems: string[] = []
  if (header !== undefined && (typeof header !== "object" || header === null || Array.isArray(header))) {
    problems.push("header (the first YAML document) must be a mapping")
  } else if (header !== undefined && !validateFlowDocument(header)) {
    problems.push(...describeErrors(validateFlowDocument.errors).map((error) => `header ${error}`))
  }
  if (!Array.isArray(commands)) {
    problems.push("commands must be a YAML list")
  } else if (!validateFlowDocument(commands)) {
    problems.push(...describeErrors(validateFlowDocument.errors).map((error) => `commands ${error}`))
  }
  return problems
}

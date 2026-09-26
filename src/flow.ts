import { readFileSync } from "node:fs"
import { parseAllDocuments } from "yaml"
import { describeErrors, validateFlowDocument } from "./schema.ts"

/** Split flow YAML into its header (the first document, when there are two) and its command list. */
export function parseFlow(source: string) {
  const documents = parseAllDocuments(source)
  const values = documents.map((doc) => doc.toJS())
  const [header, commands] = values.length > 1 ? values : [undefined, values[0]]
  return {
    header: header as unknown,
    commands: commands as unknown,
    documentCount: values.length,
    syntaxErrors: documents.flatMap((doc) => doc.errors.map((error) => error.message)),
  }
}

/**
 * Problems in a flow file, found before a run so a typo fails without a device.
 * Checks the file as written, before `${NAME}` placeholders are replaced.
 */
export function checkFlow(file: string): string[] {
  const { header, commands, documentCount, syntaxErrors } = parseFlow(readFileSync(file, "utf8"))
  if (syntaxErrors.length > 0) return syntaxErrors
  if (documentCount > 2) return [`has ${documentCount} YAML documents; expected a header, then the commands`]

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

import { relative } from "node:path"
import { fileURLToPath } from "node:url"
import { Ajv, type ErrorObject } from "ajv"
import flowSchema from "../schema/v1/flow.schema.json" with { type: "json" }
import scenarioSchema from "../schema/v1/scenario.schema.json" with { type: "json" }

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true })
export const validateScenario = ajv.compile(scenarioSchema)
/** One YAML document of a flow file: the header object or the command list. */
export const validateFlowDocument = ajv.compile(flowSchema)

/** One line per error, naming the offending key or the allowed value where Ajv knows it. */
export function describeErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => {
    const line = `${error.instancePath || "/"} ${error.message}`
    if (error.keyword === "additionalProperties") return `${line}: "${error.params.additionalProperty}"`
    if (error.keyword === "const") return `${line} ${JSON.stringify(error.params.allowedValue)}`
    if (error.keyword === "enum") return `${line}: ${error.params.allowedValues.join(", ")}`
    return line
  })
}

/**
 * The `$schema` value for a scenario file in `dir`: a relative path to this package's scenario schema,
 * wherever the package is installed (a dependency, a global link, a checkout), so editors find it.
 */
export function scenarioSchemaRef(dir: string): string {
  return relative(dir, fileURLToPath(new URL("../schema/v1/scenario.schema.json", import.meta.url)))
}

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/** Toast text after an export, e.g. "Exported 2 scenarios and 1 preset to JSON files". */
export function exportSummary(scenarioCount: number, presetCount: number): string {
  return `Exported ${countOf(scenarioCount, "scenario")} and ${countOf(presetCount, "preset")} to JSON files`
}

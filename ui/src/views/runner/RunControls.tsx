import { ChevronDown, ChevronRight, Play, Sliders, Square } from "lucide-react"
import { Button } from "../../components/Button.tsx"
import { Checkbox } from "../../components/Checkbox.tsx"
import { NumberInput } from "../../components/NumberInput.tsx"
import type { RunOptions } from "./useRunOptions.ts"

export interface RunControlsProps {
  options: RunOptions
  isRunning: boolean
  selectedScenarios: string[]
  onStopRun: () => void
  handleRun: () => void
}

/** Run options accordion and the start/stop button at the foot of the sidebar. */
export function RunControls({
  options,
  isRunning,
  selectedScenarios,
  onStopRun,
  handleRun,
}: RunControlsProps) {
  const {
    repeat,
    setRepeat,
    startServices,
    setStartServices,
    installMobile,
    setInstallMobile,
    headless,
    setHeadless,
    verbose,
    setVerbose,
    pauseOnFailure,
    setPauseOnFailure,
    stepScreenshots,
    setStepScreenshots,
    showOptions,
    setShowOptions,
  } = options
  return (
    <div className="p-3 border-t border-border bg-titlebar flex flex-col gap-2.5">
      {/* Options Dropdown Accordion */}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setShowOptions(!showOptions)}
          className="w-full justify-between text-xs text-fg-muted hover:text-fg font-medium py-1 px-1.5"
        >
          <div className="flex items-center gap-1.5">
            <Sliders className="w-3 h-3 text-fg-muted" />
            <span>Run Options</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            <span>
              {repeat > 1 ? `${repeat} times · ` : ""}
              {pauseOnFailure ? "Pause on failure · " : ""}
              {stepScreenshots ? "Screenshots · " : ""}
              {headless ? "Browser hidden" : "Browser shown"}
            </span>
            {showOptions ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </div>
        </Button>

        {showOptions && (
          <div className="mt-2 pt-2 border-t border-border/60 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-fg-muted">Repeat Iterations:</span>
              <div className="w-20">
                <NumberInput
                  aria-label="Repeat iterations"
                  size="xs"
                  min={1}
                  max={100}
                  value={repeat}
                  onChange={(val) => setRepeat(val ?? 1)}
                  disabled={isRunning}
                  className="text-center"
                />
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <Checkbox
                size="sm"
                label="Pause on Failure"
                checked={pauseOnFailure}
                onChange={(e) => setPauseOnFailure(e.target.checked)}
                disabled={isRunning}
              />
              <Checkbox
                size="sm"
                label="Screenshot Every Step"
                checked={stepScreenshots}
                onChange={(e) => setStepScreenshots(e.target.checked)}
                disabled={isRunning}
              />
              <Checkbox
                size="sm"
                label="Auto-Start Servers"
                checked={startServices}
                onChange={(e) => setStartServices(e.target.checked)}
                disabled={isRunning}
              />
              <Checkbox
                size="sm"
                label="Silent Browser (Headless)"
                checked={headless}
                onChange={(e) => setHeadless(e.target.checked)}
                disabled={isRunning}
              />
              <Checkbox
                size="sm"
                label="Detailed Output Logs"
                checked={verbose}
                onChange={(e) => setVerbose(e.target.checked)}
              />
              <Checkbox
                size="sm"
                label="Install Mobile App"
                checked={installMobile}
                onChange={(e) => setInstallMobile(e.target.checked)}
                disabled={isRunning}
              />
            </div>
          </div>
        )}
      </div>

      {/* Primary Action Button */}
      {isRunning ? (
        <Button
          variant="danger"
          size="md"
          onClick={onStopRun}
          className="w-full justify-center font-semibold shadow-xs"
          icon={<Square className="w-3.5 h-3.5 fill-current" />}
        >
          Stop Execution
        </Button>
      ) : (
        <Button
          variant="primary"
          size="md"
          onClick={handleRun}
          disabled={selectedScenarios.length === 0}
          className="w-full justify-center font-semibold shadow-xs"
          icon={<Play className="w-3.5 h-3.5 fill-current" />}
        >
          Start Run ({selectedScenarios.length} Scenario{selectedScenarios.length === 1 ? "" : "s"})
        </Button>
      )}
    </div>
  )
}

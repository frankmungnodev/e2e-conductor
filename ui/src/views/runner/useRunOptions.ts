import { useState } from "react"

/** Run settings chosen in the sidebar, applied to every run started from the view. */
export function useRunOptions() {
  const [repeat, setRepeat] = useState<number>(1)
  const [startServices, setStartServices] = useState<boolean>(true)
  const [installMobile, setInstallMobile] = useState<boolean>(false)
  const [headless, setHeadless] = useState<boolean>(false)
  const [verbose, setVerbose] = useState<boolean>(true)
  const [pauseOnFailure, setPauseOnFailure] = useState<boolean>(false)
  const [showOptions, setShowOptions] = useState<boolean>(false)
  return {
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
    showOptions,
    setShowOptions,
  }
}

export type RunOptions = ReturnType<typeof useRunOptions>

import { useState } from "react"
import { deleteFixture, runFixtureTest, saveFixture } from "../../api.ts"
import type { useConfirmDialog } from "../../components/ConfirmModal.tsx"
import { useToast } from "../../components/Toast.tsx"
import type { ConfigMeta } from "../../types.ts"

export type FixtureModalState = {
  isOpen: boolean
  isEditing: boolean
  name: string
  cmd: string
  cwd: string
}

export type FixtureRunState = {
  isOpen: boolean
  name: string
  cmd: string
  isRunning: boolean
  exitCode?: number
  output?: string
  durationMs?: number
}

export type FixtureListItem = { name: string; cmd: string; cwd?: string }

/** Fixture list plus the add/edit modal, test-run modal, and delete confirmation for the fixtures tab. */
export function useFixtures(
  config: ConfigMeta | null,
  onConfigReload: () => void,
  confirm: ReturnType<typeof useConfirmDialog>["confirm"],
) {
  const { error: toastError, success: toastSuccess } = useToast()
  // Fixture modals state
  const [fixtureModal, setFixtureModal] = useState<FixtureModalState>({
    isOpen: false,
    isEditing: false,
    name: "",
    cmd: "",
    cwd: "",
  })
  const [isSavingFixture, setIsSavingFixture] = useState(false)

  const [fixtureRunState, setFixtureRunState] = useState<FixtureRunState>({
    isOpen: false,
    name: "",
    cmd: "",
    isRunning: false,
  })

  const handleOpenAddFixture = () => {
    setFixtureModal({
      isOpen: true,
      isEditing: false,
      name: "",
      cmd: "",
      cwd: "",
    })
  }

  const handleOpenEditFixture = (name: string) => {
    const meta = config?.fixturesMap?.[name]
    setFixtureModal({
      isOpen: true,
      isEditing: true,
      name,
      cmd: meta?.cmd || "",
      cwd: meta?.cwd || "",
    })
  }

  const handleSaveFixture = async () => {
    if (!fixtureModal.name.trim()) {
      toastError("Fixture name is required", "Validation Error")
      return
    }
    if (!fixtureModal.cmd.trim()) {
      toastError("Shell command is required", "Validation Error")
      return
    }

    setIsSavingFixture(true)
    try {
      await saveFixture(fixtureModal.name.trim(), {
        cmd: fixtureModal.cmd.trim(),
        cwd: fixtureModal.cwd.trim() || undefined,
      })
      toastSuccess(`Fixture "${fixtureModal.name.trim()}" saved`, "Fixture Saved")
      setFixtureModal((prev) => ({ ...prev, isOpen: false }))
      onConfigReload()
    } catch (err) {
      toastError((err as Error).message, "Failed to Save Fixture")
    } finally {
      setIsSavingFixture(false)
    }
  }

  const handleDeleteFixture = (name: string) => {
    confirm({
      title: "Remove Fixture",
      message: (
        <span>
          Are you sure you want to remove fixture{" "}
          <strong className="text-fg-bright font-mono">"{name}"</strong>?
        </span>
      ),
      confirmText: "Remove Fixture",
      variant: "danger",
      onConfirm: async () => {
        try {
          await deleteFixture(name)
          toastSuccess(`Fixture "${name}" removed`, "Fixture Removed")
          onConfigReload()
        } catch (err) {
          toastError((err as Error).message, "Failed to Delete Fixture")
        }
      },
    })
  }

  const handleTestRunFixture = async (name: string) => {
    const cmd = config?.fixturesMap?.[name]?.cmd || ""
    setFixtureRunState({
      isOpen: true,
      name,
      cmd,
      isRunning: true,
      output: undefined,
      exitCode: undefined,
    })

    try {
      const res = await runFixtureTest({ name })
      setFixtureRunState((prev) => ({
        ...prev,
        isRunning: false,
        exitCode: res.exitCode,
        output: res.output,
        durationMs: res.durationMs,
      }))
      if (res.exitCode === 0) {
        toastSuccess(`Fixture "${name}" executed successfully (${res.durationMs}ms)`, "Command Succeeded")
      } else {
        toastError(`Command exited with code ${res.exitCode}`, "Fixture Failed")
      }
    } catch (err) {
      setFixtureRunState((prev) => ({
        ...prev,
        isRunning: false,
        exitCode: 1,
        output: (err as Error).message,
      }))
      toastError((err as Error).message, "Execution Error")
    }
  }

  // Get list of all fixtures
  const fixturesList: FixtureListItem[] = Object.keys(config?.fixturesMap ?? {}).length > 0
    ? Object.entries(config?.fixturesMap ?? {}).map(([name, fix]) => ({
        name,
        cmd: fix.cmd,
        cwd: fix.cwd,
      }))
    : (config?.fixtures ?? []).map((name) => ({
        name,
        cmd: "echo (shell command not specified)",
        cwd: undefined,
      }))

  return {
    fixturesList,
    fixtureModal,
    setFixtureModal,
    isSavingFixture,
    fixtureRunState,
    setFixtureRunState,
    handleOpenAddFixture,
    handleOpenEditFixture,
    handleSaveFixture,
    handleDeleteFixture,
    handleTestRunFixture,
  }
}

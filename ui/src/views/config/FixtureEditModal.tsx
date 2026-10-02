import { Check } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"
import { Button } from "../../components/Button.tsx"
import { FormField, Input } from "../../components/FormControls.tsx"
import { Modal } from "../../components/Modal.tsx"
import type { FixtureModalState } from "./useFixtures.tsx"

export interface FixtureEditModalProps {
  fixtureModal: FixtureModalState
  setFixtureModal: Dispatch<SetStateAction<FixtureModalState>>
  isSavingFixture: boolean
  handleSaveFixture: () => void
}

/** Add or edit one setup fixture. */
export function FixtureEditModal({
  fixtureModal,
  setFixtureModal,
  isSavingFixture,
  handleSaveFixture,
}: FixtureEditModalProps) {
  return (
    <Modal
      isOpen={fixtureModal.isOpen}
      onClose={() => setFixtureModal((prev) => ({ ...prev, isOpen: false }))}
      title={fixtureModal.isEditing ? "Edit Fixture" : "Add Setup Fixture"}
      description="Agnostic shell command to execute before running scenarios."
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setFixtureModal((prev) => ({ ...prev, isOpen: false }))}
            disabled={isSavingFixture}
          >
            Cancel
          </Button>
          <Button
            size="xs"
            variant="primary"
            onClick={handleSaveFixture}
            isLoading={isSavingFixture}
            icon={<Check className="w-3.5 h-3.5" />}
          >
            Save Fixture
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField label="Fixture Name" hint="Identifier in scenario setup list e.g. db:seed" required>
          <Input
            value={fixtureModal.name}
            onChange={(e) => setFixtureModal((prev) => ({ ...prev, name: e.target.value }))}
            disabled={fixtureModal.isEditing}
            placeholder="e.g. db:seed"
            mono
          />
        </FormField>

        <FormField label="Shell Command" hint="Command to execute in project terminal" required>
          <Input
            value={fixtureModal.cmd}
            onChange={(e) => setFixtureModal((prev) => ({ ...prev, cmd: e.target.value }))}
            placeholder="e.g. pnpm run db:seed"
            mono
          />
        </FormField>

        <FormField label="Working Directory (CWD)" hint="Optional relative path where command will run">
          <Input
            value={fixtureModal.cwd}
            onChange={(e) => setFixtureModal((prev) => ({ ...prev, cwd: e.target.value }))}
            placeholder="e.g. apps/backend (defaults to project root)"
            mono
          />
        </FormField>
      </div>
    </Modal>
  )
}

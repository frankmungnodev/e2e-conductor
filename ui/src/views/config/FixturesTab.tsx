import { Edit, Play, Plus, Terminal, Trash2 } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import type { FixtureListItem } from "./useFixtures.tsx"

export interface FixturesTabProps {
  fixturesList: FixtureListItem[]
  handleOpenAddFixture: () => void
  handleOpenEditFixture: (name: string) => void
  handleTestRunFixture: (name: string) => void
  handleDeleteFixture: (name: string) => void
}

/** Setup fixtures with test-run, edit, and delete actions. */
export function FixturesTab({
  fixturesList,
  handleOpenAddFixture,
  handleOpenEditFixture,
  handleTestRunFixture,
  handleDeleteFixture,
}: FixturesTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-fg-bright flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-warning" /> Setup Fixtures
            </h2>
            <Badge variant="neutral" size="xs">{fixturesList.length} Fixtures</Badge>
          </div>
          <p className="text-xs text-fg-muted mt-1">
            Shell commands executed before scenario runs to prepare system state (e.g. seed database, start Docker).
          </p>
        </div>

        <Button
          size="xs"
          variant="primary"
          onClick={handleOpenAddFixture}
          icon={<Plus className="w-3.5 h-3.5" />}
        >
          Add Fixture
        </Button>
      </div>

      {fixturesList.length === 0 ? (
        <div className="bg-sidebar border border-border border-dashed rounded-xs p-10 text-center space-y-3 max-w-lg mx-auto mt-8">
          <Terminal className="w-10 h-10 text-fg-muted mx-auto" />
          <div className="text-xs text-fg-muted leading-normal">
            No fixtures configured. Add a shell command fixture (e.g.{" "}
            <code className="text-fg font-mono">pnpm run db:seed</code>,{" "}
            <code className="text-fg font-mono">python seed.py</code>) to prepare state before tests.
          </div>
          <Button
            size="xs"
            variant="primary"
            onClick={handleOpenAddFixture}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Create First Fixture
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {fixturesList.map((fix) => (
            <div
              key={fix.name}
              className="bg-sidebar border border-border rounded-xs p-3.5 flex items-center justify-between gap-4 hover:border-border-light transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xs bg-editor flex items-center justify-center shrink-0 border border-border">
                  <Terminal className="w-4 h-4 text-warning" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-fg-bright">{fix.name}</span>
                    {fix.cwd && (
                      <span className="text-xs font-mono text-fg-muted bg-editor px-1.5 py-0.5 rounded-xs border border-border">
                        cwd: {fix.cwd}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-fg-muted truncate mt-0.5 max-w-xl">
                    $ {fix.cmd}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => handleTestRunFixture(fix.name)}
                  icon={<Play className="w-3 h-3 text-success" />}
                >
                  Run Test
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => handleOpenEditFixture(fix.name)}
                  icon={<Edit className="w-3 h-3" />}
                >
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => handleDeleteFixture(fix.name)}
                  className="text-error hover:text-error hover:bg-error-bg"
                  icon={<Trash2 className="w-3 h-3" />}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

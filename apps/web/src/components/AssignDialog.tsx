import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { fetchAllPages } from '@/lib/fetchAllPages'

export type AssigneePick = { kind: 'user' | 'team'; id: string; label: string }

type Option = { id: string; label: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectKey: string
  onAssign: (assignee: AssigneePick) => void
  title?: string
}

// A real search-and-pick UI scoped to the project's actual membership
// (link-run-item-assignee-to-identity) — free text is no longer accepted.
// Reuses UserPicker's search-dialog shape, extended with a Teams section:
// assigning to a team has different real-world meaning (shared ownership)
// than assigning to one person, so they stay visually distinct.
export function AssignDialog({ open, onOpenChange, projectKey, onAssign, title }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<Option[]>([])
  const [teams, setTeams] = useState<Option[]>([])
  // fetchAllPages caps its drain (security review, add-cursor-pagination
  // task 12.1d) — a tenant with more members than that ceiling would
  // otherwise silently miss assignees below the fold. `query` already lets
  // a user narrow past a truncated set, so this only needs a visible hint,
  // not a blocking error.
  const [truncated, setTruncated] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    let cancelled = false
    void Promise.all([
      api.GET('/api/v1/projects/{projectKey}/members', { params: { path: { projectKey } } }),
      fetchAllPages((cursor) =>
        api.GET('/api/v1/users', { params: { query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
      ),
      fetchAllPages((cursor) =>
        api.GET('/api/v1/teams', { params: { query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
      ),
    ]).then(([{ data: membership }, allUsers, allTeams]) => {
      if (cancelled) return
      const memberUserIds = new Set((membership?.users ?? []).map((m) => m.userId))
      const memberTeamIds = new Set((membership?.teams ?? []).map((team) => team.teamId))
      setUsers(
        allUsers.items
          .filter((u) => memberUserIds.has(u.id))
          .map((u) => ({ id: u.id, label: u.email })),
      )
      setTeams(
        allTeams.items
          .filter((team) => memberTeamIds.has(team.id))
          .map((team) => ({ id: team.id, label: team.name })),
      )
      setTruncated(allUsers.truncated || allTeams.truncated)
    })
    return () => {
      cancelled = true
    }
  }, [open, projectKey])

  const filteredUsers = useMemo(
    () => users.filter((u) => u.label.toLowerCase().includes(query.toLowerCase())),
    [users, query],
  )
  const filteredTeams = useMemo(
    () => teams.filter((team) => team.label.toLowerCase().includes(query.toLowerCase())),
    [teams, query],
  )

  function pick(kind: AssigneePick['kind'], id: string, label: string) {
    onAssign({ kind, id, label })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>{title ?? t('AssignDialog.defaultTitle')}</DialogTitle>
        <Input
          autoFocus
          placeholder={t('AssignDialog.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {truncated && !query && (
          <p className="px-2 text-xs text-muted-foreground">
            {t('AssignDialog.truncatedNote')}
          </p>
        )}
        {filteredUsers.length === 0 && filteredTeams.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">{t('AssignDialog.noMatchingMembers')}</p>
        ) : (
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {filteredUsers.length > 0 && (
              <div>
                <p className="tp-label px-2 text-muted-foreground">{t('AssignDialog.peopleLabel')}</p>
                <ul className="space-y-1">
                  {filteredUsers.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => pick('user', u.id, u.label)}
                      >
                        {u.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {filteredTeams.length > 0 && (
              <div>
                <p className="tp-label px-2 text-muted-foreground">{t('AssignDialog.teamsLabel')}</p>
                <ul className="space-y-1">
                  {filteredTeams.map((team) => (
                    <li key={team.id}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => pick('team', team.id, team.label)}
                      >
                        {team.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

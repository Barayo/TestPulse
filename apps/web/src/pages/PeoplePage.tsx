import { useEffect, useState, type FormEvent } from 'react'
import { Trash2Icon } from 'lucide-react'
import { useAuth } from '@/lib/useAuth'
import { api } from '@/lib/api'
import { isValidEmail } from '@/lib/email'
import { avatarStyle, initialsFor } from '@/lib/avatar'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Breadcrumbs } from '@/components/Breadcrumbs'

type User = {
  id: string
  email: string
  isTenantAdmin: boolean
  avatarKey?: string | null
  deactivatedAt: string | null
}
type Team = { id: string; name: string; memberIds: string[]; createdAt: string }
type UserOption = { id: string; email: string }

// Client-side reveal batch for a team's member list — GET /api/v1/teams
// returns every memberId up front (no server pagination yet), so this just
// keeps an expanded team from dumping a huge list into the page at once.
const MEMBER_BATCH_SIZE = 5

// Same client-side-reveal reasoning for the top-level Users roster — GET
// /api/v1/users returns everyone up front (no server pagination yet), so
// this just keeps the page from rendering a huge list on first load.
const USER_BATCH_SIZE = 10

// Directory search (add member) results cap — filtering existing members
// and searching the whole directory to add someone new are different tasks
// with different scale problems: filtering narrows an already-bounded list,
// but a directory search against a large org could match hundreds of
// people. Capping the shown results (with a "N more" hint) keeps the
// inline results list from ever dumping an unbounded list into the page.
const ADD_RESULTS_CAP = 8

export default function PeoplePage() {
  const { user: me } = useAuth()

  const [users, setUsers] = useState<User[]>([])
  const [teams, setTeams] = useState<Team[]>([])

  const [userFormOpen, setUserFormOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [visibleUserCount, setVisibleUserCount] = useState(USER_BATCH_SIZE)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isTenantAdmin, setIsTenantAdmin] = useState(false)
  const [createUserError, setCreateUserError] = useState<string>()
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)

  const [teamFormOpen, setTeamFormOpen] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [expandedTeamId, setExpandedTeamId] = useState<string>()
  const [memberFilter, setMemberFilter] = useState('')
  const [visibleCount, setVisibleCount] = useState(MEMBER_BATCH_SIZE)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [removeTarget, setRemoveTarget] = useState<{ teamId: string; user: UserOption } | null>(null)

  async function load() {
    const [{ data: u }, { data: t }] = await Promise.all([api.GET('/api/v1/users'), api.GET('/api/v1/teams')])
    if (u) setUsers(u as User[])
    if (t) setTeams(t as Team[])
  }

  useEffect(() => {
    if (me?.isTenantAdmin) void load()
  }, [me])

  if (!me?.isTenantAdmin) {
    return <p className="text-sm text-muted-foreground">Not authorized — admin only.</p>
  }

  const sortedUsers = [...users].sort((a, b) => a.email.localeCompare(b.email))
  const filteredUsers = userSearch
    ? sortedUsers.filter((u) => u.email.toLowerCase().includes(userSearch.toLowerCase()))
    : sortedUsers
  const visibleUsers = filteredUsers.slice(0, visibleUserCount)
  const remainingUserCount = filteredUsers.length - visibleUsers.length
  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name))

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault()
    setCreateUserError(undefined)
    if (!isValidEmail(email)) {
      setCreateUserError('Enter a valid email address')
      return
    }
    const { error: apiError } = await api.POST('/api/v1/users', { body: { email, password, isTenantAdmin } })
    if (apiError) {
      setCreateUserError((apiError as { error?: string }).error ?? 'failed to create user')
      return
    }
    setEmail('')
    setPassword('')
    setIsTenantAdmin(false)
    setUserFormOpen(false)
    await load()
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return
    await api.PATCH('/api/v1/users/{userId}', {
      params: { path: { userId: deactivateTarget.id } },
      body: { deactivate: true },
    })
    setDeactivateTarget(null)
    await load()
  }

  async function handleReactivate(userId: string) {
    await api.PATCH('/api/v1/users/{userId}', { params: { path: { userId } }, body: { reactivate: true } })
    await load()
  }

  async function handleCreateTeam(e: FormEvent) {
    e.preventDefault()
    if (!teamName.trim()) return
    await api.POST('/api/v1/teams', { body: { name: teamName } })
    setTeamName('')
    setTeamFormOpen(false)
    await load()
  }

  function toggleExpand(teamId: string) {
    if (expandedTeamId === teamId) {
      setExpandedTeamId(undefined)
      return
    }
    setExpandedTeamId(teamId)
    setMemberFilter('')
    setVisibleCount(MEMBER_BATCH_SIZE)
    setAddMemberOpen(false)
    setAddSearch('')
  }

  async function handleAddMember(teamId: string, userId: string) {
    await api.POST('/api/v1/teams/{teamId}/members/{userId}', { params: { path: { teamId, userId } } })
    setAddSearch('')
    await load()
  }

  async function handleRemoveMember() {
    if (!removeTarget) return
    await api.DELETE('/api/v1/teams/{teamId}/members/{userId}', {
      params: { path: { teamId: removeTarget.teamId, userId: removeTarget.user.id } },
    })
    setRemoveTarget(null)
    await load()
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'People' }]} />

      {/* Teams before Users: fewer teams than users in the common case, so
          the shorter list is what you see first, with no scrolling past
          a long roster to reach it. */}

      {/* ===== Teams ===== */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="tp-heading text-xl">
            Teams<span className="ml-2 text-sm font-normal text-muted-foreground">{teams.length}</span>
          </h1>
          <Button size="sm" onClick={() => setTeamFormOpen((open) => !open)}>
            + New team
          </Button>
        </div>

        {teamFormOpen && (
          <Card>
            <CardHeader>
              <CardTitle className="tp-heading">New team</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateTeam} className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="team-name">Team name</Label>
                  <Input id="team-name" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="QA Core" />
                </div>
                <Button type="submit">Create team</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams yet.</p>
        ) : (
          <ul className="space-y-3">
            {sortedTeams.map((t) => {
              const expanded = expandedTeamId === t.id
              const memberUsers = t.memberIds.map(
                (id) => users.find((u) => u.id === id) ?? { id, email: id, avatarKey: null },
              )
              // Filtering existing members and searching the directory to
              // add someone new are different tasks that scale differently
              // (one narrows an already-bounded list; the other searches
              // the whole user base) — kept as two separate controls
              // rather than one box doing both jobs.
              const filteredMemberUsers = memberFilter
                ? memberUsers.filter((u) => u.email.toLowerCase().includes(memberFilter.toLowerCase()))
                : memberUsers
              const visibleMembers = filteredMemberUsers.slice(0, visibleCount)
              const remainingCount = filteredMemberUsers.length - visibleMembers.length
              const addableUsers = users.filter((u) => !t.memberIds.includes(u.id))
              const matchingAddable = addSearch
                ? addableUsers.filter((u) => u.email.toLowerCase().includes(addSearch.toLowerCase()))
                : []
              const visibleAddable = matchingAddable.slice(0, ADD_RESULTS_CAP)
              const hiddenAddableCount = matchingAddable.length - visibleAddable.length

              return (
                <li key={t.id} className="overflow-hidden rounded-lg border">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent ${expanded ? 'border-b' : ''}`}
                    onClick={() => toggleExpand(t.id)}
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                      style={avatarStyle(t.name)}
                    >
                      {initialsFor(t.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {t.memberIds.length} {t.memberIds.length === 1 ? 'member' : 'members'}
                    </span>
                  </button>

                  {expanded && (
                    <div className="space-y-3 p-3">
                      {/* Always-visible, filters only what's already on the
                          team — sits above the list it filters so it's
                          visible before scrolling and stays put as "Show
                          more" grows the list beneath it. */}
                      <Input
                        placeholder="Filter members…"
                        value={memberFilter}
                        onChange={(e) => {
                          setMemberFilter(e.target.value)
                          setVisibleCount(MEMBER_BATCH_SIZE)
                        }}
                      />

                      {memberUsers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No members yet in this team.</p>
                      ) : filteredMemberUsers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No members match "{memberFilter}".</p>
                      ) : (
                        <>
                          <ul className="divide-y rounded-md border text-sm">
                            {visibleMembers.map((u) => (
                              <li key={u.id} className="flex items-center justify-between px-2 py-1.5">
                                <span className="flex items-center gap-2">
                                  <Avatar
                                    seed={u.email}
                                    avatarKey={u.avatarKey}
                                    userId={u.id}
                                    className="size-5 rounded-full text-[10px]"
                                  />
                                  {u.email}
                                </span>
                                {/* Removing a member cascades to whatever
                                    access this team grants on any project —
                                    gated behind a confirmation dialog, same
                                    pattern as user deactivation. */}
                                <button
                                  type="button"
                                  aria-label={`Remove ${u.email}`}
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => setRemoveTarget({ teamId: t.id, user: u })}
                                >
                                  <Trash2Icon className="size-4" aria-hidden="true" />
                                </button>
                              </li>
                            ))}
                          </ul>
                          {remainingCount > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setVisibleCount((c) => c + MEMBER_BATCH_SIZE)}
                            >
                              Show {Math.min(remainingCount, MEMBER_BATCH_SIZE)} more
                            </Button>
                          )}
                        </>
                      )}

                      {/* Adding is a deliberate, secondary action — same
                          hidden-until-requested convention as "New user"/
                          "New team" — and searches the whole directory, not
                          just this team, so it's a different control from
                          the filter box above, not a second job for it. */}
                      {addMemberOpen ? (
                        <div className="space-y-1">
                          <Input
                            autoFocus
                            placeholder="Search directory…"
                            value={addSearch}
                            onChange={(e) => setAddSearch(e.target.value)}
                          />
                          {addSearch && (
                            <div className="rounded-md border text-sm">
                              <ul className="max-h-40 overflow-y-auto">
                                {visibleAddable.length === 0 ? (
                                  <li className="p-2 text-muted-foreground">No matching users.</li>
                                ) : (
                                  visibleAddable.map((u) => (
                                    <li key={u.id}>
                                      <button
                                        type="button"
                                        className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                                        onClick={() => void handleAddMember(t.id, u.id)}
                                      >
                                        {u.email}
                                      </button>
                                    </li>
                                  ))
                                )}
                              </ul>
                              {hiddenAddableCount > 0 && (
                                <p className="border-t px-2 py-1.5 text-muted-foreground">
                                  {hiddenAddableCount} more — keep typing to narrow it down
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Button type="button" variant="outline" size="sm" onClick={() => setAddMemberOpen(true)}>
                          + Add member
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ===== Users ===== */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="tp-heading text-xl">
            Users<span className="ml-2 text-sm font-normal text-muted-foreground">{users.length}</span>
          </h2>
          <Button size="sm" onClick={() => setUserFormOpen((open) => !open)}>
            + New user
          </Button>
        </div>

        {userFormOpen && (
          <Card>
            <CardHeader>
              <CardTitle className="tp-heading">New user</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="new-user-email">Email</Label>
                  <Input id="new-user-email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-user-password">Password</Label>
                  <Input
                    id="new-user-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <input
                    id="new-user-tenant-admin"
                    type="checkbox"
                    checked={isTenantAdmin}
                    onChange={(e) => setIsTenantAdmin(e.target.checked)}
                    className="size-4"
                  />
                  <Label htmlFor="new-user-tenant-admin">Tenant Admin</Label>
                </div>
                <Button type="submit">Create</Button>
              </form>
              {createUserError && <p className="mt-2 text-sm text-destructive">{createUserError}</p>}
            </CardContent>
          </Card>
        )}

        <Input
          placeholder="Search by email…"
          value={userSearch}
          onChange={(e) => {
            setUserSearch(e.target.value)
            setVisibleUserCount(USER_BATCH_SIZE)
          }}
        />

        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-[1fr_36px] items-center gap-3 border-b px-4 py-2 sm:grid-cols-[1fr_140px_120px_36px]">
            <span className="tp-label">Person</span>
            <span className="tp-label hidden sm:block">Role</span>
            <span className="tp-label hidden sm:block">Status</span>
            <span />
          </div>
          {filteredUsers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No users match "{userSearch}".</p>
          ) : (
          <ul aria-label="Users" className="text-sm">
            {visibleUsers.map((u) => (
              <li
                key={u.id}
                className="group grid grid-cols-[1fr_36px] items-center gap-3 border-b px-4 py-2 last:border-b-0 sm:grid-cols-[1fr_140px_120px_36px]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar seed={u.email} avatarKey={u.avatarKey} userId={u.id} className="size-7 rounded-full text-xs" />
                  <span className="truncate font-semibold">{u.email}</span>
                </div>
                <div className="hidden text-muted-foreground sm:block">{u.isTenantAdmin ? 'Tenant Admin' : 'Member'}</div>
                <div className="hidden items-center gap-1.5 text-muted-foreground sm:flex">
                  <span className={`size-1.5 rounded-full ${u.deactivatedAt ? 'bg-border' : 'bg-primary'}`} />
                  {u.deactivatedAt ? 'Deactivated' : 'Active'}
                </div>
                <div className="flex justify-end">
                  {u.deactivatedAt ? (
                    <button
                      type="button"
                      className="text-xs font-bold text-primary"
                      onClick={() => void handleReactivate(u.id)}
                    >
                      Reactivate
                    </button>
                  ) : (
                    u.id !== me.id && (
                      <button
                        type="button"
                        aria-label={`Deactivate ${u.email}`}
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        onClick={() => setDeactivateTarget(u)}
                      >
                        <PowerIcon />
                      </button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
          )}
        </div>
        {remainingUserCount > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVisibleUserCount((c) => c + USER_BATCH_SIZE)}
          >
            Show {Math.min(remainingUserCount, USER_BATCH_SIZE)} more
          </Button>
        )}
      </section>

      <Dialog open={deactivateTarget !== null} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Deactivate "{deactivateTarget?.email}"?</DialogTitle>
          <DialogDescription>
            They immediately lose access to every project until reactivated. This does not delete their account
            or history.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDeactivate()}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Remove {removeTarget?.user.email}?</DialogTitle>
          <DialogDescription>
            They immediately lose whatever access this team grants them on any project it's assigned to.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleRemoveMember()}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PowerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  )
}

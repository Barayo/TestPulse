import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Trash2Icon, Loader2Icon, PowerIcon, PencilIcon, TriangleAlertIcon, MailIcon } from 'lucide-react'
import { useAuth } from '@/lib/useAuth'
import { api } from '@/lib/api'
import { LoadMoreButton } from '@/components/LoadMoreButton'
import { isValidEmail } from '@/lib/email'
import { generateSecurePassword } from '@/lib/generatePassword'
import { avatarStyle, initialsFor } from '@/lib/avatar'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { AdminShell } from '@/components/AdminShell'
import { GeneratedPasswordChip } from '@/components/GeneratedPasswordChip'

type User = {
  id: string
  email: string
  displayName?: string | null
  isTenantAdmin: boolean
  avatarKey?: string | null
  deactivatedAt: string | null
  mustChangePassword?: boolean
}
type Team = { id: string; name: string; memberIds: string[]; createdAt: string }
type UserOption = { id: string; email: string }

// Client-side reveal batch for a team's OWN member list (Team.memberIds is
// a plain embedded array on the Team object, not a separate paginated
// endpoint — unaffected by add-cursor-pagination) — keeps an expanded
// team from dumping a huge list into the page at once.
const MEMBER_BATCH_SIZE = 5

// Directory search (add member) results cap — filtering existing members
// and searching the whole directory to add someone new are different tasks
// with different scale problems: filtering narrows an already-bounded list,
// but a directory search against a large org could match hundreds of
// people. Capping the shown results (with a "N more" hint) keeps the
// inline results list from ever dumping an unbounded list into the page.
const ADD_RESULTS_CAP = 8

// Bounds ensureAllUsersLoaded's background drain (security review,
// add-cursor-pagination task 12.1d) — looping until `nextCursor` is null
// with no ceiling reintroduces the unbounded-query problem pagination was
// meant to fix, just moved client-side. At the default page size (50),
// 25 pages caps a single drain at 1,250 users.
const MAX_DRAIN_PAGES = 25

export default function PeoplePage() {
  const { user: me } = useAuth()

  const [users, setUsers] = useState<User[]>([])
  const [usersCursor, setUsersCursor] = useState<string | null>(null)
  const [loadingMoreUsers, setLoadingMoreUsers] = useState(false)
  const [drainingUsers, setDrainingUsers] = useState(false)
  const [usersTruncated, setUsersTruncated] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [teamsCursor, setTeamsCursor] = useState<string | null>(null)
  const [loadingMoreTeams, setLoadingMoreTeams] = useState(false)

  const [userFormOpen, setUserFormOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [revealedPassword, setRevealedPassword] = useState<string>()
  const [isTenantAdmin, setIsTenantAdmin] = useState(false)
  const [createUserError, setCreateUserError] = useState<string>()
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editRequirePasswordChange, setEditRequirePasswordChange] = useState(false)
  const [editError, setEditError] = useState<string>()
  const [passwordResetEnabled, setPasswordResetEnabled] = useState(false)
  const [resetEmailSentTo, setResetEmailSentTo] = useState<string>()
  const [temporaryPassword, setTemporaryPassword] = useState<string>()
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [deletePreview, setDeletePreview] = useState<{ teamCount: number; projectCount: number; tokenCount: number }>()

  const [teamFormOpen, setTeamFormOpen] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [expandedTeamId, setExpandedTeamId] = useState<string>()
  const [memberFilter, setMemberFilter] = useState('')
  const [visibleCount, setVisibleCount] = useState(MEMBER_BATCH_SIZE)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [removeTarget, setRemoveTarget] = useState<{ teamId: string; user: UserOption } | null>(null)
  const [deleteTeamTarget, setDeleteTeamTarget] = useState<Team | null>(null)
  const [teamDeletePreview, setTeamDeletePreview] = useState<{ memberCount: number; projectCount: number }>()

  const fetchUsersPage = useCallback(
    (cursor?: string) => api.GET('/api/v1/users', { params: { query: { cursor } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
    [],
  )
  const fetchTeamsPage = useCallback(
    (cursor?: string) => api.GET('/api/v1/teams', { params: { query: { cursor } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
    [],
  )

  async function load() {
    const [usersPage, teamsPage, { data: m }] = await Promise.all([
      fetchUsersPage(),
      fetchTeamsPage(),
      api.GET('/api/v1/meta'),
    ])
    // Each fetched page is sorted independently before appending, not the
    // whole accumulated list — resorting everything on every render would
    // insert a new page's earlier-alphabet rows into the middle of rows
    // already on screen, moving them on every "Load more" click.
    setUsers((usersPage.items as User[]).slice().sort((a, b) => a.email.localeCompare(b.email)))
    setUsersCursor(usersPage.nextCursor)
    setTeams(teamsPage.items.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setTeamsCursor(teamsPage.nextCursor)
    if (m) setPasswordResetEnabled(m.passwordResetEnabled)
  }

  useEffect(() => {
    if (me?.isTenantAdmin) void load()
  }, [me])

  async function loadMoreUsers() {
    if (!usersCursor) return
    setLoadingMoreUsers(true)
    try {
      const page = await fetchUsersPage(usersCursor)
      setUsers((prev) => [...prev, ...(page.items as User[]).slice().sort((a, b) => a.email.localeCompare(b.email))])
      setUsersCursor(page.nextCursor)
    } finally {
      setLoadingMoreUsers(false)
    }
  }

  async function loadMoreTeams() {
    if (!teamsCursor) return
    setLoadingMoreTeams(true)
    try {
      const page = await fetchTeamsPage(teamsCursor)
      setTeams((prev) => [...prev, ...page.items.slice().sort((a, b) => a.name.localeCompare(b.name))])
      setTeamsCursor(page.nextCursor)
    } finally {
      setLoadingMoreTeams(false)
    }
  }

  // Team-member email resolution and the "add member" directory search
  // both need the complete user set to be correct — a member whose user
  // record hasn't been paginated in yet would otherwise show as a raw id
  // instead of an email. Same data-completeness class as the search-box
  // finding below, same fix: drain remaining pages in the background
  // before trusting a view that depends on "every user".
  //
  // usersDrainRef guards against overlapping calls (bug found in QA, 2026-09-07):
  // every keystroke in the search box re-triggers this, and `usersCursor`
  // stays non-null until the *whole* drain finishes — so without a guard,
  // fast typing started a fresh, independent drain per keystroke, each one
  // re-fetching and re-appending the same page, corrupting `users` with
  // duplicates. A second call while one is in flight now just awaits the
  // first call's own promise instead of starting a redundant one.
  const usersDrainRef = useRef<Promise<void> | null>(null)
  function ensureAllUsersLoaded(): Promise<void> {
    if (usersDrainRef.current) return usersDrainRef.current
    if (!usersCursor) return Promise.resolve()
    const drain = (async () => {
      setDrainingUsers(true)
      try {
        let cursor: string | undefined = usersCursor
        for (let pageCount = 0; cursor && pageCount < MAX_DRAIN_PAGES; pageCount++) {
          const page = await fetchUsersPage(cursor)
          const sorted = (page.items as User[]).slice().sort((a, b) => a.email.localeCompare(b.email))
          setUsers((prev) => [...prev, ...sorted])
          cursor = page.nextCursor ?? undefined
        }
        setUsersCursor(cursor ?? null)
        setUsersTruncated(Boolean(cursor))
      } finally {
        setDrainingUsers(false)
        usersDrainRef.current = null
      }
    })()
    usersDrainRef.current = drain
    return drain
  }

  if (!me?.isTenantAdmin) {
    return <p className="text-sm text-muted-foreground">Not authorized — admin only.</p>
  }

  const filteredUsers = userSearch
    ? users.filter((u) => u.email.toLowerCase().includes(userSearch.toLowerCase()))
    : users

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
    setRevealedPassword(undefined)
    setIsTenantAdmin(false)
    setUserFormOpen(false)
    await load()
  }

  function openEditDialog(u: User) {
    setEditTarget(u)
    setEditEmail(u.email)
    setEditRequirePasswordChange(u.mustChangePassword ?? false)
    setEditError(undefined)
    setResetEmailSentTo(undefined)
    setTemporaryPassword(undefined)
  }

  // Fires immediately, not deferred to Save — the email is sent (or the
  // temporary password generated) the moment the admin asks for it, same
  // idiom as ForgotPasswordPage's own submit (add-change-own-password).
  async function handleSendPasswordResetEmail() {
    if (!editTarget) return
    setEditError(undefined)
    const { error: apiError } = await api.POST('/api/v1/users/{userId}/password-reset-email', {
      params: { path: { userId: editTarget.id } },
    })
    if (apiError) {
      setEditError((apiError as { error?: string }).error ?? 'Could not send the reset email.')
      return
    }
    setResetEmailSentTo(editTarget.email)
  }

  async function handleGenerateTemporaryPasswordForTarget() {
    if (!editTarget) return
    setEditError(undefined)
    const { data, error: apiError } = await api.POST('/api/v1/users/{userId}/generate-temporary-password', {
      params: { path: { userId: editTarget.id } },
    })
    if (apiError || !data) {
      setEditError((apiError as { error?: string })?.error ?? 'Could not generate a temporary password.')
      return
    }
    setTemporaryPassword(data.password)
  }

  function handleGeneratePassword() {
    const generated = generateSecurePassword()
    setPassword(generated)
    setRevealedPassword(generated)
  }

  function handlePasswordChange(value: string) {
    setPassword(value)
    if (value !== revealedPassword) setRevealedPassword(undefined)
  }

  async function handleEditUser(e: FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setEditError(undefined)
    if (!isValidEmail(editEmail)) {
      setEditError('Enter a valid email address')
      return
    }
    const body: { email?: string; requirePasswordChange?: boolean } = {}
    if (editEmail !== editTarget.email) body.email = editEmail
    if (editRequirePasswordChange !== (editTarget.mustChangePassword ?? false)) {
      body.requirePasswordChange = editRequirePasswordChange
    }
    if (Object.keys(body).length === 0) {
      setEditTarget(null)
      return
    }
    const { error: apiError } = await api.PATCH('/api/v1/users/{userId}', {
      params: { path: { userId: editTarget.id } },
      body,
    })
    if (apiError) {
      setEditError((apiError as { error?: string }).error ?? 'failed to update user')
      return
    }
    setEditTarget(null)
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

  async function openDeleteDialog(u: User) {
    setDeleteTarget(u)
    setDeletePreview(undefined)
    const { data } = await api.GET('/api/v1/users/{userId}/deletion-preview', { params: { path: { userId: u.id } } })
    if (data) setDeletePreview(data)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await api.DELETE('/api/v1/users/{userId}', { params: { path: { userId: deleteTarget.id } } })
    setDeleteTarget(null)
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
    void ensureAllUsersLoaded()
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

  async function openDeleteTeamDialog(t: Team) {
    setDeleteTeamTarget(t)
    setTeamDeletePreview(undefined)
    const { data } = await api.GET('/api/v1/teams/{teamId}/deletion-preview', { params: { path: { teamId: t.id } } })
    if (data) setTeamDeletePreview(data)
  }

  async function handleDeleteTeam() {
    if (!deleteTeamTarget) return
    await api.DELETE('/api/v1/teams/{teamId}', { params: { path: { teamId: deleteTeamTarget.id } } })
    setDeleteTeamTarget(null)
    await load()
  }

  return (
    <AdminShell>
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
            {teams.map((t) => {
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
                  <div className={`flex items-center gap-2 ${expanded ? 'border-b' : ''}`}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left hover:bg-accent"
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
                    <button
                      type="button"
                      aria-label={`Delete ${t.name}`}
                      className="mr-3 text-muted-foreground hover:text-destructive"
                      onClick={() => void openDeleteTeamDialog(t)}
                    >
                      <Trash2Icon className="size-4" aria-hidden="true" />
                    </button>
                  </div>

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
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAddMemberOpen(true)
                            void ensureAllUsersLoaded()
                          }}
                        >
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
        <LoadMoreButton hasMore={!!teamsCursor} loading={loadingMoreTeams} onClick={() => void loadMoreTeams()} />
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
              <form onSubmit={handleCreateUser} className="space-y-3">
                <div className="flex items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="new-user-email">Email</Label>
                    <Input id="new-user-email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="new-user-password">Password</Label>
                      <button
                        type="button"
                        className="text-xs font-bold text-primary"
                        onClick={handleGeneratePassword}
                      >
                        Generate
                      </button>
                    </div>
                    <Input
                      id="new-user-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => handlePasswordChange(e.target.value)}
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
                </div>
                {revealedPassword && password === revealedPassword && (
                  <GeneratedPasswordChip value={revealedPassword} />
                )}
              </form>
              {createUserError && <p className="mt-2 text-sm text-destructive">{createUserError}</p>}
            </CardContent>
          </Card>
        )}

        <Input
          placeholder="Search by email…"
          value={userSearch}
          onChange={(e) => {
            const value = e.target.value
            setUserSearch(value)
            // Filtering only what's loaded so far would silently hide real
            // matches sitting on an unfetched page — drain the rest before
            // the filtered view is trusted.
            if (value) void ensureAllUsersLoaded()
          }}
        />
        {drainingUsers && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
            Loading remaining users to search accurately…
          </p>
        )}
        {usersTruncated && !drainingUsers && (
          <p className="text-xs text-muted-foreground">
            This tenant has more users than can be searched at once — some matches may not be shown.
          </p>
        )}

        {/* Actions column is a fixed 200px on every breakpoint (mobile's
            2-col template included) — not the auto/content-sized width a
            grid item defaults to. A deactivated, non-self row renders three
            actions ("Edit · Reactivate · Delete", ~163px wide at real
            render — measured directly, not guessed), and a plain grid
            item's default min-width is `auto` (its own content's
            min-content size), not 0: give that content a track narrower
            than its content and the item doesn't shrink to fit — it
            overflows the track and bleeds into whichever column sits to
            its left, which is exactly what produced the original reported
            "DeacReactivatvatedte" collision with the Status column's text
            (back when the track was a fixed 36px for a single icon
            button). 200px is the measured content width plus a real
            safety margin, kept identical across the header and every row
            so columns still line up even though each `<li>` is its own
            independent grid, not one shared table grid. */}
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-[1fr_200px] items-center gap-3 border-b px-4 py-2 sm:grid-cols-[1fr_140px_120px_200px]">
            <span className="tp-label">Person</span>
            <span className="tp-label hidden sm:block">Access</span>
            <span className="tp-label hidden sm:block">Status</span>
            <span />
          </div>
          {filteredUsers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No users match "{userSearch}".</p>
          ) : (
          <ul aria-label="Users" className="text-sm">
            {filteredUsers.map((u) => (
              <li
                key={u.id}
                className="group grid grid-cols-[1fr_200px] items-center gap-3 border-b px-4 py-2 last:border-b-0 sm:grid-cols-[1fr_140px_120px_200px]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar seed={u.email} avatarKey={u.avatarKey} userId={u.id} className="size-7 rounded-full text-xs" />
                  <div className="min-w-0 leading-tight">
                    {u.displayName && u.displayName !== u.email ? (
                      <>
                        <div className="truncate text-sm font-semibold">{u.displayName}</div>
                        <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                      </>
                    ) : (
                      <div className="truncate text-sm font-semibold">{u.email}</div>
                    )}
                  </div>
                </div>
                <div className="hidden text-muted-foreground sm:block">
                  {u.isTenantAdmin ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Tenant Admin
                    </span>
                  ) : (
                    'Member'
                  )}
                </div>
                <div className="hidden items-center gap-1.5 text-muted-foreground sm:flex">
                  <span className={`size-1.5 rounded-full ${u.deactivatedAt ? 'bg-border' : 'bg-primary'}`} />
                  {u.deactivatedAt ? 'Deactivated' : 'Active'}
                </div>
                <div className="flex justify-end">
                  {u.deactivatedAt ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-xs font-bold text-foreground hover:underline"
                        onClick={() => openEditDialog(u)}
                      >
                        Edit
                      </button>
                      <span className="text-muted-foreground" aria-hidden="true">
                        &middot;
                      </span>
                      <button
                        type="button"
                        className="text-xs font-bold text-primary"
                        onClick={() => void handleReactivate(u.id)}
                      >
                        Reactivate
                      </button>
                      {u.id !== me.id && (
                        <>
                          <span className="text-muted-foreground" aria-hidden="true">
                            &middot;
                          </span>
                          <button
                            type="button"
                            aria-label={`Delete ${u.email}`}
                            className="text-xs font-bold text-destructive hover:underline"
                            onClick={() => void openDeleteDialog(u)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${u.email}`}
                        title={`Edit ${u.email}`}
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={() => openEditDialog(u)}
                      >
                        <PencilIcon className="size-3.5" aria-hidden="true" />
                      </button>
                      {u.id !== me.id && (
                        <button
                          type="button"
                          aria-label={`Deactivate ${u.email}`}
                          title={`Deactivate ${u.email}`}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeactivateTarget(u)}
                        >
                          <PowerIcon className="size-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          )}
        </div>
        {!userSearch && (
          <LoadMoreButton hasMore={!!usersCursor} loading={loadingMoreUsers} onClick={() => void loadMoreUsers()} />
        )}
      </section>

      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>Change this account's email, or manage its password.</DialogDescription>
          <form onSubmit={handleEditUser} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="edit-user-email">Email</Label>
              <Input id="edit-user-email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>

            {passwordResetEnabled ? (
              <div className="space-y-2 rounded-lg border p-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSendPasswordResetEmail()}
                >
                  <MailIcon className="size-3.5" aria-hidden="true" />
                  Send password reset email
                </Button>
                {resetEmailSentTo && (
                  <p className="text-sm text-muted-foreground">Reset email sent to {resetEmailSentTo}.</p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="edit-user-require-password-change"
                    type="checkbox"
                    checked={editRequirePasswordChange}
                    onChange={(e) => setEditRequirePasswordChange(e.target.checked)}
                    className="size-4"
                  />
                  <Label htmlFor="edit-user-require-password-change">
                    Require a password change at next login
                  </Label>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border p-2.5">
                <p className="text-xs text-muted-foreground">
                  Email isn't configured on this instance, so this account can't receive a reset link.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleGenerateTemporaryPasswordForTarget()}
                >
                  Generate a temporary password
                </Button>
                {temporaryPassword && (
                  <div className="space-y-2">
                    <GeneratedPasswordChip value={temporaryPassword} />
                    <div className="flex items-start gap-2 rounded-lg border border-secondary/30 bg-secondary/10 p-2.5">
                      <TriangleAlertIcon
                        className="mt-0.5 size-4 shrink-0 text-secondary-foreground"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-medium">
                          {editTarget?.id === me.id ? 'This signs you out everywhere' : 'This signs them out everywhere'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Every active session for this account ends immediately, and they must set a real
                          password of their own the next time they log in.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Delete "{deleteTarget?.email}"?</DialogTitle>
          <DialogDescription>
            Removes them from {deletePreview?.teamCount ?? 0} team{deletePreview?.teamCount === 1 ? '' : 's'},{' '}
            {deletePreview?.projectCount ?? 0} project{deletePreview?.projectCount === 1 ? '' : 's'}, and revokes{' '}
            {deletePreview === undefined ? (
              <Loader2Icon className="inline size-3 animate-spin align-[-2px]" aria-hidden="true" />
            ) : (
              <>
                {deletePreview.tokenCount} API token{deletePreview.tokenCount === 1 ? '' : 's'}
              </>
            )}
            . This cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deletePreview === undefined} onClick={() => void handleDelete()}>
              Delete
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

      <Dialog open={deleteTeamTarget !== null} onOpenChange={(open) => !open && setDeleteTeamTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Delete "{deleteTeamTarget?.name}"?</DialogTitle>
          <DialogDescription>
            Currently has{' '}
            {teamDeletePreview === undefined ? (
              <Loader2Icon className="inline size-3 animate-spin align-[-2px]" aria-hidden="true" />
            ) : (
              <>
                {teamDeletePreview.memberCount} member{teamDeletePreview.memberCount === 1 ? '' : 's'}, with access on{' '}
                {teamDeletePreview.projectCount} project{teamDeletePreview.projectCount === 1 ? '' : 's'}
              </>
            )}
            . Deleting it removes those members and revokes that project access too, not just the team itself. This
            cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTeamTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={teamDeletePreview === undefined}
              onClick={() => void handleDeleteTeam()}
            >
              Delete team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

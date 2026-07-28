import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useAuth } from '@/lib/useAuth'
import { api } from '@/lib/api'
import { avatarStyle, initialsFor } from '@/lib/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { UserPicker, type UserOption } from '@/components/UserPicker'

type Role = { id: string; name: string }
type Membership = {
  users: { userId: string; roleId: string }[]
  teams: { teamId: string; roleId: string }[]
}
type Team = { id: string; name: string }

// Read-only visibility for a non-Tenant-Admin project member is deferred:
// the API resolves membership to userId/teamId only, and resolving those to
// emails/names needs GET /users or /teams — both Tenant-Admin-only routes.
// This page is therefore Tenant-Admin-only for now, same gate as
// PeoplePage, even though the backend already permits Tester+ to read
// GET /projects/{projectKey}/members per the project-membership spec.
export default function ProjectMembersPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const { user: me } = useAuth()
  const [projectName, setProjectName] = useState('')
  const [membership, setMembership] = useState<Membership>({ users: [], teams: [] })
  const [users, setUsers] = useState<UserOption[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ userId: string; label: string } | null>(null)
  const [removeTeamTarget, setRemoveTeamTarget] = useState<{ teamId: string; label: string } | null>(null)

  async function load() {
    if (!projectKey) return
    const [{ data: p }, { data: m }, { data: u }, { data: t }, { data: r }] = await Promise.all([
      api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
      api.GET('/api/v1/projects/{projectKey}/members', { params: { path: { projectKey } } }),
      api.GET('/api/v1/users'),
      api.GET('/api/v1/teams'),
      api.GET('/api/v1/roles'),
    ])
    if (p) setProjectName(p.name)
    if (m) setMembership(m as Membership)
    if (u) setUsers(u as UserOption[])
    if (t) setTeams(t as Team[])
    if (r) setRoles(r as Role[])
  }

  useEffect(() => {
    if (me?.isTenantAdmin) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, projectKey])

  if (!me?.isTenantAdmin) {
    return <p className="text-sm text-muted-foreground">Not authorized — admin only.</p>
  }
  if (!projectKey) return null

  async function setMemberRole(userId: string, roleId: string) {
    await api.PUT('/api/v1/projects/{projectKey}/members/{userId}', {
      params: { path: { projectKey: projectKey!, userId } },
      body: { roleId },
    })
    await load()
  }

  async function removeMember() {
    if (!removeMemberTarget) return
    await api.DELETE('/api/v1/projects/{projectKey}/members/{userId}', {
      params: { path: { projectKey: projectKey!, userId: removeMemberTarget.userId } },
    })
    setRemoveMemberTarget(null)
    await load()
  }

  async function setTeamRole(teamId: string, roleId: string) {
    await api.PUT('/api/v1/projects/{projectKey}/teams/{teamId}', {
      params: { path: { projectKey: projectKey!, teamId } },
      body: { roleId },
    })
    await load()
  }

  async function removeTeamRole() {
    if (!removeTeamTarget) return
    await api.DELETE('/api/v1/projects/{projectKey}/teams/{teamId}', {
      params: { path: { projectKey: projectKey!, teamId: removeTeamTarget.teamId } },
    })
    setRemoveTeamTarget(null)
    await load()
  }

  const memberUserIds = new Set(membership.users.map((m) => m.userId))
  const memberTeamIds = new Set(membership.teams.map((m) => m.teamId))
  const addableUsers = users.filter((u) => !memberUserIds.has(u.id))
  const addableTeams = teams.filter((t) => !memberTeamIds.has(t.id))
  const defaultRoleId = roles[0]?.id ?? ''

  return (
    <div className="space-y-6">
      <Breadcrumbs
        segments={trimProjectBreadcrumb(
          [
            { label: 'Projects', href: '/' },
            { label: projectName, href: `/projects/${projectKey}` },
            { label: 'Members' },
          ],
          'Members',
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {membership.users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users directly assigned yet.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {membership.users.map((m) => {
                const u = users.find((x) => x.id === m.userId)
                const label = u?.email ?? m.userId
                return (
                  <li key={m.userId} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                        style={avatarStyle(label)}
                      >
                        {initialsFor(label)}
                      </span>
                      <span className="truncate">{label}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Role for ${label}`}
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={m.roleId}
                        onChange={(e) => void setMemberRole(m.userId, e.target.value)}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      {/* Removing a direct member cascades to whatever this
                          assignment grants on this project — gated behind a
                          confirmation dialog, same pattern as everywhere
                          else destructive on this admin surface. */}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${label}`}
                        onClick={() => setRemoveMemberTarget({ userId: m.userId, label })}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <UserPicker users={addableUsers} onSelect={(userId) => void setMemberRole(userId, defaultRoleId)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">Teams</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {membership.teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams assigned yet.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {membership.teams.map((m) => {
                const t = teams.find((x) => x.id === m.teamId)
                const label = t?.name ?? m.teamId
                return (
                  <li key={m.teamId} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
                        style={avatarStyle(label)}
                      >
                        {initialsFor(label)}
                      </span>
                      <span className="truncate">{label}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Role for ${label}`}
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={m.roleId}
                        onChange={(e) => void setTeamRole(m.teamId, e.target.value)}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${label}`}
                        onClick={() => setRemoveTeamTarget({ teamId: m.teamId, label })}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {addableTeams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No more teams to add.</p>
          ) : (
            <select
              aria-label="Add team"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value=""
              onChange={(e) => {
                if (e.target.value) void setTeamRole(e.target.value, defaultRoleId)
              }}
            >
              <option value="" disabled>
                + Add team…
              </option>
              {addableTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      <Dialog open={removeMemberTarget !== null} onOpenChange={(open) => !open && setRemoveMemberTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Remove {removeMemberTarget?.label}?</DialogTitle>
          <DialogDescription>
            They immediately lose whatever access this role grants on this project. This does not affect their
            account or any other project.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveMemberTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void removeMember()}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeTeamTarget !== null} onOpenChange={(open) => !open && setRemoveTeamTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Remove {removeTeamTarget?.label}?</DialogTitle>
          <DialogDescription>
            Every member of this team immediately loses whatever access this role grants on this project. This
            does not affect the team itself or any other project.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTeamTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void removeTeamRole()}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

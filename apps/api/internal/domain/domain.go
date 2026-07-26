// Package domain holds the core test management types and their invariants.
// It has no dependencies on storage or transport; services and stores build
// on it.
package domain

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Status is a run item's current execution state.
type Status string

const (
	StatusPending Status = "pending"
	StatusPass    Status = "pass"
	StatusFailed  Status = "failed"
	StatusSkipped Status = "skipped"
	StatusBlocked Status = "blocked"
	// StatusRetest marks an item for re-execution; it is set by an explicit
	// action and is never a verdict.
	StatusRetest Status = "retest"
)

var validStatuses = map[Status]bool{
	StatusPending: true, StatusPass: true, StatusFailed: true,
	StatusSkipped: true, StatusBlocked: true, StatusRetest: true,
}

func ParseStatus(s string) (Status, error) {
	st := Status(s)
	if !validStatuses[st] {
		return "", fmt.Errorf("invalid status %q: must be one of pending, pass, failed, skipped, blocked, retest", s)
	}
	return st, nil
}

// Verdict is the outcome recorded in a result. Retest and pending are
// statuses, not verdicts.
type Verdict string

const (
	VerdictPass    Verdict = "pass"
	VerdictFailed  Verdict = "failed"
	VerdictSkipped Verdict = "skipped"
	VerdictBlocked Verdict = "blocked"
)

var validVerdicts = map[Verdict]bool{
	VerdictPass: true, VerdictFailed: true, VerdictSkipped: true, VerdictBlocked: true,
}

func ParseVerdict(s string) (Verdict, error) {
	v := Verdict(s)
	if !validVerdicts[v] {
		return "", fmt.Errorf("invalid verdict %q: must be one of pass, failed, skipped, blocked", s)
	}
	return v, nil
}

// Status returns the run item status a verdict implies.
func (v Verdict) Status() Status { return Status(v) }

// Priority of a test case version.
type Priority string

const (
	PriorityLow      Priority = "low"
	PriorityMedium   Priority = "medium"
	PriorityHigh     Priority = "high"
	PriorityCritical Priority = "critical"
)

var validPriorities = map[Priority]bool{
	PriorityLow: true, PriorityMedium: true, PriorityHigh: true, PriorityCritical: true,
}

// CaseContent is the immutable payload of one test case version.
type CaseContent struct {
	Title          string   `json:"title"`
	Description    string   `json:"description"`
	Steps          []Step   `json:"steps"`
	ExpectedResult string   `json:"expectedResult"`
	Priority       Priority `json:"priority"`
	Tags           []string `json:"tags"`
	// Platform and TestType are free text — see add-case-classification-fields
	// design.md for why these aren't enums like Priority.
	Platform  string `json:"platform"`
	TestType  string `json:"testType"`
	Automated bool   `json:"automated"`
}

// Step is a single test case step.
type Step struct {
	Action   string `json:"action"`
	Expected string `json:"expected,omitempty"`
}

func (c CaseContent) Validate() error {
	if c.Title == "" {
		return fmt.Errorf("title is required")
	}
	if c.Priority != "" && !validPriorities[c.Priority] {
		return fmt.Errorf("invalid priority %q: must be one of low, medium, high, critical", c.Priority)
	}
	return nil
}

// NewResult is a result being appended to a run item's log. StartTime/EndTime
// and the platform/version/tags fields are optional execution metadata
// (add-execution-import): populated from a JUnit XML import, or supplied
// manually via the same "record a verdict" action.
// ResultActorKind mirrors ActorKind but adds "unknown" — a result-log
// concept, not a request-time one. Every authenticated request always has a
// real user/agent Actor (design D4 in link-result-actor-to-identity); a
// result's actor_kind can still be "unknown" for rows recorded before this
// change, where no real actor link exists to report.
type ResultActorKind string

const (
	ResultActorUser    ResultActorKind = "user"
	ResultActorAgent   ResultActorKind = "agent"
	ResultActorUnknown ResultActorKind = "unknown"
)

type NewResult struct {
	// Actor is optional: if empty, RecordResult fills it from the
	// authenticated caller. If supplied, it overrides the *displayed* name
	// only — the real authenticated actor's kind/ref is still recorded
	// alongside it (design D2).
	Actor     string     `json:"actor"`
	Verdict   Verdict    `json:"verdict"`
	Comment   string     `json:"comment"`
	StartTime *time.Time `json:"startTime,omitempty"`
	EndTime   *time.Time `json:"endTime,omitempty"`
	Platform  string     `json:"platform,omitempty"`
	Version   string     `json:"version,omitempty"`
	Tags      []string   `json:"tags,omitempty"`
}

func (r NewResult) Validate() error {
	if _, err := ParseVerdict(string(r.Verdict)); err != nil {
		return err
	}
	return nil
}

func ValidateProjectName(name string) error {
	if name == "" {
		return fmt.Errorf("name is required")
	}
	return nil
}

// nonAlphanumeric splits a project name into words for key derivation —
// any run of non-letters/digits is a word boundary.
var nonAlphanumeric = regexp.MustCompile(`[^A-Za-z0-9]+`)

// DeriveProjectKey computes a project's auto-generated key candidate from
// its name (add-human-readable-keys design.md D1): multi-word names take
// the initial letter of each word (capped at 5); a single word takes its
// first 4 letters; a name with no alphanumeric content at all falls back
// to "PROJ". The caller (ProjectRepo.Create) is responsible for
// disambiguating collisions with a numeric suffix — this function is pure
// and always returns the same candidate for the same name.
func DeriveProjectKey(name string) string {
	words := nonAlphanumeric.Split(name, -1)
	tokens := make([]string, 0, len(words))
	for _, w := range words {
		if w != "" {
			tokens = append(tokens, w)
		}
	}

	var key string
	switch {
	case len(tokens) >= 2:
		if len(tokens) > 5 {
			tokens = tokens[:5]
		}
		for _, t := range tokens {
			key += string(t[0])
		}
	case len(tokens) == 1:
		t := tokens[0]
		if len(t) > 4 {
			t = t[:4]
		}
		key = t
	}

	key = strings.ToUpper(key)
	if len(key) < 2 {
		return "PROJ"
	}
	return key
}

func ValidateFolderName(name string) error {
	if name == "" {
		return fmt.Errorf("name is required")
	}
	return nil
}

// NewFolder creates a subfolder. A parent is always required — only the
// database trigger that fires on project creation may create a root folder
// (design D8); the API never allows a client to create one.
type NewFolder struct {
	Name           string `json:"name"`
	ParentFolderID string `json:"parentFolderId"`
}

func (f NewFolder) Validate() error {
	if err := ValidateFolderName(f.Name); err != nil {
		return err
	}
	if f.ParentFolderID == "" {
		return fmt.Errorf("parent folder is required")
	}
	return nil
}

// Entity types returned by stores and services.

type Project struct {
	ID          string `json:"id"`
	Key         string `json:"key"`
	Name        string `json:"name"`
	Archived    bool   `json:"archived"`
	Description string `json:"description"`
	// IsSample marks the single, automatically-seeded showroom project
	// (add-sample-project); false for every normally-created project.
	IsSample  bool      `json:"isSample"`
	CreatedAt time.Time `json:"createdAt"`
}

type TestCase struct {
	ID             string      `json:"id"`
	Key            string      `json:"key"`
	ProjectID      string      `json:"projectId"`
	FolderID       string      `json:"folderId"`
	CurrentVersion int         `json:"currentVersion"`
	Content        CaseContent `json:"content"` // content of the current version
	CreatedAt      time.Time   `json:"createdAt"`
}

// Folder is a node in a project's case-organization tree (D8). Root
// (ParentFolderID == "") is created automatically with the project.
type Folder struct {
	ID             string    `json:"id"`
	ProjectID      string    `json:"projectId"`
	ParentFolderID string    `json:"parentFolderId,omitempty"`
	Name           string    `json:"name"`
	CreatedAt      time.Time `json:"createdAt"`
}

type CaseVersion struct {
	CaseID    string      `json:"caseId"`
	Version   int         `json:"version"`
	Content   CaseContent `json:"content"`
	CreatedAt time.Time   `json:"createdAt"`
}

type Suite struct {
	ID        string    `json:"id"`
	Key       string    `json:"key"`
	ProjectID string    `json:"projectId"`
	Name      string    `json:"name"`
	CaseIDs   []string  `json:"caseIds"`
	CreatedAt time.Time `json:"createdAt"`
	// PassRate and LastRunAt reflect the suite's most recently created run,
	// regardless of open/closed status — the same "latest run" semantic
	// ProjectSummary already uses (rework-suites-landing-ux), computed via
	// one batched query per List/Get call, not one query per suite.
	PassRate  *int       `json:"passRate"`
	LastRunAt *time.Time `json:"lastRunAt"`
}

type Run struct {
	ID        string `json:"id"`
	Key       string `json:"key"`
	ProjectID string `json:"projectId"`
	// ProjectKey lets a client link back to the run's project without a
	// second lookup — unlike a case/suite, a run's own route isn't nested
	// under its project's, so the project's key isn't otherwise available
	// from the URL (add-human-readable-keys).
	ProjectKey string    `json:"projectKey"`
	Name       string    `json:"name"`
	Status     RunStatus `json:"status"`
	// SuiteKey is the key of the suite this run was created from, if any
	// (link-runs-to-suite). Nil for a run created from an explicit case
	// list, or via execution import.
	SuiteKey  *string   `json:"suiteKey,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// RunStatus is a run's open/closed lifecycle state (add-run-lifecycle-status).
// A closed run's items become read-only: no new results, status/assignee
// updates, or added items.
type RunStatus string

const (
	RunStatusOpen   RunStatus = "open"
	RunStatusClosed RunStatus = "closed"
)

type RunItem struct {
	ID            string      `json:"id"`
	RunID         string      `json:"runId"`
	CaseID        string      `json:"caseId"`
	CaseKey       string      `json:"caseKey"`
	CaseVersion   int         `json:"caseVersion"`
	Assignee      string      `json:"assignee"`
	CurrentStatus Status      `json:"currentStatus"`
	Content       CaseContent `json:"content"` // pinned version's content
	NewerVersion  bool        `json:"newerVersion"`
	// TestName is the literal name an external test runner reported
	// (add-execution-import), independent of the pinned case's own title.
	// Empty for items added manually.
	TestName  string    `json:"testName,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// CaseExecution is one run item's outcome, viewed from the case's side
// (across every run it was part of) rather than one run's side — the shape
// `extend-case-version-history`'s "executions by version" query returns.
type CaseExecution struct {
	RunItemID   string    `json:"runItemId"`
	RunID       string    `json:"runId"`
	RunKey      string    `json:"runKey"`
	RunName     string    `json:"runName"`
	CaseVersion int       `json:"caseVersion"`
	Status      Status    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Result struct {
	ID         string          `json:"id"`
	RunItemID  string          `json:"runItemId"`
	Actor      string          `json:"actor"`
	ActorKind  ResultActorKind `json:"actorKind"`
	ActorRefID string          `json:"actorRefId,omitempty"`
	Verdict    Verdict         `json:"verdict"`
	Comment    string          `json:"comment"`
	StartTime  *time.Time      `json:"startTime,omitempty"`
	EndTime    *time.Time      `json:"endTime,omitempty"`
	Platform   string          `json:"platform,omitempty"`
	Version    string          `json:"version,omitempty"`
	Tags       []string        `json:"tags,omitempty"`
	CreatedAt  time.Time       `json:"createdAt"`
}

// RunSummary is the per-run status breakdown.
type RunSummary struct {
	RunID  string         `json:"runId"`
	Total  int            `json:"total"`
	Counts map[Status]int `json:"counts"`
}

// SuiteTrendPoint is one closed run's status breakdown within a suite's
// pass-rate trend (add-suite-pass-rate-trend).
type SuiteTrendPoint struct {
	RunKey    string         `json:"runKey"`
	RunName   string         `json:"runName"`
	CreatedAt time.Time      `json:"createdAt"`
	Total     int            `json:"total"`
	Counts    map[Status]int `json:"counts"`
}

// SuiteTrend is a suite's closed runs, oldest first, each as a
// SuiteTrendPoint (add-suite-pass-rate-trend).
type SuiteTrend struct {
	SuiteID  string            `json:"suiteId"`
	SuiteKey string            `json:"suiteKey"`
	Points   []SuiteTrendPoint `json:"points"`
}

// ProjectSummary is the per-project aggregate used by the project list and
// switcher — suite/case counts and the most recent run's pass rate, computed
// server-side in a small fixed number of queries regardless of how many
// projects exist (add-project-stats-endpoint).
type ProjectSummary struct {
	ProjectID  string     `json:"projectId"`
	SuiteCount int        `json:"suiteCount"`
	CaseCount  int        `json:"caseCount"`
	PassRate   *int       `json:"passRate"`
	LastRunAt  *time.Time `json:"lastRunAt"`
	IsFavorite bool       `json:"isFavorite"`
}

// --- Identity (add-identity-basics) ---

// Permission is one independently-toggleable capability a Role can grant.
// Routes check for a specific Permission, never for a role's identity or
// rank directly (add-project-rbac design.md D10 — this replaced an
// ordinal Tester < Contributor < ProjectAdmin scale once roles became
// fully custom and could no longer be compared against a fixed reference).
// Ten concrete, per-resource flags (design.md D11) replaced an earlier set
// of five broader ones (read/execute/author/delete/manageProject) that each
// bundled several unrelated actions under one switch.
type Permission string

const (
	PermRead                Permission = "read"
	PermCaseCreate          Permission = "caseCreate"
	PermCaseEdit            Permission = "caseEdit"
	PermCaseDelete          Permission = "caseDelete"
	PermSectionCreate       Permission = "sectionCreate"
	PermSectionDelete       Permission = "sectionDelete"
	PermSuiteCreate         Permission = "suiteCreate"
	PermSuiteEditMembership Permission = "suiteEditMembership"
	PermRunCreate           Permission = "runCreate"
	PermRunRecordResult     Permission = "runRecordResult"
	PermManageProject       Permission = "manageProject"
)

// Role is a Tenant-Admin-defined, instance-wide record: a name plus ten
// independently toggleable permission flags. Rank is a display/sort-order
// integer only — it is never compared in authorization decisions (design.md
// D10); a user's effective permissions are the union of every role they
// hold on a project (direct or via team), not "the highest-ranked role."
type Role struct {
	ID                     string    `json:"id"`
	Name                   string    `json:"name"`
	Rank                   int       `json:"rank"`
	CanRead                bool      `json:"canRead"`
	CanCaseCreate          bool      `json:"canCaseCreate"`
	CanCaseEdit            bool      `json:"canCaseEdit"`
	CanCaseDelete          bool      `json:"canCaseDelete"`
	CanSectionCreate       bool      `json:"canSectionCreate"`
	CanSectionDelete       bool      `json:"canSectionDelete"`
	CanSuiteCreate         bool      `json:"canSuiteCreate"`
	CanSuiteEditMembership bool      `json:"canSuiteEditMembership"`
	CanRunCreate           bool      `json:"canRunCreate"`
	CanRunRecordResult     bool      `json:"canRunRecordResult"`
	CanManageProject       bool      `json:"canManageProject"`
	CreatedAt              time.Time `json:"createdAt"`
}

// Has reports whether the role grants perm.
func (r Role) Has(perm Permission) bool {
	switch perm {
	case PermRead:
		return r.CanRead
	case PermCaseCreate:
		return r.CanCaseCreate
	case PermCaseEdit:
		return r.CanCaseEdit
	case PermCaseDelete:
		return r.CanCaseDelete
	case PermSectionCreate:
		return r.CanSectionCreate
	case PermSectionDelete:
		return r.CanSectionDelete
	case PermSuiteCreate:
		return r.CanSuiteCreate
	case PermSuiteEditMembership:
		return r.CanSuiteEditMembership
	case PermRunCreate:
		return r.CanRunCreate
	case PermRunRecordResult:
		return r.CanRunRecordResult
	case PermManageProject:
		return r.CanManageProject
	default:
		return false
	}
}

func ValidateRoleName(name string) error {
	if name == "" {
		return fmt.Errorf("name is required")
	}
	return nil
}

// Permissions is a resolved, unioned set of flags — the result of OR-ing
// every role a user holds on a particular project (design.md D3/D10).
type Permissions struct {
	Read                bool `json:"read"`
	CaseCreate          bool `json:"caseCreate"`
	CaseEdit            bool `json:"caseEdit"`
	CaseDelete          bool `json:"caseDelete"`
	SectionCreate       bool `json:"sectionCreate"`
	SectionDelete       bool `json:"sectionDelete"`
	SuiteCreate         bool `json:"suiteCreate"`
	SuiteEditMembership bool `json:"suiteEditMembership"`
	RunCreate           bool `json:"runCreate"`
	RunRecordResult     bool `json:"runRecordResult"`
	ManageProject       bool `json:"manageProject"`
}

// Has reports whether the resolved set includes perm.
func (p Permissions) Has(perm Permission) bool {
	switch perm {
	case PermRead:
		return p.Read
	case PermCaseCreate:
		return p.CaseCreate
	case PermCaseEdit:
		return p.CaseEdit
	case PermCaseDelete:
		return p.CaseDelete
	case PermSectionCreate:
		return p.SectionCreate
	case PermSectionDelete:
		return p.SectionDelete
	case PermSuiteCreate:
		return p.SuiteCreate
	case PermSuiteEditMembership:
		return p.SuiteEditMembership
	case PermRunCreate:
		return p.RunCreate
	case PermRunRecordResult:
		return p.RunRecordResult
	case PermManageProject:
		return p.ManageProject
	default:
		return false
	}
}

// User.IsTenantAdmin replaces the old instance-wide admin/member Role
// (add-project-rbac design.md D1) — a non-Tenant-Admin's access is entirely
// determined by their per-project membership, not a flat instance role.
type User struct {
	ID            string     `json:"id"`
	Email         string     `json:"email"`
	IsTenantAdmin bool       `json:"isTenantAdmin"`
	DeactivatedAt *time.Time `json:"deactivatedAt"`
	CreatedAt     time.Time  `json:"createdAt"`
}

// Team is a named group of users with no scope of its own — it only gains
// meaning once assigned a Role on one or more projects via ProjectTeamRole
// (add-project-rbac design.md D7).
type Team struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	MemberIDs []string  `json:"memberIds"`
	CreatedAt time.Time `json:"createdAt"`
}

func ValidateTeamName(name string) error {
	if name == "" {
		return fmt.Errorf("name is required")
	}
	return nil
}

// ProjectMember is one user's direct role assignment on a project.
type ProjectMember struct {
	UserID string `json:"userId"`
	RoleID string `json:"roleId"`
}

// ProjectTeamRole is one team's role assignment on a project — every member
// of the team inherits this role's permissions on that project.
type ProjectTeamRole struct {
	TeamID string `json:"teamId"`
	RoleID string `json:"roleId"`
}

// ProjectMembership is a project's full membership: its directly-assigned
// users plus its assigned teams, each with a role (design.md D3).
type ProjectMembership struct {
	Users []ProjectMember   `json:"users"`
	Teams []ProjectTeamRole `json:"teams"`
}

func ValidatePassword(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	return nil
}

// emailPattern is deliberately simple — one `@`, no whitespace, at least one
// `.` in the domain part — not a full RFC 5322 parser. It exists to catch
// obvious typos, not to be the last word on what's deliverable.
var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

func ValidateEmail(email string) error {
	if email == "" {
		return fmt.Errorf("email is required")
	}
	if !emailPattern.MatchString(email) {
		return fmt.Errorf("email must be a valid email address")
	}
	return nil
}

type Session struct {
	ID        string    `json:"-"` // never serialized: it is the session secret itself
	UserID    string    `json:"userId"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// ApiToken is a scoped credential an authenticated user issues for an agent.
// Only Prefix is ever shown again after creation — the full token value is
// returned once by the service layer and never persisted (design D3).
type ApiToken struct {
	ID        string     `json:"id"`
	CreatedBy string     `json:"createdBy"`
	Name      string     `json:"name"`
	Prefix    string     `json:"prefix"`
	RevokedAt *time.Time `json:"revokedAt"`
	CreatedAt time.Time  `json:"createdAt"`
}

func ValidateTokenName(name string) error {
	if name == "" {
		return fmt.Errorf("name is required")
	}
	return nil
}

// ActorKind distinguishes a human user from an agent authenticated via API
// token in the audit log — an agent's actions are never recorded as if
// performed directly by the human who created its token (design D1/D6).
type ActorKind string

const (
	ActorKindUser  ActorKind = "user"
	ActorKindAgent ActorKind = "agent"
)

// Actor is whoever is making an authenticated request: a human user via
// session cookie, or an agent via API token. It is the "who" behind every
// audit entry. EffectiveUserID and IsTenantAdmin are the "what can it do":
// the user whose project memberships apply, and whether it bypasses
// per-project checks entirely — for a human these are its own ID and flag;
// for an agent they are its token's creator's, resolved fresh on every
// request, never impersonated but never cached either (design.md D4).
type Actor struct {
	ID              string
	Kind            ActorKind
	DisplayName     string
	EffectiveUserID string
	IsTenantAdmin   bool
}

// AuditEntry records one write, denormalizing the actor's display name so
// history remains readable even after the actor itself is deleted (design
// D5).
type AuditEntry struct {
	ID         string    `json:"id"`
	ActorKind  ActorKind `json:"actorKind"`
	ActorID    string    `json:"actorId"`
	ActorName  string    `json:"actorName"`
	Action     string    `json:"action"`
	EntityType string    `json:"entityType"`
	EntityID   string    `json:"entityId"`
	OccurredAt time.Time `json:"occurredAt"`
}

// actorContextKey is unexported so only WithActor/ActorFromContext can set
// or read the request's resolved Actor (design D1: resolved once by auth
// middleware, threaded through context.Context like other request-scoped
// values in this codebase).
type actorContextKey struct{}

func WithActor(ctx context.Context, actor Actor) context.Context {
	return context.WithValue(ctx, actorContextKey{}, actor)
}

func ActorFromContext(ctx context.Context) (Actor, bool) {
	actor, ok := ctx.Value(actorContextKey{}).(Actor)
	return actor, ok
}

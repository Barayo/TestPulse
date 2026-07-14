// Package domain holds the core test management types and their invariants.
// It has no dependencies on storage or transport; services and stores build
// on it.
package domain

import (
	"context"
	"fmt"
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

// NewResult is a result being appended to a run item's log.
type NewResult struct {
	Actor   string  `json:"actor"`
	Verdict Verdict `json:"verdict"`
	Comment string  `json:"comment"`
}

func (r NewResult) Validate() error {
	if r.Actor == "" {
		return fmt.Errorf("actor is required")
	}
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
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Archived    bool      `json:"archived"`
	Description string    `json:"description"`
	OwnerID     *string   `json:"ownerId"`
	CreatedAt   time.Time `json:"createdAt"`
}

type TestCase struct {
	ID             string      `json:"id"`
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
	ProjectID string    `json:"projectId"`
	Name      string    `json:"name"`
	CaseIDs   []string  `json:"caseIds"`
	CreatedAt time.Time `json:"createdAt"`
}

type Run struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
}

type RunItem struct {
	ID            string      `json:"id"`
	RunID         string      `json:"runId"`
	CaseID        string      `json:"caseId"`
	CaseVersion   int         `json:"caseVersion"`
	Assignee      string      `json:"assignee"`
	CurrentStatus Status      `json:"currentStatus"`
	Content       CaseContent `json:"content"` // pinned version's content
	NewerVersion  bool        `json:"newerVersion"`
	CreatedAt     time.Time   `json:"createdAt"`
}

type Result struct {
	ID        string    `json:"id"`
	RunItemID string    `json:"runItemId"`
	Actor     string    `json:"actor"`
	Verdict   Verdict   `json:"verdict"`
	Comment   string    `json:"comment"`
	CreatedAt time.Time `json:"createdAt"`
}

// RunSummary is the per-run status breakdown.
type RunSummary struct {
	RunID  string         `json:"runId"`
	Total  int            `json:"total"`
	Counts map[Status]int `json:"counts"`
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

// Role is a user's instance-wide role. There is no per-project scoping yet
// (that arrives with add-project-rbac) — every role can fully read/write
// domain data; only RoleAdmin can manage user accounts (design D4).
type Role string

const (
	RoleAdmin  Role = "admin"
	RoleMember Role = "member"
)

var validRoles = map[Role]bool{RoleAdmin: true, RoleMember: true}

func ParseRole(s string) (Role, error) {
	r := Role(s)
	if !validRoles[r] {
		return "", fmt.Errorf("invalid role %q: must be one of admin, member", s)
	}
	return r, nil
}

type User struct {
	ID            string     `json:"id"`
	Email         string     `json:"email"`
	Role          Role       `json:"role"`
	DeactivatedAt *time.Time `json:"deactivatedAt"`
	CreatedAt     time.Time  `json:"createdAt"`
}

func ValidatePassword(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	return nil
}

func ValidateEmail(email string) error {
	if email == "" {
		return fmt.Errorf("email is required")
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
// audit entry.
type Actor struct {
	ID          string
	Kind        ActorKind
	DisplayName string
	Role        Role // the permission level the actor acts at
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

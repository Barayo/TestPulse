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

// StepResult is one step's verdict, identified by its position in the run
// item's pinned content.steps array (add-step-level-results) — steps have
// no stable ID of their own, but a run item's pinned steps never change
// after creation, so the array index is a stable, sufficient identifier.
// Used both for a run item's live, carry-forward step marks
// (RunItem.StepStates) and for a single result's immutable snapshot
// (Result.StepResults).
type StepResult struct {
	StepIndex int     `json:"stepIndex"`
	Verdict   Verdict `json:"verdict"`
}

func (r StepResult) Validate() error {
	if r.StepIndex < 0 {
		return fmt.Errorf("step index must not be negative")
	}
	if _, err := ParseVerdict(string(r.Verdict)); err != nil {
		return err
	}
	return nil
}

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

// Format is a test case's content authoring format (add-case-authoring-formats).
// The zero value means "unset" — callers that persist a CaseContent default
// it to FormatSteps at the storage layer, matching every case created before
// this field existed.
type Format string

const (
	FormatSteps   Format = "steps"
	FormatText    Format = "text"
	FormatGherkin Format = "gherkin"
)

var validFormats = map[Format]bool{
	FormatSteps: true, FormatText: true, FormatGherkin: true,
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
	// CustomFields holds the project's custom field values for this
	// version, keyed by field id (not name — a later rename must not
	// orphan existing values), select-field values holding the chosen
	// option's id (add-case-custom-fields). Sparse: a field added after
	// this version was created, or never given a value, is simply absent
	// — never a zero-value entry.
	CustomFields map[string]string `json:"customFields,omitempty"`
	// Format selects which of Steps/Description/GherkinSource holds the
	// case's authored content (add-case-authoring-formats). Steps remains
	// populated only when Format is FormatSteps; GherkinSource only when
	// FormatGherkin; Description is meaningful for both FormatText (the
	// full narrative) and the other formats (an optional summary).
	Format        Format `json:"format,omitempty"`
	GherkinSource string `json:"gherkinSource,omitempty"`
	// Parameters is the optional data-driven table (add-parameterized-cases)
	// — nil for the overwhelming majority of cases. Only meaningful when
	// Format is FormatSteps; Steps' Action/Expected text may reference
	// {columnName} placeholders substituted per row at run-item creation.
	Parameters *CaseParameters `json:"parameters,omitempty"`
}

// SubstituteParams returns a copy of steps with every {column} placeholder
// in Action/Expected replaced by row's corresponding value — row's own
// "Name" entry is never itself a substitution target (it's the row's
// label, not a step-text placeholder). A step with no placeholders passes
// through unchanged; a placeholder with no entry in row substitutes as an
// empty string rather than panicking (validation already guarantees every
// referenced token names a real column, but a column can still lack a
// value for a particular row).
func SubstituteParams(steps []Step, row map[string]string) []Step {
	out := make([]Step, len(steps))
	for i, s := range steps {
		out[i] = Step{
			Action:   substitutePlaceholders(s.Action, row),
			Expected: substitutePlaceholders(s.Expected, row),
			GroupRef: s.GroupRef,
		}
	}
	return out
}

func substitutePlaceholders(text string, row map[string]string) string {
	return placeholderPattern.ReplaceAllStringFunc(text, func(match string) string {
		token := match[1 : len(match)-1]
		if token == "Name" {
			return match
		}
		return row[token]
	})
}

// CaseParameters is a case's data-driven table (add-parameterized-cases).
// Columns[0] is always "Name" — required, never removable in the editor,
// used as each row's label wherever a row is shown (run item name/history).
// Rows are ordered maps keyed by column name; a row missing a value for one
// of its own declared columns substitutes as an empty string, never a panic.
type CaseParameters struct {
	Columns []string            `json:"columns"`
	Rows    []map[string]string `json:"rows"`
}

// Step is a single test case step. A step carrying GroupRef references a
// shared StepGroup instead of (or alongside) its own Action/Expected —
// Action/Expected on such a step are unused; the step expands to the
// referenced group's full step sequence, resolved and snapshotted
// server-side at case-save time (add-reusable-steps).
type Step struct {
	Action   string        `json:"action"`
	Expected string        `json:"expected,omitempty"`
	GroupRef *StepGroupRef `json:"groupRef,omitempty"`
}

// StepGroupRef records which StepGroup a resolved step entry came from,
// and when its content was last resolved — SnapshotUpdatedAt is compared
// against the live group's UpdatedAt to detect staleness while editing a
// case (never while merely viewing a saved version).
type StepGroupRef struct {
	GroupID           string    `json:"groupId"`
	GroupKey          string    `json:"groupKey"`
	SnapshotUpdatedAt time.Time `json:"snapshotUpdatedAt"`
}

// StepGroup is a project-scoped, named, ordered list of steps that a test
// case's content may reference (add-reusable-steps). Mutable in place —
// unlike a test case, a StepGroup is not itself versioned; its edit
// history is the generic audit log, matching Folder/CustomField.
type StepGroup struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Key       string    `json:"key"`
	Name      string    `json:"name"`
	Steps     []Step    `json:"steps"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (g StepGroup) Validate() error {
	if g.Name == "" {
		return fmt.Errorf("name is required")
	}
	if len(g.Steps) == 0 {
		return fmt.Errorf("at least one step is required")
	}
	for i, s := range g.Steps {
		if s.Action == "" {
			return fmt.Errorf("step %d: action is required", i+1)
		}
	}
	return nil
}

func (c CaseContent) Validate() error {
	if c.Title == "" {
		return fmt.Errorf("title is required")
	}
	if c.Priority != "" && !validPriorities[c.Priority] {
		return fmt.Errorf("invalid priority %q: must be one of low, medium, high, critical", c.Priority)
	}
	if c.Format != "" && !validFormats[c.Format] {
		return fmt.Errorf("invalid format %q: must be one of steps, text, gherkin", c.Format)
	}
	if err := c.validateParameters(); err != nil {
		return err
	}
	return nil
}

var placeholderPattern = regexp.MustCompile(`\{([^{}]+)\}`)

// Defense-in-depth bounds on a parameter table's shape — generous for any
// legitimate data-driven test matrix, but a backstop against an accidental
// or malicious oversized table (the only prior limit was the server's
// global request-body cap).
const (
	maxParameterRows    = 500
	maxParameterColumns = 50
)

// validateParameters enforces add-parameterized-cases design.md D1/D2/D6:
// a case with zero parameter rows is exempt entirely (existing cases with
// literal `{brace}` text in their steps must keep saving unchanged). Only
// once Parameters.Rows is non-empty do the Name-column, unique-row-name,
// steps-format, and placeholder-matches-column rules apply.
func (c CaseContent) validateParameters() error {
	if c.Parameters == nil || len(c.Parameters.Rows) == 0 {
		return nil
	}
	if c.Format != "" && c.Format != FormatSteps {
		return fmt.Errorf("parameterized cases must use the steps format")
	}
	if len(c.Parameters.Rows) > maxParameterRows {
		return fmt.Errorf("parameter table has %d rows, maximum is %d", len(c.Parameters.Rows), maxParameterRows)
	}
	if len(c.Parameters.Columns) > maxParameterColumns {
		return fmt.Errorf("parameter table has %d columns, maximum is %d", len(c.Parameters.Columns), maxParameterColumns)
	}
	if len(c.Parameters.Columns) == 0 || c.Parameters.Columns[0] != "Name" {
		return fmt.Errorf("parameter table's first column must be named Name")
	}
	columns := map[string]bool{}
	for _, col := range c.Parameters.Columns {
		if columns[col] {
			return fmt.Errorf("parameter column %q is used more than once", col)
		}
		columns[col] = true
	}
	seenNames := map[string]bool{}
	for i, row := range c.Parameters.Rows {
		name := row["Name"]
		if name == "" {
			return fmt.Errorf("parameter row %d is missing a Name value", i)
		}
		if seenNames[name] {
			return fmt.Errorf("parameter row name %q is used more than once", name)
		}
		seenNames[name] = true
	}
	for _, step := range c.Steps {
		for _, text := range [2]string{step.Action, step.Expected} {
			for _, match := range placeholderPattern.FindAllStringSubmatch(text, -1) {
				token := match[1]
				if !columns[token] {
					return fmt.Errorf("step references unknown parameter %q", token)
				}
			}
		}
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
	// AttachmentIDs links previously staged attachments (uploaded before this
	// verdict existed) to the result being created here, in the same
	// transaction. Attachments carries inline base64 image data instead, for
	// a client that already has the bytes and wants a single atomic call
	// (add-run-item-screenshot-attachments design.md).
	AttachmentIDs []string        `json:"attachmentIds,omitempty"`
	Attachments   []NewAttachment `json:"attachments,omitempty"`
	// StepResults optionally submits step-level verdicts atomically with
	// this overall verdict (add-step-level-results) — used by a
	// non-interactive caller (e.g. a future agent/import path) that
	// already knows every step's outcome up front. When supplied, these
	// values become this result's snapshot verbatim, overriding whatever
	// the run item's live step verdicts currently are, and also become
	// the run item's new live step verdicts (so a later retest carries
	// forward from what was just reported). When omitted, the run item's
	// current live step verdicts are snapshotted instead.
	StepResults []StepResult `json:"stepResults,omitempty"`
}

func (r NewResult) Validate() error {
	if _, err := ParseVerdict(string(r.Verdict)); err != nil {
		return err
	}
	for i, sr := range r.StepResults {
		if err := sr.Validate(); err != nil {
			return fmt.Errorf("stepResults[%d]: %w", i, err)
		}
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

// emailSeparators splits an email's local-part into words for default
// display name derivation — the common separator characters, not any
// non-alphanumeric run (an email local-part's alphanumeric characters
// themselves are the words, unlike a free-text project name).
var emailSeparators = regexp.MustCompile(`[._\-+]+`)

// DefaultDisplayName derives a starting display name from an email address
// for an account that hasn't set one (link-case-version-actor-to-identity
// design.md) — the local-part split on ./_/-/+ , each word title-cased.
// "jane.doe@x.com" -> "Jane Doe". A default, not a locked-in value: the
// account can change it later via self-service profile settings.
func DefaultDisplayName(email string) string {
	local, _, _ := strings.Cut(email, "@")
	words := emailSeparators.Split(local, -1)
	tokens := make([]string, 0, len(words))
	for _, w := range words {
		if w == "" {
			continue
		}
		tokens = append(tokens, strings.ToUpper(w[:1])+w[1:])
	}
	return strings.Join(tokens, " ")
}

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
	if len(name) > 255 {
		return fmt.Errorf("name must be 255 characters or fewer")
	}
	if Slugify(name) == "" {
		return fmt.Errorf("name needs at least one letter or number")
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
	IsSample bool `json:"isSample"`
	// PublicAccess opts this project into unauthenticated read-only access
	// at its public URL (enable-public-project-access); also gated by the
	// instance-wide InstanceSettings.PublicProjectsEnabled kill switch.
	PublicAccess bool `json:"publicAccess"`
	// AutoArchiveExempt exempts this project from the instance-wide
	// auto-archive-inactive-projects policy (design.md D9 of
	// add-data-retention) — settable only by a Tenant Admin, never a
	// Project Admin, even one with manageProject.
	AutoArchiveExempt bool `json:"autoArchiveExempt"`
	// AssigneeRestrictedRecording, when true, requires the authenticated
	// actor to match a run item's assignee (or hold ManageProject) before
	// recording a result or changing its status
	// (restrict-run-item-status-to-assignee). Default false preserves
	// today's behavior where any runRecordResult holder may act on any
	// item. An unassigned item is unaffected regardless of this setting.
	AssigneeRestrictedRecording bool `json:"assigneeRestrictedRecording"`
	// LandingView is this project's own landing-view override
	// (add-configurable-project-landing) — nil means it inherits the
	// instance-wide InstanceSettings.DefaultLandingView. Settable by a
	// user with manageProject on this project.
	LandingView *string   `json:"landingView"`
	CreatedAt   time.Time `json:"createdAt"`
}

// SupportedLanguages are the six UI locales add-ui-i18n ships with —
// shared by InstanceSettings.DefaultLanguage's validation and User.Language's
// validation, so the two never drift from each other or from the actual
// locale files under apps/web/src/locales/.
var SupportedLanguages = []string{"en", "es", "fr", "de", "pt", "zh"}

// IsSupportedLanguage reports whether lang is one of SupportedLanguages.
func IsSupportedLanguage(lang string) bool {
	for _, l := range SupportedLanguages {
		if l == lang {
			return true
		}
	}
	return false
}

// InstanceSettings is the single, instance-wide configuration row
// (enable-public-project-access) — a Tenant-Admin-only kill switch layered
// above every project's own PublicAccess flag.
type InstanceSettings struct {
	PublicProjectsEnabled bool `json:"publicProjectsEnabled"`
	// RunRetentionDays is a Tenant-Admin-configurable, instance-wide age
	// threshold (in days) past which a closed run is automatically and
	// permanently deleted by RunRetentionWorker (design.md D8 of
	// add-data-retention). 0 means the policy is off.
	RunRetentionDays int `json:"runRetentionDays"`
	// AutoArchiveInactiveDays is a Tenant-Admin-configurable, instance-wide
	// inactivity threshold (in days) past which a non-exempt project is
	// automatically archived by ProjectAutoArchiveWorker (design.md D9 of
	// add-data-retention). 0 means the policy is off.
	AutoArchiveInactiveDays int `json:"autoArchiveInactiveDays"`
	// RunAutoArchiveInactiveDays is a Tenant-Admin-configurable,
	// instance-wide age threshold (in days) past which a closed,
	// non-archived run is automatically archived by RunAutoArchiveWorker
	// (auto-archive-runs design.md D1). 0 means the policy is off.
	RunAutoArchiveInactiveDays int `json:"runAutoArchiveInactiveDays"`
	// ColorTheme is one of "teal" (default), "indigo", "ocean", "forest",
	// or "custom" (add-color-theme-customization design.md).
	ColorTheme    string         `json:"colorTheme"`
	CustomPalette *CustomPalette `json:"customPalette,omitempty"`
	// OIDC/SSO settings (add-sso-oidc) — Tenant-Admin-configurable, same
	// row as every other instance-wide setting. OIDCClientSecretSet is
	// computed (never the raw or encrypted secret itself).
	OIDCIssuer           string   `json:"oidcIssuer"`
	OIDCClientID         string   `json:"oidcClientId"`
	OIDCClientSecretSet  bool     `json:"oidcClientSecretSet"`
	OIDCGroupClaim       string   `json:"oidcGroupClaim"`
	OIDCAdminClaimValues []string `json:"oidcAdminClaimValues"`
	OIDCOnly             bool     `json:"oidcOnly"`
	// JiraSiteURL (add-jira-connector) is the Jira Cloud site base URL
	// (e.g. "https://mycompany.atlassian.net"), used only to build
	// browsable issue links in the UI — separate from the connector's own
	// TESTPULSE_JIRA_* env config, which it needs independently since it
	// runs as its own process with no access to instance settings. Empty
	// until a Tenant Admin configures it; a linked issue key still shows
	// then, just without a working link.
	JiraSiteURL string `json:"jiraSiteUrl"`
	// SessionTimeoutDays is a Tenant-Admin-configurable, instance-wide
	// sliding session expiry window in days (add-session-timeout-setting),
	// bounded 1-90 by the service layer. Default 30 preserves the behavior
	// of the hardcoded constant this setting replaced.
	SessionTimeoutDays int `json:"sessionTimeoutDays"`
	// DefaultLandingView is a Tenant-Admin-configurable, instance-wide
	// default for which view a project opens into
	// (add-configurable-project-landing) — one of "dashboard" (default),
	// "library", "suites", "runs", "reports". A project's own LandingView
	// override, when set, wins over this.
	DefaultLandingView string `json:"defaultLandingView"`
	// DefaultLanguage is a Tenant-Admin-configurable, instance-wide default
	// UI language (add-ui-i18n design.md D3) — one of "en" (default), "es",
	// "fr", "de", "pt", "zh". A user's own Language preference, when
	// PerUserLanguageEnabled is true and the preference is set, wins over
	// this for that user only.
	DefaultLanguage string `json:"defaultLanguage"`
	// PerUserLanguageEnabled (add-ui-i18n design.md D5) gates whether a
	// user's personal Language preference is allowed to override
	// DefaultLanguage at all. Off by default.
	PerUserLanguageEnabled bool      `json:"perUserLanguageEnabled"`
	UpdatedAt              time.Time `json:"updatedAt"`
}

// InstanceSettingsUpdate is a partial update to InstanceSettings — nil
// fields are left unchanged (design.md D8/D9 of add-data-retention;
// ColorTheme/CustomPalette added by add-color-theme-customization).
type InstanceSettingsUpdate struct {
	PublicProjectsEnabled   *bool
	RunRetentionDays        *int
	AutoArchiveInactiveDays *int
	ColorTheme              *string
	CustomPalette           *CustomPalette
	// OIDC/SSO fields (add-sso-oidc). OIDCClientSecret is write-only and
	// plaintext at this layer — the service layer encrypts it before it
	// reaches the store; nil leaves the currently-stored secret untouched.
	// DisableOIDC, when true, clears every oidc_* field/column at once —
	// a dedicated action rather than an empty-string sentinel (the same
	// trap ClearAvatarKey already exists to avoid).
	OIDCIssuer           *string
	OIDCClientID         *string
	OIDCClientSecret     *string
	OIDCGroupClaim       *string
	OIDCAdminClaimValues *[]string
	OIDCOnly             *bool
	DisableOIDC          *bool
	JiraSiteURL          *string
	SessionTimeoutDays   *int
	DefaultLandingView   *string
	// RunAutoArchiveInactiveDays (auto-archive-runs design.md D1) — same
	// 0-means-off convention as RunRetentionDays/AutoArchiveInactiveDays.
	RunAutoArchiveInactiveDays *int
	// DefaultLanguage/PerUserLanguageEnabled (add-ui-i18n design.md D3/D5).
	DefaultLanguage        *string
	PerUserLanguageEnabled *bool
}

// OIDCTeamMapping maps a single OIDC group-claim value to a Team
// (add-sso-oidc design.md D10) — on every OIDC login, a user whose ID
// token's group claim includes ClaimValue is added to TeamID if not
// already a member. Additive only: losing the claim value does not
// remove the membership.
type OIDCTeamMapping struct {
	ID         string `json:"id"`
	ClaimValue string `json:"claimValue"`
	TeamID     string `json:"teamId"`
}

// CustomPaletteMode is the 10 admin-editable tokens for one light/dark
// mode of a custom palette (add-color-theme-customization design.md) — the
// exact fields that vary between presets today; every other CSS custom
// property is derived from these by copying, matching how every shipped
// preset is already structured.
type CustomPaletteMode struct {
	Background        string `json:"background"`
	Foreground        string `json:"foreground"`
	Card              string `json:"card"`
	Primary           string `json:"primary"`
	PrimaryForeground string `json:"primaryForeground"`
	Muted             string `json:"muted"`
	MutedForeground   string `json:"mutedForeground"`
	Accent            string `json:"accent"`
	Border            string `json:"border"`
	Input             string `json:"input"`
}

// CustomPalette is a Tenant-Admin-authored palette, stored only when
// InstanceSettings.ColorTheme is "custom" (add-color-theme-customization).
type CustomPalette struct {
	Light CustomPaletteMode `json:"light"`
	Dark  CustomPaletteMode `json:"dark"`
}

type TestCase struct {
	ID             string      `json:"id"`
	Key            string      `json:"key"`
	ProjectID      string      `json:"projectId"`
	FolderID       string      `json:"folderId"`
	CurrentVersion int         `json:"currentVersion"`
	Content        CaseContent `json:"content"` // content of the current version
	CreatedAt      time.Time   `json:"createdAt"`
	// UpdatedAt is the current version's own createdAt — when the case was
	// last edited, not when it was originally created (rework-library-ux,
	// staleness signal). Equal to CreatedAt for a never-edited case.
	UpdatedAt time.Time `json:"updatedAt"`
	// JiraIssueKey and the cached fields below are identity-level metadata,
	// not versioned content (add-jira-connector) — set/cleared via the
	// dedicated jira-link endpoint, never the content-edit endpoint.
	// JiraIssueSummary/JiraIssueStatus/JiraLastSyncedAt are written only by
	// the external Jira connector via the jira-sync endpoint. There's no
	// cached issue URL here — the UI builds a browsable link from the
	// Tenant-Admin-configured InstanceSettings.JiraSiteURL + this key, so a
	// link works immediately, before any connector sync ever runs.
	JiraIssueKey     *string    `json:"jiraIssueKey,omitempty"`
	JiraIssueSummary *string    `json:"jiraIssueSummary,omitempty"`
	JiraIssueStatus  *string    `json:"jiraIssueStatus,omitempty"`
	JiraLastSyncedAt *time.Time `json:"jiraLastSyncedAt,omitempty"`
}

// Folder is a node in a project's case-organization tree (D8). Root
// (ParentFolderID == "") is created automatically with the project.
type Folder struct {
	ID             string    `json:"id"`
	ProjectID      string    `json:"projectId"`
	ParentFolderID string    `json:"parentFolderId,omitempty"`
	Name           string    `json:"name"`
	Slug           string    `json:"slug"`
	CreatedAt      time.Time `json:"createdAt"`
	// PreviousSlug/PreviousParentFolderID record this folder's single most
	// recent prior identity (add-folder-slug-urls) — set when the folder
	// is moved, overwritten (not accumulated) on each subsequent move.
	// Exposed to the frontend so slug-path resolution can fall back to a
	// folder's previous identity for a one-hop redirect, entirely
	// client-side against the already-loaded folder list.
	PreviousSlug           string `json:"previousSlug,omitempty"`
	PreviousParentFolderID string `json:"previousParentFolderId,omitempty"`
}

// ActorKind/ActorRefID mirror test_run_results' identical columns
// (link-case-version-actor-to-identity design.md) — same reasoning, same
// shape: no FK, so a version's attribution survives that actor being
// deleted later, and ActorKind is "unknown" for versions predating this
// capability rather than a fabricated identity.
type CaseVersion struct {
	CaseID     string          `json:"caseId"`
	Version    int             `json:"version"`
	Content    CaseContent     `json:"content"`
	ActorKind  ResultActorKind `json:"actorKind"`
	ActorRefID string          `json:"actorRefId,omitempty"`
	CreatedAt  time.Time       `json:"createdAt"`
}

type Suite struct {
	ID        string    `json:"id"`
	Key       string    `json:"key"`
	ProjectID string    `json:"projectId"`
	Name      string    `json:"name"`
	CaseIDs   []string  `json:"caseIds"`
	CreatedAt time.Time `json:"createdAt"`
	// LastRunAt reflects the suite's most recently created run, regardless
	// of open/closed status — the same "latest run" semantic ProjectSummary
	// already uses (rework-suites-landing-ux). PassRate does NOT share that
	// semantic: it reflects the most recently CLOSED run, or nil if none
	// exists yet, so a fresh open run never overrides or manufactures a
	// settled-looking number (rework-suite-run-flow D10). Both computed via
	// one batched query per List/Get call, not one query per suite.
	PassRate  *int       `json:"passRate"`
	LastRunAt *time.Time `json:"lastRunAt"`
}

// ReleaseStatus is a Release's lifecycle state (introduce-release-test-plan
// design.md D3), validated as a flat enum like Priority — no requirement
// yet needs status transition history, only current state.
type ReleaseStatus string

const (
	ReleaseStatusActive     ReleaseStatus = "active"
	ReleaseStatusMaintained ReleaseStatus = "maintained"
	ReleaseStatusEOL        ReleaseStatus = "eol"
)

var validReleaseStatuses = map[ReleaseStatus]bool{
	ReleaseStatusActive: true, ReleaseStatusMaintained: true, ReleaseStatusEOL: true,
}

// Release is a project-scoped, long-lived entity tracking one supported
// release's lifecycle (introduce-release-test-plan) — a real identity with
// status, not a text label on a run. Optional: a project with no Releases
// is unaffected (design.md D1).
type Release struct {
	ID          string        `json:"id"`
	Key         string        `json:"key"`
	ProjectID   string        `json:"projectId"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Status      ReleaseStatus `json:"status"`
	CreatedAt   time.Time     `json:"createdAt"`
}

func (r Release) Validate() error {
	if r.Name == "" {
		return fmt.Errorf("name is required")
	}
	if r.Status != "" && !validReleaseStatuses[r.Status] {
		return fmt.Errorf("invalid status %q: must be one of active, maintained, eol", r.Status)
	}
	return nil
}

// TestPlan is the execution-scope grouping of Runs belonging to one Release
// (introduce-release-test-plan) — e.g. one Test Plan per platform being
// tested against a release. Named after the TestRail/Xray/Zephyr tool
// convention, not ISTQB's "Test Plan" (a planning document) — a deliberate
// naming call, see design.md D2. A Test Plan's Release never changes after
// creation.
type TestPlan struct {
	ID          string    `json:"id"`
	Key         string    `json:"key"`
	ProjectID   string    `json:"projectId"`
	ReleaseID   string    `json:"releaseId"`
	ReleaseKey  string    `json:"releaseKey"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (p TestPlan) Validate() error {
	if p.Name == "" {
		return fmt.Errorf("name is required")
	}
	return nil
}

// Rollup is a server-side aggregated pass rate + run count across a Test
// Plan's or Release's runs (introduce-release-test-plan design.md D5) —
// always computed via a single batched aggregate query, never a
// client-side fetch-and-count loop. PassRate is nil when RunCount is 0.
type Rollup struct {
	RunCount int  `json:"runCount"`
	PassRate *int `json:"passRate,omitempty"`
}

// Requirement is a project-scoped, flat (no hierarchy) record linkable to
// test cases (add-requirements-traceability design.md). ExternalRef is a
// free-text field only (e.g. a Jira/ADO key or URL) — no live sync.
type Requirement struct {
	ID          string    `json:"id"`
	Key         string    `json:"key"`
	ProjectID   string    `json:"projectId"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	ExternalRef string    `json:"externalRef"`
	CaseIDs     []string  `json:"caseIds"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (r Requirement) Validate() error {
	if r.Name == "" {
		return fmt.Errorf("name is required")
	}
	return nil
}

// CoverageStatus is a Requirement's computed (never stored) coverage state
// for a given Release, per the worst-case rollup rule (design.md D3).
type CoverageStatus string

const (
	CoverageNotRun  CoverageStatus = "notRun"
	CoverageFailing CoverageStatus = "failing"
	CoverageCovered CoverageStatus = "covered"
)

// RequirementCoverage is one row of a Release's coverage matrix.
type RequirementCoverage struct {
	RequirementID  string         `json:"requirementId"`
	RequirementKey string         `json:"requirementKey"`
	Name           string         `json:"name"`
	Status         CoverageStatus `json:"status"`
	CaseCount      int            `json:"caseCount"`
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
	SuiteKey *string `json:"suiteKey,omitempty"`
	// TestPlanID/TestPlanKey optionally scope this run to a Test Plan
	// (introduce-release-test-plan design.md D1) — additive: a run created
	// with no Test Plan behaves exactly as before this capability existed.
	// Deleting the Test Plan later clears these (ON DELETE SET NULL)
	// without affecting the run or its items.
	TestPlanID  *string `json:"-"`
	TestPlanKey *string `json:"testPlanKey,omitempty"`
	// PassRate is this run's own items' pass rate (0-100), or nil if the
	// run has no items yet (group-runs-by-status) — computed alongside the
	// list query, not a per-run round trip.
	PassRate *int `json:"passRate,omitempty"`
	// Archived hides this run from the project's active run list by
	// default (auto-archive-runs) — reversible, set either manually or by
	// RunAutoArchiveWorker. Independent of Status: an open or closed run
	// may be archived.
	Archived  bool      `json:"archived"`
	CreatedAt time.Time `json:"createdAt"`
}

// RunStatus is a run's open/closed lifecycle state (add-run-lifecycle-status).
// A closed run's items become read-only: no new results, status/assignee
// updates, or added items. Runs created explicitly start open; runs
// created via bulk import start closed, since every item they contain
// already has a final verdict at creation time (collapse-duplicate-ci-runs).
type RunStatus string

const (
	RunStatusOpen   RunStatus = "open"
	RunStatusClosed RunStatus = "closed"
)

// AssigneeKind distinguishes a user from a team as a run item's assignee
// (link-run-item-assignee-to-identity).
type AssigneeKind string

const (
	AssigneeKindUser AssigneeKind = "user"
	AssigneeKindTeam AssigneeKind = "team"
)

// Assignee is a run item's real assignee, resolved from its foreign key —
// nil when the item is unassigned (including when its previously-assigned
// user or team has since been deleted).
type Assignee struct {
	Kind AssigneeKind `json:"kind"`
	ID   string       `json:"id"`
	Name string       `json:"name"`
	// AvatarKey is only ever set for a user assignee (add-user-profile) —
	// teams have no avatar concept and always leave this nil.
	AvatarKey *string `json:"avatarKey"`
}

type RunItem struct {
	ID            string      `json:"id"`
	RunID         string      `json:"runId"`
	CaseID        string      `json:"caseId"`
	CaseKey       string      `json:"caseKey"`
	CaseVersion   int         `json:"caseVersion"`
	Assignee      *Assignee   `json:"assignee,omitempty"`
	CurrentStatus Status      `json:"currentStatus"`
	Content       CaseContent `json:"content"` // pinned version's content
	NewerVersion  bool        `json:"newerVersion"`
	// TestName is the literal name an external test runner reported
	// (add-execution-import), independent of the pinned case's own title.
	// Empty for items added manually.
	TestName  string    `json:"testName,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	// JiraIssueKey and the cached fields below mirror TestCase's
	// (add-jira-connector) — identity-level metadata independent of the
	// pinned case version, set/cleared via the dedicated jira-link
	// endpoint, cached fields written only by the connector via jira-sync.
	JiraIssueKey     *string    `json:"jiraIssueKey,omitempty"`
	JiraIssueSummary *string    `json:"jiraIssueSummary,omitempty"`
	JiraIssueStatus  *string    `json:"jiraIssueStatus,omitempty"`
	JiraLastSyncedAt *time.Time `json:"jiraLastSyncedAt,omitempty"`
	// StepStates are this run item's live, carry-forward step verdicts
	// (add-step-level-results) — not reset when an overall verdict is
	// recorded; see Result.StepResults for a past attempt's immutable
	// snapshot.
	StepStates []StepResult `json:"stepStates,omitempty"`
	// TestDataRow is this item's parameterized-case data-row values
	// (add-parameterized-cases), excluding the row's own "Name" (already
	// carried by TestName). Nil for the overwhelming majority of items —
	// those not expanded from a parameter table row.
	TestDataRow map[string]string `json:"testDataRow,omitempty"`
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
	ID          string          `json:"id"`
	RunItemID   string          `json:"runItemId"`
	Actor       string          `json:"actor"`
	ActorKind   ResultActorKind `json:"actorKind"`
	ActorRefID  string          `json:"actorRefId,omitempty"`
	Verdict     Verdict         `json:"verdict"`
	Comment     string          `json:"comment"`
	StartTime   *time.Time      `json:"startTime,omitempty"`
	EndTime     *time.Time      `json:"endTime,omitempty"`
	Platform    string          `json:"platform,omitempty"`
	Version     string          `json:"version,omitempty"`
	Tags        []string        `json:"tags,omitempty"`
	Attachments []Attachment    `json:"attachments,omitempty"`
	// StepResults is this result's immutable snapshot of step verdicts,
	// taken at the moment it was recorded (add-step-level-results) —
	// never changes afterward, even as the run item's live step verdicts
	// (RunItem.StepStates) continue to change.
	StepResults []StepResult `json:"stepResults,omitempty"`
	CreatedAt   time.Time    `json:"createdAt"`
}

// Attachment is an image (screenshot) evidencing a run item result
// (add-run-item-screenshot-attachments). Bytes are never inlined here —
// they are fetched separately via the attachment's own serving endpoint,
// the same shape as a user's avatar.
type Attachment struct {
	ID          string    `json:"id"`
	RunItemID   string    `json:"runItemId"`
	ResultID    string    `json:"resultId,omitempty"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"contentType"`
	CreatedAt   time.Time `json:"createdAt"`
}

// CaseAttachment is a reference file (image or PDF) attached to a test
// case's identity, not to any specific CaseVersion (add-case-reference-
// attachments design.md D1) — it survives case edits the same way
// JiraIssueKey does. Independent of Attachment, which belongs to run
// execution evidence.
type CaseAttachment struct {
	ID          string    `json:"id"`
	CaseID      string    `json:"caseId"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"contentType"`
	CreatedAt   time.Time `json:"createdAt"`
}

// NewAttachment is an inline, base64-encoded attachment submitted alongside
// a NewResult or an import request, created atomically with the result(s)
// it belongs to (add-run-item-screenshot-attachments design.md).
type NewAttachment struct {
	// CaseKey scopes this attachment to a specific matched test within a
	// bulk import request; empty when submitted directly on a single
	// NewResult, which has no ambiguity about which result it belongs to.
	CaseKey     string `json:"caseKey,omitempty"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Data        []byte `json:"data"`
}

// RunSummary is the per-run status breakdown.
type RunSummary struct {
	RunID  string         `json:"runId"`
	Total  int            `json:"total"`
	Counts map[Status]int `json:"counts"`
}

// ProjectStatusSummary is the project-wide status breakdown across every
// run (open and closed), add-project-reports-page.
type ProjectStatusSummary struct {
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
	// IsOpen marks the trailing point added by Trend's includeOpen mode
	// (add-suite-run-breakdown-trend) — false for every closed-run point.
	IsOpen bool `json:"isOpen,omitempty"`
}

// SuiteTrend is a suite's closed runs, oldest first, each as a
// SuiteTrendPoint (add-suite-pass-rate-trend).
type SuiteTrend struct {
	SuiteID  string            `json:"suiteId"`
	SuiteKey string            `json:"suiteKey"`
	Points   []SuiteTrendPoint `json:"points"`
}

// RunComparisonItem is one case's status transition between two compared
// runs (add-run-comparison-view). StatusOlder is nil for an added item
// (present only in the newer run); StatusNewer is nil for a removed item
// (present only in the older run).
type RunComparisonItem struct {
	CaseKey     string  `json:"caseKey"`
	CaseTitle   string  `json:"caseTitle"`
	StatusOlder *Status `json:"statusOlder,omitempty"`
	StatusNewer *Status `json:"statusNewer,omitempty"`
}

// RunComparisonSummary is a SuiteTrendPoint plus a comparison-only total
// duration figure (add-run-comparison-timing design.md D1) — kept separate
// from SuiteTrendPoint itself so this comparison-specific field never leaks
// into the unrelated Stability trend that type also serves.
// TotalDurationMs is nil when the run has no item with a fully-timed
// result, never 0 — "no timing data" and "zero elapsed time" are distinct.
type RunComparisonSummary struct {
	RunKey          string         `json:"runKey"`
	RunName         string         `json:"runName"`
	CreatedAt       time.Time      `json:"createdAt"`
	Total           int            `json:"total"`
	Counts          map[Status]int `json:"counts"`
	TotalDurationMs *int64         `json:"totalDurationMs,omitempty"`
}

// RunComparison is the categorized item-level diff between two closed runs
// from the same project, joined by case key (add-run-comparison-view).
// OlderRun/NewerRun are ordered by actual creation time, independent of
// which run key was supplied first in the request.
type RunComparison struct {
	OlderRun  RunComparisonSummary `json:"olderRun"`
	NewerRun  RunComparisonSummary `json:"newerRun"`
	Regressed []RunComparisonItem  `json:"regressed"`
	Improved  []RunComparisonItem  `json:"improved"`
	Unchanged []RunComparisonItem  `json:"unchanged"`
	Added     []RunComparisonItem  `json:"added"`
	Removed   []RunComparisonItem  `json:"removed"`
}

// FlakyCase is a case whose current version's executions include both a
// pass and a failed/blocked result (add-flaky-test-detection). Rate is a
// 0-100 percentage: min(passCount, failedOrBlockedCount) / (passCount +
// failedOrBlockedCount) — "how much of a coin flip is this," not simply the
// failure fraction, so a case that's failed 9 times and passed once doesn't
// read as "10% flaky."
// SearchResult is one match from the MCP `search` tool's cross-entity
// full-text search (add-mcp-server) — EntityType is one of "case", "suite",
// "run", "project", "release", "testPlan", matching get_details's
// entity_type param so a result can be fetched in full with one follow-up
// call.
type SearchResult struct {
	EntityType string  `json:"entityType"`
	Key        string  `json:"key"`
	Name       string  `json:"name"`
	ProjectID  string  `json:"projectId"`
	Rank       float64 `json:"rank"`
}

type FlakyCase struct {
	CaseKey        string `json:"caseKey"`
	CaseTitle      string `json:"caseTitle"`
	CurrentVersion int    `json:"currentVersion"`
	Rate           int    `json:"rate"`
}

// ClientErrorReport is a frontend crash or failed API call, reported for
// server-side logging only (add-frontend-error-reporting) — never
// persisted. Kind is "crash" (Stack/ComponentStack meaningful) or
// "apiError" (Method/Path/Status meaningful); Status is absent for a
// network-level failure.
type ClientErrorReport struct {
	Kind           string `json:"kind"`
	Message        string `json:"message"`
	Stack          string `json:"stack,omitempty"`
	ComponentStack string `json:"componentStack,omitempty"`
	URL            string `json:"url,omitempty"`
	Method         string `json:"method,omitempty"`
	Path           string `json:"path,omitempty"`
	Status         int    `json:"status,omitempty"`
}

// CustomFieldType is the fixed set of custom field types
// (add-case-custom-fields) — chosen at creation, never changed afterward.
type CustomFieldType string

const (
	CustomFieldTypeText   CustomFieldType = "text"
	CustomFieldTypeSelect CustomFieldType = "select"
)

// CustomField is a project-scoped custom field definition on test cases
// (add-case-custom-fields). Options is only populated for a `select`
// field, ordered by Position.
type CustomField struct {
	ID        string              `json:"id"`
	ProjectID string              `json:"-"`
	Name      string              `json:"name"`
	FieldType CustomFieldType     `json:"fieldType"`
	Position  int                 `json:"-"`
	Options   []CustomFieldOption `json:"options,omitempty"`
	CreatedAt time.Time           `json:"createdAt"`
}

// CustomFieldOption is one option of a `select` custom field
// (add-case-custom-fields).
type CustomFieldOption struct {
	ID       string `json:"id"`
	FieldID  string `json:"-"`
	Value    string `json:"value"`
	Position int    `json:"-"`
}

// CustomFieldDeletionPreview reports how many of a project's current
// cases have a value set for a field about to be deleted
// (add-case-custom-fields), matching RoleDeletionPreview's counts-only
// convention.
type CustomFieldDeletionPreview struct {
	CaseCount int `json:"caseCount"`
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
	// Archived reflects the project's current archived state
	// (add-data-retention design.md D7) — Summaries() no longer excludes
	// archived projects, so callers need this to badge them correctly.
	Archived bool `json:"archived"`
	// Tags is the project's assigned tag names (add-project-tags), always
	// a non-nil empty slice rather than null when the project has none.
	Tags []string `json:"tags"`
}

// Tag is an entry in the shared, deduplicated project tag vocabulary
// (add-project-tags) — Name is stored normalized-lowercase by the service
// layer so the same typed name always resolves to the same tag.
type Tag struct {
	ID   string `json:"id"`
	Name string `json:"name"`
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
	PermSectionEdit         Permission = "sectionEdit"
	PermSectionDelete       Permission = "sectionDelete"
	PermSuiteCreate         Permission = "suiteCreate"
	PermSuiteEditMembership Permission = "suiteEditMembership"
	PermRunCreate           Permission = "runCreate"
	PermRunRecordResult     Permission = "runRecordResult"
	PermManageProject       Permission = "manageProject"
	PermRunDelete           Permission = "runDelete"
	PermProjectDelete       Permission = "projectDelete"
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
	CanSectionEdit         bool      `json:"canSectionEdit"`
	CanSectionDelete       bool      `json:"canSectionDelete"`
	CanSuiteCreate         bool      `json:"canSuiteCreate"`
	CanSuiteEditMembership bool      `json:"canSuiteEditMembership"`
	CanRunCreate           bool      `json:"canRunCreate"`
	CanRunRecordResult     bool      `json:"canRunRecordResult"`
	CanManageProject       bool      `json:"canManageProject"`
	CanRunDelete           bool      `json:"canRunDelete"`
	CanProjectDelete       bool      `json:"canProjectDelete"`
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
	case PermSectionEdit:
		return r.CanSectionEdit
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
	case PermRunDelete:
		return r.CanRunDelete
	case PermProjectDelete:
		return r.CanProjectDelete
	default:
		return false
	}
}

// Permissions converts a role's flags to a Permissions set — used for a
// scoped API token's granted set before it's intersected with its
// creator's own current access (backlog #117, design.md D1/D3).
func (r Role) Permissions() Permissions {
	return Permissions{
		Read:                r.CanRead,
		CaseCreate:          r.CanCaseCreate,
		CaseEdit:            r.CanCaseEdit,
		CaseDelete:          r.CanCaseDelete,
		SectionCreate:       r.CanSectionCreate,
		SectionEdit:         r.CanSectionEdit,
		SectionDelete:       r.CanSectionDelete,
		SuiteCreate:         r.CanSuiteCreate,
		SuiteEditMembership: r.CanSuiteEditMembership,
		RunCreate:           r.CanRunCreate,
		RunRecordResult:     r.CanRunRecordResult,
		ManageProject:       r.CanManageProject,
		RunDelete:           r.CanRunDelete,
		ProjectDelete:       r.CanProjectDelete,
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
	SectionEdit         bool `json:"sectionEdit"`
	SectionDelete       bool `json:"sectionDelete"`
	SuiteCreate         bool `json:"suiteCreate"`
	SuiteEditMembership bool `json:"suiteEditMembership"`
	RunCreate           bool `json:"runCreate"`
	RunRecordResult     bool `json:"runRecordResult"`
	ManageProject       bool `json:"manageProject"`
	RunDelete           bool `json:"runDelete"`
	ProjectDelete       bool `json:"projectDelete"`
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
	case PermSectionEdit:
		return p.SectionEdit
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
	case PermRunDelete:
		return p.RunDelete
	case PermProjectDelete:
		return p.ProjectDelete
	default:
		return false
	}
}

// IsSubsetOf reports whether every permission p grants is also granted by
// other — used to validate a scoped API token's requested role never
// exceeds its creator's own current access (backlog #117, design.md D4).
func (p Permissions) IsSubsetOf(other Permissions) bool {
	return (!p.Read || other.Read) &&
		(!p.CaseCreate || other.CaseCreate) &&
		(!p.CaseEdit || other.CaseEdit) &&
		(!p.CaseDelete || other.CaseDelete) &&
		(!p.SectionCreate || other.SectionCreate) &&
		(!p.SectionEdit || other.SectionEdit) &&
		(!p.SectionDelete || other.SectionDelete) &&
		(!p.SuiteCreate || other.SuiteCreate) &&
		(!p.SuiteEditMembership || other.SuiteEditMembership) &&
		(!p.RunCreate || other.RunCreate) &&
		(!p.RunRecordResult || other.RunRecordResult) &&
		(!p.ManageProject || other.ManageProject) &&
		(!p.RunDelete || other.RunDelete) &&
		(!p.ProjectDelete || other.ProjectDelete)
}

// Intersect returns the permissions granted by both p and other — a
// scoped API token's actual effective permissions, request-time-computed
// from its role's flags ANDed with its creator's current access, never a
// stale snapshot of either alone (backlog #117, design.md D3).
func (p Permissions) Intersect(other Permissions) Permissions {
	return Permissions{
		Read:                p.Read && other.Read,
		CaseCreate:          p.CaseCreate && other.CaseCreate,
		CaseEdit:            p.CaseEdit && other.CaseEdit,
		CaseDelete:          p.CaseDelete && other.CaseDelete,
		SectionCreate:       p.SectionCreate && other.SectionCreate,
		SectionEdit:         p.SectionEdit && other.SectionEdit,
		SectionDelete:       p.SectionDelete && other.SectionDelete,
		SuiteCreate:         p.SuiteCreate && other.SuiteCreate,
		SuiteEditMembership: p.SuiteEditMembership && other.SuiteEditMembership,
		RunCreate:           p.RunCreate && other.RunCreate,
		RunRecordResult:     p.RunRecordResult && other.RunRecordResult,
		ManageProject:       p.ManageProject && other.ManageProject,
		RunDelete:           p.RunDelete && other.RunDelete,
		ProjectDelete:       p.ProjectDelete && other.ProjectDelete,
	}
}

// User.IsTenantAdmin replaces the old instance-wide admin/member Role
// (add-project-rbac design.md D1) — a non-Tenant-Admin's access is entirely
// determined by their per-project membership, not a flat instance role.
type User struct {
	ID            string  `json:"id"`
	Email         string  `json:"email"`
	IsTenantAdmin bool    `json:"isTenantAdmin"`
	DisplayName   *string `json:"displayName"`
	AvatarKey     *string `json:"avatarKey"`
	Timezone      *string `json:"timezone"`
	// Language is this user's personal UI language preference
	// (add-ui-i18n design.md D4) — nullable like Timezone. Only takes
	// effect when InstanceSettings.PerUserLanguageEnabled is true;
	// otherwise every visitor sees InstanceSettings.DefaultLanguage
	// regardless of this value.
	Language           *string    `json:"language"`
	DeactivatedAt      *time.Time `json:"deactivatedAt"`
	CreatedAt          time.Time  `json:"createdAt"`
	MustChangePassword bool       `json:"mustChangePassword"`
	// OIDCSubject links this account to an external OIDC identity
	// (add-sso-oidc); internal linkage detail, never serialized to clients.
	OIDCSubject *string `json:"-"`
}

// UserDeletionPreview is the "what does deleting this account remove"
// summary shown by the delete-confirmation dialog (add-user-deletion
// design.md D5) — server-computed so the numbers are authoritative, not a
// client-side fan-out over every project.
type UserDeletionPreview struct {
	TeamCount    int `json:"teamCount"`
	ProjectCount int `json:"projectCount"`
	TokenCount   int `json:"tokenCount"`
}

// RoleDeletionPreview is the "what does deleting this role affect" summary
// shown by the delete-role confirmation dialog (redesign-admin-shell),
// mirroring UserDeletionPreview's pattern.
type RoleDeletionPreview struct {
	DirectUserCount int `json:"directUserCount"`
	TeamCount       int `json:"teamCount"`
	ProjectCount    int `json:"projectCount"`
}

// TeamDeletionPreview is the "what does deleting this team affect" summary
// shown by the delete-team confirmation dialog (add-team-deletion-preview),
// mirroring UserDeletionPreview and RoleDeletionPreview's pattern.
type TeamDeletionPreview struct {
	MemberCount  int `json:"memberCount"`
	ProjectCount int `json:"projectCount"`
}

// AvatarPresetKeys is the fixed, curated set of avatar preset keys
// (add-user-profile design.md) — static bundled assets, not database rows.
// A nil/absent AvatarKey renders as a generated initial-on-color instead.
var AvatarPresetKeys = map[string]bool{
	"ada-lovelace":           true,
	"alan-turing":            true,
	"grace-hopper":           true,
	"marie-curie":            true,
	"charles-darwin":         true,
	"katherine-johnson":      true,
	"isaac-newton":           true,
	"albert-einstein":        true,
	"emmy-noether":           true,
	"nikola-tesla":           true,
	"mary-anning":            true,
	"john-von-neumann":       true,
	"severo-ochoa":           true,
	"richard-feynman":        true,
	"leonardo-da-vinci":      true,
	"archimedes":             true,
	"charles-babbage":        true,
	"galileo-galilei":        true,
	"michael-faraday":        true,
	"srinivasa-ramanujan":    true,
	"hideyo-noguchi":         true,
	"sophie-germain":         true,
	"caroline-herschel":      true,
	"mary-somerville":        true,
	"henrietta-swan-leavitt": true,
	"nettie-stevens":         true,
	"lise-meitner":           true,
	"agnes-pockels":          true,
	"hypatia":                true,
	"confucius":              true,
}

// UserProfileUpdate carries the self-service profile fields a user may
// change about themselves (add-user-profile) — distinct from the
// Tenant-Admin-only fields (IsTenantAdmin, DeactivatedAt) a user can never
// set on their own record. A nil field leaves that column unchanged.
type UserProfileUpdate struct {
	DisplayName *string
	AvatarKey   *string
	Timezone    *string
	Language    *string
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

// 12 chars (backlog #118) — current NIST/OWASP guidance favors length over
// forced complexity rules (required symbol/digit/etc.), which push users
// toward predictable substitutions without meaningfully raising entropy.
func ValidatePassword(password string) error {
	if len(password) < 12 {
		return fmt.Errorf("password must be at least 12 characters")
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

// PasswordResetToken (add-forgot-password) is returned only internally by
// the store — the raw token that goes out in the email is never persisted
// or returned, only its hash (mirrors Session/ApiToken).
type PasswordResetToken struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
	UsedAt    *time.Time
	CreatedAt time.Time
}

type Session struct {
	// Never serialized: it is the raw session secret (the cookie value),
	// only ever populated by Service.Login — the store layer never stores
	// or returns it in this form, only its hash (backlog #116). Empty on
	// a Session returned from anywhere else (e.g. AuthenticateSession).
	ID        string    `json:"-"`
	UserID    string    `json:"userId"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// ApiToken is a credential an authenticated user issues for an agent. Only
// Prefix is ever shown again after creation — the full token value is
// returned once by the service layer and never persisted (design D3).
// ProjectID/RoleID are both nil for an unscoped token (full inheritance of
// the creator's live permission level, the original/default behavior) or
// both set for one scoped to a project + role (backlog #117, design.md
// D1) — never independently nil, enforced by a DB CHECK constraint.
type ApiToken struct {
	ID        string     `json:"id"`
	CreatedBy string     `json:"createdBy"`
	Name      string     `json:"name"`
	Prefix    string     `json:"prefix"`
	ProjectID *string    `json:"projectId"`
	RoleID    *string    `json:"roleId"`
	RevokedAt *time.Time `json:"revokedAt"`
	CreatedAt time.Time  `json:"createdAt"`
}

// ApiTokenWithOwner is one token in the instance-wide, Tenant-Admin-only
// listing (add-instance-token-listing) — owner/project/role are resolved
// server-side in the same query, never raw internal ids, so the frontend
// doesn't need to cross-reference separate user/project/role lists the
// way the personal tokens page already does locally.
type ApiTokenWithOwner struct {
	ID               string     `json:"id"`
	OwnerEmail       string     `json:"ownerEmail"`
	OwnerDisplayName *string    `json:"ownerDisplayName"`
	Name             string     `json:"name"`
	Prefix           string     `json:"prefix"`
	ProjectKey       *string    `json:"projectKey"`
	RoleName         *string    `json:"roleName"`
	RevokedAt        *time.Time `json:"revokedAt"`
	CreatedAt        time.Time  `json:"createdAt"`
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
	// ActorKindSystem attributes an audit entry to an unattended background
	// process (e.g. the automatic run-retention sweep, design.md D8 of
	// add-data-retention) rather than a resolved request-time actor.
	ActorKindSystem ActorKind = "system"
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
	// MustChangePassword (add-change-own-password): always false for an
	// agent/token actor — only a human session actor can have a pending
	// required password change, resolved fresh from the underlying user
	// on every request (AuthenticateSession), never cached.
	MustChangePassword bool
	// ScopedProjectID/ScopedPermissions: both nil for a human actor or an
	// unscoped agent token (full inheritance, unchanged default
	// behavior). Both set for a token scoped to a project + role
	// (backlog #117, design.md D3) — ScopedPermissions is already the
	// *intersection* of the role's flags and the creator's current
	// access at the time it was resolved (AuthenticateToken), not the
	// raw role alone.
	ScopedProjectID   *string
	ScopedPermissions *Permissions
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
	// ProjectID is the entity's owning project (project-activity-feed),
	// resolved automatically at write time. Empty for entity types with
	// no owning project (user, team, role, instance_settings, api_token).
	ProjectID  string         `json:"projectId,omitempty"`
	OccurredAt time.Time      `json:"occurredAt"`
	Detail     map[string]any `json:"detail,omitempty"`
}

// ImportMode distinguishes a dry run (read-only, produces a report with no
// side effects) from a real import (add-testrail-importer design.md D1/D3).
type ImportMode string

const (
	ImportModeDryRun ImportMode = "dry_run"
	ImportModeReal   ImportMode = "real"
)

var validImportModes = map[ImportMode]bool{ImportModeDryRun: true, ImportModeReal: true}

func ParseImportMode(s string) (ImportMode, error) {
	m := ImportMode(s)
	if !validImportModes[m] {
		return "", fmt.Errorf("invalid import mode %q: must be one of dry_run, real", s)
	}
	return m, nil
}

// ImportJobStatus tracks an import job's lifecycle. pending/running are
// in-flight; succeeded/failed are terminal — Terminal() is what the store
// layer uses to decide when to scrub a job's stored credentials.
type ImportJobStatus string

const (
	ImportJobStatusPending   ImportJobStatus = "pending"
	ImportJobStatusRunning   ImportJobStatus = "running"
	ImportJobStatusSucceeded ImportJobStatus = "succeeded"
	ImportJobStatusFailed    ImportJobStatus = "failed"
)

var validImportJobStatuses = map[ImportJobStatus]bool{
	ImportJobStatusPending: true, ImportJobStatusRunning: true,
	ImportJobStatusSucceeded: true, ImportJobStatusFailed: true,
}

func ParseImportJobStatus(s string) (ImportJobStatus, error) {
	st := ImportJobStatus(s)
	if !validImportJobStatuses[st] {
		return "", fmt.Errorf("invalid import job status %q: must be one of pending, running, succeeded, failed", s)
	}
	return st, nil
}

func (s ImportJobStatus) Terminal() bool {
	return s == ImportJobStatusSucceeded || s == ImportJobStatusFailed
}

// ImportReport is an import job's outcome (real or dry-run): counts per
// entity type created (or that would be created), and every item that
// didn't survive the source's mapping onto TestPulse's domain, named
// individually — never collapsed into a "+N more" summary
// (add-testrail-importer design.md D7).
type ImportReport struct {
	Counts   map[string]int `json:"counts"`
	Unmapped []string       `json:"unmapped"`
}

// ImportJob is a request to import a project's content from an external
// source (add-testrail-importer). Source is deliberately an opaque string,
// never a closed enum — apps/api's domain/service/store layers never parse
// source-specific meaning from it; that's exclusively the importing tool's
// job (design.md D1/D2). Credentials are held by the store layer encrypted
// at rest and are never part of this struct's JSON representation returned
// to a caller — see store.ImportJobRepo.
type ImportJob struct {
	ID              string          `json:"id"`
	ProjectID       string          `json:"projectId"`
	Source          string          `json:"source"`
	Mode            ImportMode      `json:"mode"`
	Status          ImportJobStatus `json:"status"`
	Report          *ImportReport   `json:"report,omitempty"`
	ProgressCurrent int             `json:"progressCurrent"`
	ProgressTotal   int             `json:"progressTotal"`
	Error           *string         `json:"error,omitempty"`
	CreatedBy       string          `json:"createdBy"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
	StartedAt       *time.Time      `json:"startedAt,omitempty"`
	FinishedAt      *time.Time      `json:"finishedAt,omitempty"`
}

// WebhookDestination is a project-scoped outbound HTTPS URL notified on a
// failed/blocked result or a run close (add-run-notifications). A project
// may have any number of destinations; every one receives every event —
// there is no per-destination event-type filtering in v1.
type WebhookDestination struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	URL       string    `json:"url"`
	CreatedAt time.Time `json:"createdAt"`
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

// Package domain holds the core test management types and their invariants.
// It has no dependencies on storage or transport; services and stores build
// on it.
package domain

import (
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
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Archived  bool      `json:"archived"`
	CreatedAt time.Time `json:"createdAt"`
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

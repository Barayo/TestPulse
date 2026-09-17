// Package xrayclient is a minimal Xray (Xpand IT's Jira test-management
// add-on) client covering both deployment modes add-xray-importer's
// design.md supports: Xray Cloud (GraphQL, client_id/secret auth) and
// Xray Server/Data Center (REST, Jira Personal Access Token auth).
// NewCloud and NewServer each return a distinct internal implementation
// satisfying the same Client interface (design.md D-X1), so
// internal/importer's mapping logic never branches on which mode it's
// talking to.
//
// Verified against Xray's own published documentation (docs.getxray.app,
// the Cloud GraphQL schema reference at
// us.xray.cloud.getxray.app/doc/graphql) — not assumed: Cloud's getTests
// query takes a folder(path, includeDescendants) filter and returns
// Xray-native fields (testType, steps[].action/data/result, gherkin,
// unstructured) plus named Jira fields (summary, description) in one
// round trip, addressed by the numeric Jira project id (not the project
// key — design.md D-X2 addendum); Server/DC genuinely splits the two,
// Jira's own REST API for issue fields and Xray's raven REST API
// (/rest/raven/1.0/api/testrepository/.../folders,
// /rest/raven/1.0/api/test/{key}/step) for repository structure and
// steps, addressed by the project key. No write endpoints: this importer
// never writes back to Xray.
package xrayclient

import "context"

// Folder is one node of an Xray project's Test Repository folder tree.
// ParentID is nil for a root folder.
type Folder struct {
	ID       string
	ParentID *string
	Name     string
}

// TestStep is one entry of a Manual-type Test's structured steps, in
// order (design.md D-X5).
type TestStep struct {
	Action string
	Data   string
	Result string
}

// Test is an Xray Test issue. TestType is Xray's own reported type
// ("Manual", "Cucumber", "Generic", or another vendor-defined value) —
// only "Manual" tests carry steps, fetched separately via GetTestSteps
// since Server/DC's own API requires a distinct call for them; every
// other type's freeform procedure is carried in Definition instead
// (design.md D-X5). CustomFields is the issue's raw Jira custom field
// value map, keyed by field id/name; deciding which values are mappable
// strings versus droppable is internal/importer's job (design.md D-X6),
// not this client's.
type Test struct {
	Key          string
	Summary      string
	Description  string
	TestType     string
	Definition   string
	CustomFields map[string]any
}

// Client is the read-only Xray surface add-xray-importer needs,
// satisfied identically by both the Cloud (GraphQL) and Server/Data
// Center (REST) implementations (design.md D-X1) — internal/importer's
// mapping logic only ever sees this interface, never which mode
// constructed it.
type Client interface {
	// ListFolders returns every folder in the project's Test Repository,
	// preserving Xray's own parent-child tree.
	ListFolders(ctx context.Context) ([]Folder, error)
	// ListTests returns every Test issue directly inside folderID (not
	// its descendants) — design.md D-X4 walks the folder tree itself, one
	// folder's own tests at a time.
	ListTests(ctx context.Context, folderID string) ([]Test, error)
	// GetTestSteps returns a Manual-type Test's structured steps, in
	// order. Returns an empty slice for a non-Manual test or a Manual
	// test with no steps.
	GetTestSteps(ctx context.Context, testKey string) ([]TestStep, error)
}

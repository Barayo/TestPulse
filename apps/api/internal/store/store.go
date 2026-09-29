// Package store implements PostgreSQL persistence for the core domain.
// Multi-step invariants (version bumps, pinning, result+status) run inside
// transactions here; services compose these repositories.
package store

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	Projects            *ProjectRepo
	Folders             *FolderRepo
	Cases               *CaseRepo
	Suites              *SuiteRepo
	Runs                *RunRepo
	Users               *UserRepo
	UserAvatars         *UserAvatarRepo
	Sessions            *SessionRepo
	ApiTokens           *ApiTokenRepo
	Audit               *AuditRepo
	Teams               *TeamRepo
	ProjectMembers      *ProjectMemberRepo
	Roles               *RoleRepo
	Attachments         *AttachmentRepo
	InstanceSettings    *InstanceSettingsRepo
	PasswordResetTokens *PasswordResetTokenRepo
	CustomFields        *CustomFieldRepo
	OIDCTeamMappings    *OIDCTeamMappingRepo
	Tags                *TagRepo
	Releases            *ReleaseRepo
	TestPlans           *TestPlanRepo
	Search              *SearchRepo
	StepGroups          *StepGroupRepo
	Requirements        *RequirementRepo
	ImportJobs          *ImportJobRepo
	Webhooks            *WebhookRepo
	MCPIdempotencyKeys  *MCPIdempotencyKeyRepo
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{
		Projects:            &ProjectRepo{pool: pool},
		Folders:             &FolderRepo{pool: pool},
		Cases:               &CaseRepo{pool: pool},
		Suites:              &SuiteRepo{pool: pool},
		Runs:                &RunRepo{pool: pool},
		Users:               &UserRepo{pool: pool},
		UserAvatars:         &UserAvatarRepo{pool: pool},
		Sessions:            &SessionRepo{pool: pool},
		ApiTokens:           &ApiTokenRepo{pool: pool},
		Audit:               &AuditRepo{pool: pool},
		Teams:               &TeamRepo{pool: pool},
		ProjectMembers:      &ProjectMemberRepo{pool: pool},
		Roles:               &RoleRepo{pool: pool},
		Attachments:         &AttachmentRepo{pool: pool},
		InstanceSettings:    &InstanceSettingsRepo{pool: pool},
		PasswordResetTokens: &PasswordResetTokenRepo{pool: pool},
		CustomFields:        &CustomFieldRepo{pool: pool},
		OIDCTeamMappings:    &OIDCTeamMappingRepo{pool: pool},
		Tags:                &TagRepo{pool: pool},
		Releases:            &ReleaseRepo{pool: pool},
		TestPlans:           &TestPlanRepo{pool: pool},
		Search:              &SearchRepo{pool: pool},
		StepGroups:          &StepGroupRepo{pool: pool},
		Requirements:        &RequirementRepo{pool: pool},
		ImportJobs:          &ImportJobRepo{pool: pool},
		Webhooks:            &WebhookRepo{pool: pool},
		MCPIdempotencyKeys:  &MCPIdempotencyKeyRepo{pool: pool},
	}
}

// ErrNotFound is returned when a referenced entity does not exist.
var ErrNotFound = fmt.Errorf("not found")

// ErrHasChildren is returned when deleting a Release or Test Plan that
// still has dependent Test Plans/Runs (introduce-release-test-plan) — never
// silently orphans execution history.
var ErrHasChildren = fmt.Errorf("has dependent children")

// ErrJiraLinkNotSet is returned by SetJiraSync when the target case/run item
// has no jiraIssueKey set — there is no link for the cached data to describe
// (add-jira-connector).
var ErrJiraLinkNotSet = fmt.Errorf("jira issue key is not set")

// contentColumns is the shared SELECT list for test_case_versions content.
const contentColumns = "title, description, steps, expected_result, priority, tags, platform, test_type, automated, custom_fields, format, gherkin_source, parameters"

func marshalSteps(steps []domain.Step) ([]byte, error) {
	if steps == nil {
		steps = []domain.Step{}
	}
	return json.Marshal(steps)
}

// marshalCustomFields marshals a possibly-nil custom field value map to the
// same "always a JSON object, never null" shape the custom_fields column's
// NOT NULL DEFAULT '{}' expects (add-case-custom-fields).
func marshalCustomFields(fields map[string]string) ([]byte, error) {
	if fields == nil {
		fields = map[string]string{}
	}
	return json.Marshal(fields)
}

// marshalParameters marshals a possibly-nil *domain.CaseParameters to the
// parameters column's genuinely-nullable shape (add-parameterized-cases) —
// unlike custom_fields, nil here writes SQL NULL, matching the
// overwhelming majority of cases that never use this field.
func marshalParameters(params *domain.CaseParameters) ([]byte, error) {
	if params == nil {
		return nil, nil
	}
	return json.Marshal(params)
}

// claimEntityKey claims the next per-project, per-type sequential number
// from project_key_counters and formats it with the project's own key
// (add-human-readable-keys D2/D3) — e.g. format "%s-%d" for a case yields
// "LOGIN-42". Must run inside the same transaction as the entity's own
// insert: the UPDATE takes a row lock on the counter row, so concurrent
// creates in the same project serialize on it and never collide.
func claimEntityKey(ctx context.Context, tx pgx.Tx, projectID, entityType, format string) (string, error) {
	var projectKey string
	if err := tx.QueryRow(ctx, `SELECT key FROM projects WHERE id = $1`, projectID).Scan(&projectKey); err != nil {
		return "", err
	}
	var n int
	err := tx.QueryRow(ctx,
		`UPDATE project_key_counters SET next_value = next_value + 1
		 WHERE project_id = $1 AND entity_type = $2
		 RETURNING next_value - 1`, projectID, entityType,
	).Scan(&n)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(format, projectKey, n), nil
}

func scanContent(title, description *string, stepsJSON *[]byte, expected *string, priority *string, tags *[]string, platform, testType *string, automated *bool, customFieldsJSON *[]byte, format, gherkinSource *string, parametersJSON *[]byte) func() (domain.CaseContent, error) {
	return func() (domain.CaseContent, error) {
		var steps []domain.Step
		if err := json.Unmarshal(*stepsJSON, &steps); err != nil {
			return domain.CaseContent{}, fmt.Errorf("decoding steps: %w", err)
		}
		customFields := map[string]string{}
		if len(*customFieldsJSON) > 0 {
			if err := json.Unmarshal(*customFieldsJSON, &customFields); err != nil {
				return domain.CaseContent{}, fmt.Errorf("decoding custom fields: %w", err)
			}
		}
		var parameters *domain.CaseParameters
		if len(*parametersJSON) > 0 {
			parameters = &domain.CaseParameters{}
			if err := json.Unmarshal(*parametersJSON, parameters); err != nil {
				return domain.CaseContent{}, fmt.Errorf("decoding parameters: %w", err)
			}
		}
		return domain.CaseContent{
			Title:          *title,
			Description:    *description,
			Steps:          steps,
			ExpectedResult: *expected,
			Priority:       domain.Priority(*priority),
			Tags:           *tags,
			Platform:       *platform,
			TestType:       *testType,
			Automated:      *automated,
			CustomFields:   customFields,
			Format:         domain.Format(*format),
			GherkinSource:  *gherkinSource,
			Parameters:     parameters,
		}, nil
	}
}

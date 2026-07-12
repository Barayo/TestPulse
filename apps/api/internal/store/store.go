// Package store implements PostgreSQL persistence for the core domain.
// Multi-step invariants (version bumps, pinning, result+status) run inside
// transactions here; services compose these repositories.
package store

import (
	"encoding/json"
	"fmt"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	Projects *ProjectRepo
	Folders  *FolderRepo
	Cases    *CaseRepo
	Suites   *SuiteRepo
	Runs     *RunRepo
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{
		Projects: &ProjectRepo{pool: pool},
		Folders:  &FolderRepo{pool: pool},
		Cases:    &CaseRepo{pool: pool},
		Suites:   &SuiteRepo{pool: pool},
		Runs:     &RunRepo{pool: pool},
	}
}

// ErrNotFound is returned when a referenced entity does not exist.
var ErrNotFound = fmt.Errorf("not found")

// contentColumns is the shared SELECT list for test_case_versions content.
const contentColumns = "title, description, steps, expected_result, priority, tags"

func marshalSteps(steps []domain.Step) ([]byte, error) {
	if steps == nil {
		steps = []domain.Step{}
	}
	return json.Marshal(steps)
}

func scanContent(title, description *string, stepsJSON *[]byte, expected *string, priority *string, tags *[]string) func() (domain.CaseContent, error) {
	return func() (domain.CaseContent, error) {
		var steps []domain.Step
		if err := json.Unmarshal(*stepsJSON, &steps); err != nil {
			return domain.CaseContent{}, fmt.Errorf("decoding steps: %w", err)
		}
		return domain.CaseContent{
			Title:          *title,
			Description:    *description,
			Steps:          steps,
			ExpectedResult: *expected,
			Priority:       domain.Priority(*priority),
			Tags:           *tags,
		}, nil
	}
}

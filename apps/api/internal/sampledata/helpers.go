// Package sampledata holds generic content-building primitives (folders,
// cases, suites, runs with recorded verdicts) used to construct realistic
// example project content purely through the public service.Service API —
// shared between apps/cmd/seed-demo (dev-only, two dense demo projects) and
// the always-on Sample Project seeded at server startup (add-sample-project).
package sampledata

import (
	"context"
	"fmt"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// RootFolder returns projectID's root folder (the one with no parent),
// created automatically alongside the project.
func RootFolder(ctx context.Context, svc *service.Service, projectID string) (domain.Folder, error) {
	folders, err := svc.ListFolders(ctx, projectID)
	if err != nil {
		return domain.Folder{}, err
	}
	for _, f := range folders {
		if f.ParentFolderID == "" {
			return f, nil
		}
	}
	return domain.Folder{}, fmt.Errorf("project %s has no root folder", projectID)
}

// Folder creates a subfolder under parentID.
func Folder(ctx context.Context, svc *service.Service, projectID, parentID, name string) (domain.Folder, error) {
	return svc.CreateFolder(ctx, projectID, domain.NewFolder{Name: name, ParentFolderID: parentID})
}

// CaseWithSteps creates a case with the given title and steps, returning its id.
func CaseWithSteps(ctx context.Context, svc *service.Service, projectID, folderID, title string, steps []domain.Step) (string, error) {
	c, err := svc.CreateCase(ctx, projectID, folderID, domain.CaseContent{Title: title, Steps: steps})
	if err != nil {
		return "", err
	}
	return c.ID, nil
}

// Filler creates n bare cases (no steps) titled "<label> — <noun> N", useful
// for bulking out a folder without writing out each case by hand. noun lets
// callers match the surrounding content's language (e.g. "caso" for
// cmd/seed-demo's Spanish demo projects, "case" for the English Sample
// Project).
func Filler(ctx context.Context, svc *service.Service, projectID, folderID, label, noun string, n int) ([]string, error) {
	ids := make([]string, 0, n)
	for i := 1; i <= n; i++ {
		id, err := CaseWithSteps(ctx, svc, projectID, folderID, fmt.Sprintf("%s — %s %d", label, noun, i), nil)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// Suite creates a suite and adds caseIDs to it.
func Suite(ctx context.Context, svc *service.Service, projectID, name string, caseIDs []string) (domain.Suite, error) {
	s, err := svc.CreateSuite(ctx, projectID, name)
	if err != nil {
		return domain.Suite{}, err
	}
	for _, caseID := range caseIDs {
		if err := svc.AddCaseToSuite(ctx, s.ID, caseID); err != nil {
			return domain.Suite{}, err
		}
	}
	return s, nil
}

// Actors is a small pool of example authors — human and agent — cycled by
// RunWithVerdicts so recorded results attribute to varied, realistic names.
// An empty entry means "no override": RecordResult defaults the result's
// actor to the seeding caller (link-result-actor-to-identity), so both the
// default and override paths show up in the seeded data.
var Actors = []string{"", "Julia López", "Sam Okafor", "agent:qa-bot"}

// RunWithVerdicts creates a run over caseIDs and immediately records one
// result per item, cycling verdicts in order (e.g. mostly pass, a couple of
// fails) so pass-rate panels have real, varied data.
func RunWithVerdicts(ctx context.Context, svc *service.Service, projectID, name string, caseIDs []string, verdicts []domain.Verdict) error {
	r, err := svc.CreateRun(ctx, projectID, service.RunInput{Name: name, CaseIDs: caseIDs})
	if err != nil {
		return err
	}
	return recordVerdicts(ctx, svc, r.ID, caseIDs, verdicts)
}

// RunFromSuiteWithVerdicts is RunWithVerdicts, but the run is created from a
// suite (RunInput.SuiteID) instead of an explicit case list — so the suite
// itself picks up a pass rate and last-run time (rework-suites-landing-ux),
// the same "most recently created run, open or closed" semantic the suites
// index and detail page read.
func RunFromSuiteWithVerdicts(ctx context.Context, svc *service.Service, projectID, suiteID, name string, caseIDs []string, verdicts []domain.Verdict) error {
	r, err := svc.CreateRun(ctx, projectID, service.RunInput{Name: name, SuiteID: suiteID, CaseIDs: caseIDs})
	if err != nil {
		return err
	}
	return recordVerdicts(ctx, svc, r.ID, caseIDs, verdicts)
}

func recordVerdicts(ctx context.Context, svc *service.Service, runID string, caseIDs []string, verdicts []domain.Verdict) error {
	items, err := svc.RunItems(ctx, runID, "")
	if err != nil {
		return err
	}
	verdictByCase := map[string]domain.Verdict{}
	for i, caseID := range caseIDs {
		verdictByCase[caseID] = verdicts[i%len(verdicts)]
	}
	for i, item := range items {
		v := verdictByCase[item.CaseID]
		actor := Actors[i%len(Actors)]
		if _, err := svc.RecordResult(ctx, item.ID, domain.NewResult{Actor: actor, Verdict: v}); err != nil {
			return err
		}
	}
	return nil
}

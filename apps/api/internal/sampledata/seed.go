package sampledata

import (
	"context"
	"fmt"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// Seed creates the Sample Project: a populated, realistic example touching
// most of TestPulse's core capabilities — sections, classified cases,
// suites, an open run, a closed run, a JUnit-XML-imported run, and a case
// with more than one version — so a fresh instance has something real to
// look at (add-sample-project). It attributes the seeded content to the
// instance's Tenant Admin, the one user guaranteed to exist by the time
// this runs (called after BootstrapAdmin).
func Seed(ctx context.Context, svc *service.Service) error {
	admin, err := tenantAdmin(ctx, svc)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	ctx = domain.WithActor(ctx, domain.Actor{
		ID: admin.ID, Kind: domain.ActorKindUser, DisplayName: admin.Email,
		EffectiveUserID: admin.ID, IsTenantAdmin: admin.IsTenantAdmin,
	})

	p, err := svc.CreateProject(ctx, service.ProjectInput{
		Name: "Sample Project",
		Description: "A populated example project showcasing TestPulse's core " +
			"workflow: classified cases, suites, run execution, the open/closed " +
			"run lifecycle, and CI result import. Feel free to explore, edit, or " +
			"delete it.",
	})
	if err != nil {
		return fmt.Errorf("sampledata: creating project: %w", err)
	}
	if err := svc.MarkSample(ctx, p.ID); err != nil {
		return fmt.Errorf("sampledata: marking project sample: %w", err)
	}

	root, err := RootFolder(ctx, svc, p.ID)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	auth, err := Folder(ctx, svc, p.ID, root.ID, "Authentication")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	checkout, err := Folder(ctx, svc, p.ID, root.ID, "Checkout")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	login, err := svc.CreateCase(ctx, p.ID, auth.ID, domain.CaseContent{
		Title:     "User can log in with valid credentials",
		Steps:     []domain.Step{{Action: "Enter a valid email and password", Expected: "The user lands on the dashboard"}},
		Priority:  domain.PriorityHigh,
		Tags:      []string{"smoke", "auth"},
		Platform:  "web",
		TestType:  "functional",
		Automated: true,
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	badPassword, err := svc.CreateCase(ctx, p.ID, auth.ID, domain.CaseContent{
		Title:    "Login is rejected for the wrong password",
		Steps:    []domain.Step{{Action: "Enter a valid email and an incorrect password", Expected: "An error message is shown and the user stays on the login page"}},
		Priority: domain.PriorityMedium,
		Tags:     []string{"auth", "negative"},
		Platform: "web",
		TestType: "functional",
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	passwordReset, err := svc.CreateCase(ctx, p.ID, auth.ID, domain.CaseContent{
		Title:    "Password reset email is sent",
		Steps:    []domain.Step{{Action: "Request a password reset for a known email", Expected: "A reset email arrives within a minute"}},
		Priority: domain.PriorityLow,
		Tags:     []string{"auth"},
		Platform: "web",
		TestType: "functional",
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	// Edited once so version history has a real diff to show.
	passwordReset, err = svc.EditCase(ctx, passwordReset.ID, domain.CaseContent{
		Title:          passwordReset.Content.Title,
		Steps:          passwordReset.Content.Steps,
		ExpectedResult: "The email includes a link that expires after 30 minutes",
		Priority:       passwordReset.Content.Priority,
		Tags:           passwordReset.Content.Tags,
		Platform:       passwordReset.Content.Platform,
		TestType:       passwordReset.Content.TestType,
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	checkoutValid, err := svc.CreateCase(ctx, p.ID, checkout.ID, domain.CaseContent{
		Title:     "Checkout completes with a valid card",
		Steps:     []domain.Step{{Action: "Fill in a valid card and confirm the order", Expected: "The order is placed and a confirmation is shown"}},
		Priority:  domain.PriorityCritical,
		Tags:      []string{"smoke", "checkout"},
		Platform:  "mobile",
		TestType:  "e2e",
		Automated: true,
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	checkoutExpired, err := svc.CreateCase(ctx, p.ID, checkout.ID, domain.CaseContent{
		Title:    "Checkout blocks an expired card",
		Steps:    []domain.Step{{Action: "Fill in an expired card and attempt to confirm", Expected: "The order is blocked with a clear error"}},
		Priority: domain.PriorityHigh,
		Tags:     []string{"checkout", "negative"},
		Platform: "mobile",
		TestType: "e2e",
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	if _, err := Suite(ctx, svc, p.ID, "Smoke", []string{login.ID, checkoutValid.ID}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	if _, err := Suite(ctx, svc, p.ID, "Regression", []string{login.ID, badPassword.ID, passwordReset.ID, checkoutValid.ID, checkoutExpired.ID}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// Open run: mid-execution, mixed verdicts, left open.
	if err := RunWithVerdicts(ctx, svc, p.ID, "Sprint 12 execution",
		[]string{login.ID, badPassword.ID, checkoutValid.ID},
		[]domain.Verdict{domain.VerdictPass, domain.VerdictFailed, domain.VerdictPass}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// Closed run: a sealed record of a past release sign-off.
	closedRunName := "Release 1.0 sign-off"
	if err := RunWithVerdicts(ctx, svc, p.ID, closedRunName,
		[]string{login.ID, checkoutValid.ID, checkoutExpired.ID},
		[]domain.Verdict{domain.VerdictPass, domain.VerdictPass, domain.VerdictFailed}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	closedRun, err := runByName(ctx, svc, p.ID, closedRunName)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	if err := svc.CloseRun(ctx, closedRun.ID); err != nil {
		return fmt.Errorf("sampledata: closing run: %w", err)
	}

	// Imported run: shows the JUnit-XML import feature, including an
	// intentionally unmatched case key (the 207 partial-match behavior).
	report := fmt.Sprintf(`<testsuites><testsuite name="CI pipeline">`+
		`<testcase name="test_login_valid_credentials" time="0.8">`+
		`<properties>`+
		`<property name="testpulse_case_key" value="%s"/>`+
		`<property name="testpulse_platform" value="linux"/>`+
		`<property name="testpulse_version" value="1.4.0"/>`+
		`</properties>`+
		`</testcase>`+
		`<testcase name="test_checkout_valid_card" time="1.2">`+
		`<properties>`+
		`<property name="testpulse_case_key" value="%s"/>`+
		`<property name="testpulse_platform" value="linux"/>`+
		`<property name="testpulse_version" value="1.4.0"/>`+
		`</properties>`+
		`<failure message="assertion failed">stack trace</failure>`+
		`</testcase>`+
		`<testcase name="test_legacy_feature_removed_from_ui" time="0.1">`+
		`<properties>`+
		`<property name="testpulse_case_key" value="%s-999"/>`+
		`</properties>`+
		`</testcase>`+
		`</testsuite></testsuites>`, login.Key, checkoutValid.Key, p.Key)
	if _, err := svc.Import(ctx, p.ID, service.ImportInput{Format: "junit-xml", Report: report}); err != nil {
		return fmt.Errorf("sampledata: importing CI results: %w", err)
	}

	return nil
}

func tenantAdmin(ctx context.Context, svc *service.Service) (domain.User, error) {
	users, err := svc.ListUsers(ctx)
	if err != nil {
		return domain.User{}, fmt.Errorf("listing users: %w", err)
	}
	for _, u := range users {
		if u.IsTenantAdmin {
			return u, nil
		}
	}
	return domain.User{}, fmt.Errorf("no tenant admin user found to attribute seeded content to")
}

func runByName(ctx context.Context, svc *service.Service, projectID, name string) (domain.Run, error) {
	runs, err := svc.ListRuns(ctx, projectID)
	if err != nil {
		return domain.Run{}, err
	}
	for _, r := range runs {
		if r.Name == name {
			return r, nil
		}
	}
	return domain.Run{}, fmt.Errorf("no run named %q found", name)
}

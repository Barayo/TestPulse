package sampledata

import (
	"context"
	"fmt"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// Seed creates the Sample Project: a populated, realistic example touching
// most of TestPulse's core capabilities — sections, classified cases,
// suites, an open run, a closed run, a JUnit-XML-imported run, cases with
// version history, and a deliberately flaky case — so a fresh instance has
// something real to look at (add-sample-project, enrich-sample-project-content).
// It attributes the seeded content to the instance's Tenant Admin, the one
// user guaranteed to exist by the time this runs (called after BootstrapAdmin).
// samplePlaceholderPNG is a minimal, valid 1x1 PNG — a small bundled
// placeholder, not a network fetch, used to showcase a run item result's
// screenshot attachment (add-run-item-screenshot-attachments).
var samplePlaceholderPNG = []byte{
	0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
	0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
	0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
	0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
	0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
}

func Seed(ctx context.Context, svc *service.Service) error {
	admin, err := tenantAdmin(ctx, svc)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	adminActor := domain.Actor{
		ID: admin.ID, Kind: domain.ActorKindUser, DisplayName: admin.Email,
		EffectiveUserID: admin.ID, IsTenantAdmin: admin.IsTenantAdmin,
	}
	ctx = domain.WithActor(ctx, adminActor)

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
	// The Sample Project is the product's showroom (CLAUDE.md's standing
	// rule) — marking it public (enable-public-project-access) makes it
	// genuinely reachable at /projects/{key} without an account (unified
	// with the authenticated view, unify-authenticated-and-public-views),
	// and since it's the only public project on a fresh install, visiting
	// `/` with no session redirects straight to it — closing the gap where
	// docs/getting-started.md's quickstart implied a fresh visit was
	// browsable pre-login when RequireAuth actually blocked every route.
	publicAccess := true
	if _, err := svc.UpdateProject(ctx, p.ID, service.ProjectUpdate{PublicAccess: &publicAccess}); err != nil {
		return fmt.Errorf("sampledata: marking project public: %w", err)
	}

	// Real project members (link-run-item-assignee-to-identity): assignment
	// only accepts a real user or team now, so the Sample Project needs at
	// least one more real user beyond the bootstrap admin to demonstrate
	// picking between multiple real assignees at all.
	julia, err := svc.CreateUser(ctx, "julia@example.com", "correcthorse1", false)
	if err != nil {
		return fmt.Errorf("sampledata: creating demo user: %w", err)
	}
	sam, err := svc.CreateUser(ctx, "sam@example.com", "correcthorse1", false)
	if err != nil {
		return fmt.Errorf("sampledata: creating demo user: %w", err)
	}
	// A real preset avatar (not just Julia's generated initial) and a second
	// actor identity — used below to show a case version edited by someone
	// other than the Tenant Admin (link-case-version-actor-to-identity).
	juliaAvatar := "ada-lovelace"
	juliaActor := domain.Actor{
		ID: julia.ID, Kind: domain.ActorKindUser, DisplayName: "Julia",
		EffectiveUserID: julia.ID,
	}
	juliaCtx := domain.WithActor(ctx, juliaActor)
	if _, err := svc.UpdateOwnProfile(juliaCtx, juliaActor, domain.UserProfileUpdate{AvatarKey: &juliaAvatar}); err != nil {
		return fmt.Errorf("sampledata: setting demo user avatar: %w", err)
	}
	roles, err := svc.ListRoles(ctx)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	var testerRole domain.Role
	for _, role := range roles {
		if role.Name == "Tester" {
			testerRole = role
			break
		}
	}
	if testerRole.ID == "" {
		return fmt.Errorf("sampledata: default Tester role not found")
	}
	if err := svc.SetProjectMember(ctx, adminActor, p.ID, julia.ID, testerRole.ID); err != nil {
		return fmt.Errorf("sampledata: adding demo project member: %w", err)
	}
	if err := svc.SetProjectMember(ctx, adminActor, p.ID, sam.ID, testerRole.ID); err != nil {
		return fmt.Errorf("sampledata: adding demo project member: %w", err)
	}

	// Two API tokens (add-scoped-api-tokens): a full-access one (today's
	// default, unscoped) alongside one scoped to this project's read-only
	// Viewer role — the token list has a real example of each, not just a
	// theoretical scoping feature. The raw secret value is discarded; a
	// demo token has nothing real to keep secret.
	var viewerRole domain.Role
	for _, role := range roles {
		if role.Name == "Viewer" {
			viewerRole = role
			break
		}
	}
	if viewerRole.ID == "" {
		return fmt.Errorf("sampledata: default Viewer role not found")
	}
	if _, _, err := svc.CreateToken(ctx, adminActor, "ci-pipeline", nil, nil); err != nil {
		return fmt.Errorf("sampledata: creating sample API token: %w", err)
	}
	if _, _, err := svc.CreateToken(ctx, adminActor, "status-dashboard", &p.ID, &viewerRole.ID); err != nil {
		return fmt.Errorf("sampledata: creating scoped sample API token: %w", err)
	}

	// A team (add-team-deletion-preview showcase): has real members so its
	// delete-confirmation dialog on the People page shows a non-zero
	// preview, but deliberately holds no project role assignment, so
	// deleting it live during evaluation doesn't revoke anyone's access.
	qaCore, err := svc.CreateTeam(ctx, adminActor, "QA Core")
	if err != nil {
		return fmt.Errorf("sampledata: creating demo team: %w", err)
	}
	if _, err := svc.AddTeamMember(ctx, adminActor, qaCore.ID, julia.ID); err != nil {
		return fmt.Errorf("sampledata: adding demo team member: %w", err)
	}
	if _, err := svc.AddTeamMember(ctx, adminActor, qaCore.ID, sam.ID); err != nil {
		return fmt.Errorf("sampledata: adding demo team member: %w", err)
	}

	root, err := RootFolder(ctx, svc, p.ID)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// --- Sections -----------------------------------------------------

	auth, err := Folder(ctx, svc, p.ID, root.ID, "Authentication")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	checkout, err := Folder(ctx, svc, p.ID, root.ID, "Checkout")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	settings, err := Folder(ctx, svc, p.ID, root.ID, "Settings")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	notifications, err := Folder(ctx, svc, p.ID, root.ID, "Notifications")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	// Deliberately left with no cases and no subsections (rework-library-ux
	// showcase task) — the Library's "Nothing here yet" empty state has a
	// real section to demonstrate, not just a theoretical one. Created as
	// the project's 5th top-level section (not 6th) so it lands inside the
	// project landing panel's own top-N cap and shows there too
	// (enrich-project-landing-panels showcase task) — Reporting API moves to
	// 6th, which is fine since it doesn't need panel visibility.
	if _, err := Folder(ctx, svc, p.ID, root.ID, "Localization"); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	reportingAPI, err := Folder(ctx, svc, p.ID, root.ID, "Reporting API")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// --- Authentication cases ------------------------------------------

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
	// Edited once, reaching version 2 — first version-history example.
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
	sessionTimeout, err := svc.CreateCase(ctx, p.ID, auth.ID, domain.CaseContent{
		Title:    "Session expires after inactivity",
		Steps:    []domain.Step{{Action: "Leave the session idle past the timeout window", Expected: "The next action redirects to login"}},
		Priority: domain.PriorityMedium,
		Tags:     []string{"auth", "session"},
		Platform: "web",
		TestType: "functional",
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	// Edited twice, reaching version 3 — second version-history example.
	// The first edit is by Julia rather than the Tenant Admin, so the
	// Version History row demonstrates a real per-version actor (avatar +
	// name) rather than always showing the same seeding admin
	// (link-case-version-actor-to-identity).
	sessionTimeout, err = svc.EditCase(juliaCtx, sessionTimeout.ID, domain.CaseContent{
		Title:          sessionTimeout.Content.Title,
		Steps:          sessionTimeout.Content.Steps,
		ExpectedResult: "A warning appears 60 seconds before the session expires",
		Priority:       sessionTimeout.Content.Priority,
		Tags:           sessionTimeout.Content.Tags,
		Platform:       sessionTimeout.Content.Platform,
		TestType:       sessionTimeout.Content.TestType,
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	sessionTimeout, err = svc.EditCase(ctx, sessionTimeout.ID, domain.CaseContent{
		Title:          sessionTimeout.Content.Title,
		Steps:          append(sessionTimeout.Content.Steps, domain.Step{Action: "Dismiss the warning and confirm the session extends"}),
		ExpectedResult: sessionTimeout.Content.ExpectedResult,
		Priority:       sessionTimeout.Content.Priority,
		Tags:           sessionTimeout.Content.Tags,
		Platform:       sessionTimeout.Content.Platform,
		TestType:       sessionTimeout.Content.TestType,
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	twoFactor, err := svc.CreateCase(ctx, p.ID, auth.ID, domain.CaseContent{
		Title:     "Two-factor prompt is required for a new device",
		Steps:     []domain.Step{{Action: "Log in from an unrecognized device", Expected: "A one-time code is required before access is granted"}},
		Priority:  domain.PriorityHigh,
		Tags:      []string{"auth", "security"},
		Platform:  "web",
		TestType:  "functional",
		Automated: true,
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	// Authentication's own direct cases (not the Two-Factor subsection) span
	// every priority level plus both automated and manual on their own —
	// the Library's per-section critical badge/coverage meter has a real
	// section to render against, not just project-wide variety.
	if _, err := svc.CreateCase(ctx, p.ID, auth.ID, domain.CaseContent{
		Title:    "Account lockout after repeated failed logins",
		Steps:    []domain.Step{{Action: "Fail to log in 5 times in a row", Expected: "The account is temporarily locked and further attempts are rejected"}},
		Priority: domain.PriorityCritical,
		Tags:     []string{"auth", "security"},
		Platform: "web",
		TestType: "functional",
	}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	// Padded to a double-digit direct count (rework-library-ux showcase task)
	// — Authentication's case-count/coverage-meter rendering has real scale
	// to show, not just a handful of rows.
	if _, err := Filler(ctx, svc, p.ID, auth.ID, "Authentication", "case", 6); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	// A real nested subsection, so add-delete-mode's cascade-count
	// confirmation has something non-trivial to show on Authentication —
	// not just direct-child cases, but a subsection with its own case too.
	twoFactorFolder, err := Folder(ctx, svc, p.ID, auth.ID, "Two-Factor")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	if err := svc.MoveCase(ctx, twoFactor.ID, twoFactorFolder.ID); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// --- Checkout cases --------------------------------------------------

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
	if _, err := Filler(ctx, svc, p.ID, checkout.ID, "Checkout", "case", 3); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// --- Settings cases ----------------------------------------------

	displayName, err := svc.CreateCase(ctx, p.ID, settings.ID, domain.CaseContent{
		Title:    "Update profile display name",
		Steps:    []domain.Step{{Action: "Change the display name and save", Expected: "The new name appears immediately across the UI"}},
		Priority: domain.PriorityMedium,
		Tags:     []string{"settings"},
		Platform: "web",
		TestType: "functional",
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	timezone, err := svc.CreateCase(ctx, p.ID, settings.ID, domain.CaseContent{
		Title:     "Change timezone preference",
		Steps:     []domain.Step{{Action: "Select a new timezone and save", Expected: "Timestamps across the app reflect the new timezone"}},
		Priority:  domain.PriorityLow,
		Tags:      []string{"settings"},
		Platform:  "web",
		TestType:  "functional",
		Automated: true,
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	if _, err := Filler(ctx, svc, p.ID, settings.ID, "Settings", "case", 4); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// --- Notifications cases -------------------------------------------

	notifOptOut, err := svc.CreateCase(ctx, p.ID, notifications.ID, domain.CaseContent{
		Title:    "Email notification opt-out is respected",
		Steps:    []domain.Step{{Action: "Disable email notifications and trigger an event that would normally notify", Expected: "No email is sent"}},
		Priority: domain.PriorityHigh,
		Tags:     []string{"notifications", "negative"},
		Platform: "mobile",
		TestType: "regression",
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	notifPush, err := svc.CreateCase(ctx, p.ID, notifications.ID, domain.CaseContent{
		Title:     "Push notification arrives within 30 seconds",
		Steps:     []domain.Step{{Action: "Trigger a push-worthy event", Expected: "The device receives the push notification within 30 seconds"}},
		Priority:  domain.PriorityMedium,
		Tags:      []string{"notifications", "smoke"},
		Platform:  "mobile",
		TestType:  "regression",
		Automated: true,
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	if _, err := Filler(ctx, svc, p.ID, notifications.ID, "Notifications", "case", 4); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// --- Reporting API cases -------------------------------------------

	reportingList, err := svc.CreateCase(ctx, p.ID, reportingAPI.ID, domain.CaseContent{
		Title:     "GET /api/v1/reports returns paginated results",
		Steps:     []domain.Step{{Action: "Request a page of reports with a page size", Expected: "The response respects the page size and includes a next-page cursor"}},
		Priority:  domain.PriorityHigh,
		Tags:      []string{"api", "reporting"},
		Platform:  "api",
		TestType:  "api",
		Automated: true,
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	reportingExport, err := svc.CreateCase(ctx, p.ID, reportingAPI.ID, domain.CaseContent{
		Title:    "Report export respects the date range filter",
		Steps:    []domain.Step{{Action: "Export a report with a start and end date", Expected: "Only rows within that range appear in the export"}},
		Priority: domain.PriorityMedium,
		Tags:     []string{"api", "reporting"},
		Platform: "api",
		TestType: "api",
	})
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	if _, err := Filler(ctx, svc, p.ID, reportingAPI.ID, "Reporting API", "case", 3); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// --- Suites ---------------------------------------------------------

	// Smoke and API Contract are deliberately never used as a run's source
	// below — the Suites index/detail pages show a "Never run" state for a
	// suite with no runs, distinct from a fake 0% (rework-suites-landing-ux).
	if _, err := Suite(ctx, svc, p.ID, "Smoke", []string{login.ID, checkoutValid.ID, notifPush.ID, reportingList.ID}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	regressionCaseIDs := []string{
		login.ID, badPassword.ID, passwordReset.ID, checkoutValid.ID, checkoutExpired.ID,
		displayName.ID, notifOptOut.ID, reportingExport.ID,
	}
	regressionSuite, err := Suite(ctx, svc, p.ID, "Regression", regressionCaseIDs)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	nightlyCaseIDs := []string{login.ID, checkoutValid.ID, timezone.ID, notifPush.ID, reportingList.ID, twoFactor.ID}
	nightlySuite, err := Suite(ctx, svc, p.ID, "Nightly", nightlyCaseIDs)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	if _, err := Suite(ctx, svc, p.ID, "API Contract", []string{reportingList.ID, reportingExport.ID}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// --- Runs -------------------------------------------------------
	// Created in order — the LAST run created is what drives the project's
	// shown pass rate (ProjectRepo.Summaries uses only the most recent run),
	// so it's deliberately the strongest one.

	// 1. Open run, mid-sprint, mixed verdicts. One more case is added but
	// left unexecuted (`pending`) — a real candidate for keyboard-driven
	// triage (add-run-keyboard-shortcuts): opening this run and pressing a
	// verdict key on an already-executed item auto-advances straight to it.
	if err := RunWithVerdicts(ctx, svc, p.ID, "Sprint 12 execution",
		[]string{login.ID, badPassword.ID, checkoutValid.ID},
		[]domain.Verdict{domain.VerdictPass, domain.VerdictFailed, domain.VerdictPass}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	sprintRun, err := runByName(ctx, svc, p.ID, "Sprint 12 execution")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	if _, err := svc.AddRunItem(ctx, sprintRun.ID, passwordReset.ID); err != nil {
		return fmt.Errorf("sampledata: adding pending sprint item: %w", err)
	}
	// Two of the four items are assigned to different real project members,
	// two are left unassigned — real data for the assignee display, filter
	// (including Unassigned), and bulk-assign flow
	// (add-run-item-assignment-ui, link-run-item-assignee-to-identity) to
	// show against, rather than every item sharing one state.
	sprintItems, err := svc.RunItems(ctx, sprintRun.ID, "")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	for _, item := range sprintItems {
		var userID string
		switch item.CaseID {
		case login.ID:
			userID = julia.ID
		case badPassword.ID:
			userID = sam.ID
		default:
			continue
		}
		if err := svc.UpdateItem(ctx, item.ID, service.ItemUpdate{AssigneeUserID: &userID}); err != nil {
			return fmt.Errorf("sampledata: assigning sprint item: %w", err)
		}
	}

	// The failed "Login with bad password" result gets a screenshot —
	// showcases the attachment thumbnail strip/lightbox on real seeded
	// content (add-run-item-screenshot-attachments), a small bundled
	// placeholder image rather than a network fetch.
	for _, item := range sprintItems {
		if item.CaseID != badPassword.ID {
			continue
		}
		results, err := svc.Results(ctx, item.ID)
		if err != nil {
			return fmt.Errorf("sampledata: fetching results for screenshot attachment: %w", err)
		}
		if len(results) == 0 {
			break
		}
		if _, err := svc.AttachToResult(ctx, results[len(results)-1].ID, "login-failure.png", samplePlaceholderPNG); err != nil {
			return fmt.Errorf("sampledata: attaching screenshot: %w", err)
		}
	}

	// 2. Closed run: a sealed record of a past release sign-off.
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

	// 3. Closed run: a broader regression pass, mostly green. Created from
	// the Regression suite, so its card/sidebar show a real pass rate
	// (6/8 = 75%, the "in progress" amber band) instead of "Never run".
	regressionRunName := "Release 1.1 regression"
	if err := RunFromSuiteWithVerdicts(ctx, svc, p.ID, regressionSuite.ID, regressionRunName, regressionCaseIDs,
		[]domain.Verdict{
			domain.VerdictPass, domain.VerdictPass, domain.VerdictFailed, domain.VerdictPass,
			domain.VerdictPass, domain.VerdictPass, domain.VerdictFailed, domain.VerdictPass,
		}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	regressionRun, err := runByName(ctx, svc, p.ID, regressionRunName)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	if err := svc.CloseRun(ctx, regressionRun.ID); err != nil {
		return fmt.Errorf("sampledata: closing run: %w", err)
	}

	// 3.5. A second closed run of the same Regression suite: a hotfix
	// verification pass, so the run comparison view (add-run-comparison-view)
	// has real suite-linked data to demonstrate from both its entry points
	// ("Compare to previous run" on this run's page, and the explicit
	// picker). Relative to "Release 1.1 regression" above: "Login with valid
	// credentials" genuinely regresses (pass -> failed, a hotfix side
	// effect), and "Reset password" genuinely recovers (failed -> pass, the
	// fix it was meant to verify) — everything else holds steady.
	hotfixRunName := "Release 1.1.1 hotfix verification"
	if err := RunFromSuiteWithVerdicts(ctx, svc, p.ID, regressionSuite.ID, hotfixRunName, regressionCaseIDs,
		[]domain.Verdict{
			domain.VerdictFailed, domain.VerdictPass, domain.VerdictPass, domain.VerdictPass,
			domain.VerdictPass, domain.VerdictPass, domain.VerdictFailed, domain.VerdictPass,
		}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	hotfixRun, err := runByName(ctx, svc, p.ID, hotfixRunName)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	// Re-record the "Login with valid credentials" item's result (same
	// verdict as above, VerdictFailed — the narrative is unaffected) with
	// execution timing, so this run carries real duration data
	// (add-run-comparison-timing) while "Release 1.1 regression" above
	// carries none — the comparison showcase demonstrates both the real
	// duration figure and the "No timing data" state side by side, rather
	// than leaving the stat silently absent on both runs.
	hotfixItems, err := svc.RunItems(ctx, hotfixRun.ID, "")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	for _, item := range hotfixItems {
		if item.CaseID != login.ID {
			continue
		}
		start := hotfixRun.CreatedAt
		end := start.Add(4200 * time.Millisecond)
		if _, err := svc.RecordResult(ctx, item.ID, domain.NewResult{
			Actor: Actors[0], Verdict: domain.VerdictFailed, StartTime: &start, EndTime: &end,
		}); err != nil {
			return fmt.Errorf("sampledata: recording timed result: %w", err)
		}
		break
	}
	if err := svc.CloseRun(ctx, hotfixRun.ID); err != nil {
		return fmt.Errorf("sampledata: closing run: %w", err)
	}

	// 3.6. A third run of the Regression suite, deliberately left OPEN
	// (fully executed, just not yet formally closed — a real, common state,
	// not a contrived one) — the trailing point the Stability card's
	// "Open + closed" view (rework-suite-run-flow D7) needs to demonstrate
	// its hollow/dashed open-endpoint treatment against real closed-run
	// history, rather than an isolated single point on a suite with no
	// other runs. checkoutValid fails here too, reinforcing (not
	// contradicting) its established flaky story below; notifOptOut
	// recovers relative to the two runs above.
	patchRunName := "Release 1.1.2 patch verification"
	if err := RunFromSuiteWithVerdicts(ctx, svc, p.ID, regressionSuite.ID, patchRunName, regressionCaseIDs,
		[]domain.Verdict{
			domain.VerdictPass, domain.VerdictPass, domain.VerdictPass, domain.VerdictFailed,
			domain.VerdictPass, domain.VerdictPass, domain.VerdictPass, domain.VerdictPass,
		}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// 4. Open nightly run — automated cases. checkoutValid fails here,
	// deliberately, having passed in runs 1 and 2 above: same pinned
	// version, mixed verdicts, no edit in between — a genuinely flaky case.
	// Created from the Nightly suite (5/6 = 83%, "healthy" teal band) — the
	// suites index/detail pages read the latest run's pass rate regardless
	// of open/closed status, so this demonstrates that an open run still
	// gives its suite a real health signal, not just closed ones.
	if err := RunFromSuiteWithVerdicts(ctx, svc, p.ID, nightlySuite.ID, "Nightly — main",
		nightlyCaseIDs,
		[]domain.Verdict{
			domain.VerdictPass, domain.VerdictFailed, domain.VerdictPass,
			domain.VerdictPass, domain.VerdictPass, domain.VerdictPass,
		}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// 5. Imported run: shows the JUnit-XML import feature, matching several
	// cases and leaving one intentionally unmatched (the 207 partial-match
	// behavior). Named like CI's dogfood report step names its own imports
	// (collapse-duplicate-ci-runs) — the run is created closed, demonstrating
	// the fixed import behavior rather than the old
	// mislabeled-and-stuck-open bug.
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
		`</testcase>`+
		`<testcase name="test_change_timezone_preference" time="0.5">`+
		`<properties>`+
		`<property name="testpulse_case_key" value="%s"/>`+
		`<property name="testpulse_platform" value="linux"/>`+
		`<property name="testpulse_version" value="1.4.0"/>`+
		`</properties>`+
		`</testcase>`+
		`<testcase name="test_legacy_feature_removed_from_ui" time="0.1">`+
		`<properties>`+
		`<property name="testpulse_case_key" value="%s-999"/>`+
		`</properties>`+
		`</testcase>`+
		`</testsuite></testsuites>`, login.Key, checkoutValid.Key, timezone.Key, p.Key)
	if _, err := svc.Import(ctx, p.ID, service.ImportInput{
		Format: "junit-xml",
		Name:   "main @ a1b2c3d — fix(web): recenter the Confucius avatar crop for the circular mask",
		Report: report,
	}); err != nil {
		return fmt.Errorf("sampledata: importing CI results: %w", err)
	}

	// 5.5. A small, closed, low-stakes run explicitly labeled as disposable
	// (add-data-retention) — somewhere safe for a user trying the new
	// "Delete run" action to practice on, instead of being tempted to
	// delete one of the meaningful showcase runs above (the flaky-signal
	// and pass-rate demonstrations depend on those staying intact).
	// Deliberately created before, not after, the final run below — the
	// project's shown pass rate is driven by whichever run was created
	// LAST, and this one must never become that.
	// login is deliberately `blocked` (not `pass`) here — its execution
	// history is otherwise only pass/failed, and add-case-result-history's
	// Results panel needs at least one seeded case exercising a third
	// verdict color to showcase the full status vocabulary, not just
	// pass/fail. login was already flaky before this change (mixed
	// pass/failed on its one and only version), so this doesn't change
	// that signal — it only adds a color.
	scratchRunName := "Scratch run — safe to delete"
	if err := RunWithVerdicts(ctx, svc, p.ID, scratchRunName,
		[]string{login.ID}, []domain.Verdict{domain.VerdictBlocked}); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	scratchRun, err := runByName(ctx, svc, p.ID, scratchRunName)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	if err := svc.CloseRun(ctx, scratchRun.ID); err != nil {
		return fmt.Errorf("sampledata: closing scratch run: %w", err)
	}

	// 6. Final run, created last: a strong go/no-go pass across a wide set
	// of cases, so the project's health indicator (driven only by the most
	// recently created run) shows its healthy state.
	finalCaseIDs := append(append([]string{}, regressionCaseIDs...), twoFactor.ID, notifPush.ID)
	finalVerdicts := make([]domain.Verdict, len(finalCaseIDs))
	for i := range finalVerdicts {
		finalVerdicts[i] = domain.VerdictPass
	}
	finalVerdicts[2] = domain.VerdictFailed // one deliberate failure keeps it realistic, still well above 85%.
	if err := RunWithVerdicts(ctx, svc, p.ID, "Release 1.2 — go/no-go", finalCaseIDs, finalVerdicts); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	// 7. Custom fields (add-case-custom-fields): one text field and one
	// select field, with values on a few real cases — the showroom for
	// this capability. Deliberately after every run above, since setting
	// a value here creates a new case version and this project's health
	// indicator/last-run signal must keep reflecting the go/no-go run,
	// not this edit.
	automationOwner, err := svc.CreateCustomField(ctx, p.ID, "Automation Owner", domain.CustomFieldTypeText)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	component, err := svc.CreateCustomField(ctx, p.ID, "Component", domain.CustomFieldTypeSelect)
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	authOption, err := svc.AddCustomFieldOption(ctx, component.ID, "Auth")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	checkoutOption, err := svc.AddCustomFieldOption(ctx, component.ID, "Checkout")
	if err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	if _, err := svc.AddCustomFieldOption(ctx, component.ID, "Notifications"); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}

	loginContent := login.Content
	loginContent.CustomFields = map[string]string{automationOwner.ID: "Priya Shah", component.ID: authOption.ID}
	if _, err := svc.EditCase(ctx, login.ID, loginContent); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	badPasswordContent := badPassword.Content
	badPasswordContent.CustomFields = map[string]string{component.ID: authOption.ID}
	if _, err := svc.EditCase(ctx, badPassword.ID, badPasswordContent); err != nil {
		return fmt.Errorf("sampledata: %w", err)
	}
	checkoutValidContent := checkoutValid.Content
	checkoutValidContent.CustomFields = map[string]string{automationOwner.ID: "Marcus Webb", component.ID: checkoutOption.ID}
	if _, err := svc.EditCase(ctx, checkoutValid.ID, checkoutValidContent); err != nil {
		return fmt.Errorf("sampledata: %w", err)
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

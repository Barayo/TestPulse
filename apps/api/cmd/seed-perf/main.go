// Command seed-perf populates a purpose-built, large-scale fixture for the
// apps/api/perf/ k6 suite — 60 projects, 10 of which carry a run each with
// a varied, deliberately-large item count. It exists because make
// seed-demo's two illustrative projects are too small for the perf suite
// to exercise either target endpoint's actual cost-defining path (see
// improve-api-perf-test-methodology's design.md). It is dev tooling only,
// invoked through `make seed-perf`, never wired into server startup, and
// only ever touches whatever TESTPULSE_DATABASE_URL points at — same as
// cmd/seed-demo.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/Barayo/TestPulse/apps/api/internal/config"
	"github.com/Barayo/TestPulse/apps/api/internal/db"
	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/sampledata"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// ProjectCount is the total number of filler projects created — large
// enough that an accidental per-project round trip in the summaries
// aggregation query becomes visible in wall-clock terms.
const ProjectCount = 60

// RunProjectCount is how many of those projects (the first N, by name)
// also get a case-filled run — enough runs for the k6 suite to rotate
// across instead of hammering a single hot row.
const RunProjectCount = 10

// runItemCounts are the per-run item counts for Perf Load 01..10 — the
// last one (120) is deliberately past store.DefaultPageLimit (50), so a
// run-items fetch against it must page.
var runItemCounts = []int{20, 30, 40, 50, 60, 70, 80, 90, 100, 120}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "seed-perf: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connecting to database: %w", err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		return fmt.Errorf("applying migrations: %w", err)
	}

	svc := service.New(store.New(pool))

	if err := seedPerfFixture(ctx, svc); err != nil {
		return fmt.Errorf("seeding perf fixture: %w", err)
	}

	slog.Info("perf fixture created", "projects", ProjectCount, "projectsWithRuns", RunProjectCount)
	return nil
}

func seedPerfFixture(ctx context.Context, svc *service.Service) error {
	admin, err := sampledata.TenantAdmin(ctx, svc)
	if err != nil {
		return fmt.Errorf("looking up tenant admin: %w", err)
	}
	ctx = domain.WithActor(ctx, domain.Actor{
		ID: admin.ID, Kind: domain.ActorKindUser, DisplayName: admin.Email,
		EffectiveUserID: admin.ID, IsTenantAdmin: admin.IsTenantAdmin,
	})

	// Re-running this command against an already-seeded database must
	// converge, not duplicate (fix-web-perf-lighthouse-methodology D3) —
	// skip any Perf Load NN project that already exists rather than
	// creating a second copy of it.
	existing, err := svc.ListProjects(ctx)
	if err != nil {
		return fmt.Errorf("listing existing projects: %w", err)
	}
	existingNames := make(map[string]bool, len(existing))
	for _, p := range existing {
		existingNames[p.Name] = true
	}

	for i := 1; i <= ProjectCount; i++ {
		name := fmt.Sprintf("Perf Load %02d", i)
		if existingNames[name] {
			continue
		}
		p, err := svc.CreateProject(ctx, service.ProjectInput{Name: name})
		if err != nil {
			return fmt.Errorf("creating %s: %w", name, err)
		}

		root, err := sampledata.RootFolder(ctx, svc, p.ID)
		if err != nil {
			return fmt.Errorf("root folder for %s: %w", name, err)
		}

		if i > RunProjectCount {
			// Filler-only project: one case, no run — exists purely to
			// inflate project count for the summaries aggregation check.
			if _, err := sampledata.Filler(ctx, svc, p.ID, root.ID, name, "caso", 1); err != nil {
				return fmt.Errorf("filling %s: %w", name, err)
			}
			continue
		}

		n := runItemCounts[i-1]
		caseIDs, err := sampledata.Filler(ctx, svc, p.ID, root.ID, name, "caso", n)
		if err != nil {
			return fmt.Errorf("filling %s: %w", name, err)
		}
		verdicts := []domain.Verdict{domain.VerdictPass, domain.VerdictFailed, domain.VerdictSkipped}
		if err := sampledata.RunWithVerdicts(ctx, svc, p.ID, name+" — Carga", caseIDs, verdicts); err != nil {
			return fmt.Errorf("running %s: %w", name, err)
		}
	}
	return nil
}

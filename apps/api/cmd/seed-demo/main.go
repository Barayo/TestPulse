// Command seed-demo populates two realistic example projects — a mature,
// dense banking-app project and a brand-new desktop-app project — via the
// service layer, exactly like the REST API would. It is dev tooling only
// (invoked through `make seed-demo`), never wired into server startup, and
// only ever touches whatever TESTPULSE_DATABASE_URL points at (design.md D10
// of the redesign-ui change).
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/Barayo/TestPulse/apps/api/internal/config"
	"github.com/Barayo/TestPulse/apps/api/internal/db"
	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "seed-demo: %v\n", err)
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
		return fmt.Errorf("running migrations: %w", err)
	}

	svc := service.New(store.New(pool))

	if err := seedBancaMovil(ctx, svc); err != nil {
		return fmt.Errorf("seeding Banca Móvil: %w", err)
	}
	if err := seedDesktopApp(ctx, svc); err != nil {
		return fmt.Errorf("seeding Desktop App: %w", err)
	}

	slog.Info("seed data created", "projects", []string{"Banca Móvil", "Desktop App"})
	return nil
}

// --- helpers -----------------------------------------------------------

func rootFolder(ctx context.Context, svc *service.Service, projectID string) (domain.Folder, error) {
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

func folder(ctx context.Context, svc *service.Service, projectID, parentID, name string) (domain.Folder, error) {
	return svc.CreateFolder(ctx, projectID, domain.NewFolder{Name: name, ParentFolderID: parentID})
}

func caseWithSteps(ctx context.Context, svc *service.Service, projectID, folderID, title string, steps []domain.Step) (string, error) {
	c, err := svc.CreateCase(ctx, projectID, folderID, domain.CaseContent{Title: title, Steps: steps})
	if err != nil {
		return "", err
	}
	return c.ID, nil
}

func filler(ctx context.Context, svc *service.Service, projectID, folderID, label string, n int) ([]string, error) {
	ids := make([]string, 0, n)
	for i := 1; i <= n; i++ {
		id, err := caseWithSteps(ctx, svc, projectID, folderID, fmt.Sprintf("%s — caso %d", label, i), nil)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func suite(ctx context.Context, svc *service.Service, projectID, name string, caseIDs []string) (domain.Suite, error) {
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

var actors = []string{"Julia López", "Miguel Alonso", "agent:qa-bot"}

// runWithVerdicts creates a run over caseIDs and immediately records one
// result per item, cycling verdicts in order (e.g. mostly pass, a couple of
// fails) so the landing's pass-rate panels have real, varied data.
func runWithVerdicts(ctx context.Context, svc *service.Service, projectID, name string, caseIDs []string, verdicts []domain.Verdict) error {
	r, err := svc.CreateRun(ctx, projectID, service.RunInput{Name: name, CaseIDs: caseIDs})
	if err != nil {
		return err
	}
	items, err := svc.RunItems(ctx, r.ID, "")
	if err != nil {
		return err
	}
	verdictByCase := map[string]domain.Verdict{}
	for i, caseID := range caseIDs {
		verdictByCase[caseID] = verdicts[i%len(verdicts)]
	}
	for i, item := range items {
		v := verdictByCase[item.CaseID]
		actor := actors[i%len(actors)]
		if _, err := svc.RecordResult(ctx, item.ID, domain.NewResult{Actor: actor, Verdict: v}); err != nil {
			return err
		}
	}
	return nil
}

// --- Banca Móvil: dense, mature project ---------------------------------

func seedBancaMovil(ctx context.Context, svc *service.Service) error {
	p, err := svc.CreateProject(ctx, "Banca Móvil")
	if err != nil {
		return err
	}
	root, err := rootFolder(ctx, svc, p.ID)
	if err != nil {
		return err
	}

	onboarding, err := folder(ctx, svc, p.ID, root.ID, "Onboarding y KYC")
	if err != nil {
		return err
	}
	onboardingCases, err := filler(ctx, svc, p.ID, onboarding.ID, "Onboarding", 12)
	if err != nil {
		return err
	}
	idVerify, err := caseWithSteps(ctx, svc, p.ID, onboarding.ID, "Verificar documento ID", []domain.Step{
		{Action: "Subir foto del DNI/pasaporte por ambas caras", Expected: "El OCR extrae nombre y número de documento"},
		{Action: "Confirmar validación de fecha de caducidad", Expected: "Se rechaza un documento caducado"},
	})
	if err != nil {
		return err
	}
	selfieVerify, err := caseWithSteps(ctx, svc, p.ID, onboarding.ID, "Validar selfie liveness", []domain.Step{
		{Action: "Grabar vídeo corto de selfie siguiendo las instrucciones", Expected: "Se detecta prueba de vida"},
	})
	if err != nil {
		return err
	}
	onboardingCases = append(onboardingCases, idVerify, selfieVerify)

	transferencias, err := folder(ctx, svc, p.ID, root.ID, "Transferencias")
	if err != nil {
		return err
	}
	limiteDiario, err := caseWithSteps(ctx, svc, p.ID, transferencias.ID, "Límite diario de transferencia", []domain.Step{
		{Action: "Iniciar transferencia con saldo insuficiente", Expected: "El sistema bloquea el envío antes de confirmar"},
		{Action: "Confirmar el intento de envío", Expected: "Se muestra el mensaje «Fondos insuficientes»"},
	})
	if err != nil {
		return err
	}

	nacionales, err := folder(ctx, svc, p.ID, transferencias.ID, "Nacionales")
	if err != nil {
		return err
	}
	nacionalesCases, err := filler(ctx, svc, p.ID, nacionales.ID, "Nacionales", 12)
	if err != nil {
		return err
	}

	sepa, err := folder(ctx, svc, p.ID, transferencias.ID, "SEPA")
	if err != nil {
		return err
	}
	iban, err := folder(ctx, svc, p.ID, sepa.ID, "Validación IBAN")
	if err != nil {
		return err
	}
	ibanCases, err := filler(ctx, svc, p.ID, iban.ID, "Validación IBAN", 5)
	if err != nil {
		return err
	}
	recurrentes, err := folder(ctx, svc, p.ID, sepa.ID, "Recurrentes")
	if err != nil {
		return err
	}
	recurrentesCases, err := filler(ctx, svc, p.ID, recurrentes.ID, "Recurrentes", 9)
	if err != nil {
		return err
	}
	sepaCases := append(append([]string{}, ibanCases...), recurrentesCases...)

	internacionales, err := folder(ctx, svc, p.ID, transferencias.ID, "Internacionales")
	if err != nil {
		return err
	}
	if _, err := filler(ctx, svc, p.ID, internacionales.ID, "Internacionales", 6); err != nil {
		return err
	}

	pagos, err := folder(ctx, svc, p.ID, root.ID, "Pagos con tarjeta")
	if err != nil {
		return err
	}
	pagosCases, err := filler(ctx, svc, p.ID, pagos.ID, "Pagos con tarjeta", 17)
	if err != nil {
		return err
	}
	altaTarjeta, err := caseWithSteps(ctx, svc, p.ID, pagos.ID, "Alta tarjeta virtual", []domain.Step{
		{Action: "Solicitar tarjeta virtual desde el dashboard", Expected: "Se genera un número de tarjeta activo al instante"},
	})
	if err != nil {
		return err
	}
	pagosCases = append(pagosCases, altaTarjeta)

	biometria, err := folder(ctx, svc, p.ID, root.ID, "Biometría")
	if err != nil {
		return err
	}
	biometriaCases, err := filler(ctx, svc, p.ID, biometria.ID, "Biometría", 5)
	if err != nil {
		return err
	}
	biometriaCases = append(biometriaCases, selfieVerify)

	if _, err := folder(ctx, svc, p.ID, root.ID, "Sin asignar"); err != nil {
		return err
	}

	if _, err := suite(ctx, svc, p.ID, "Smoke — Release 4.2", append([]string{limiteDiario, idVerify}, onboardingCases[:10]...)); err != nil {
		return err
	}
	if _, err := suite(ctx, svc, p.ID, "Onboarding completo", onboardingCases); err != nil {
		return err
	}
	if _, err := suite(ctx, svc, p.ID, "Transferencias SEPA", sepaCases); err != nil {
		return err
	}
	if _, err := suite(ctx, svc, p.ID, "Pagos con tarjeta", pagosCases); err != nil {
		return err
	}
	if _, err := suite(ctx, svc, p.ID, "Biometría / liveness", biometriaCases); err != nil {
		return err
	}
	regresionCases := append(append(append([]string{}, nacionalesCases...), sepaCases...), pagosCases...)
	if _, err := suite(ctx, svc, p.ID, "Regresión mensual", regresionCases); err != nil {
		return err
	}
	if _, err := suite(ctx, svc, p.ID, "Cierre de cuenta", []string{}); err != nil {
		return err
	}

	smokeCases := append([]string{limiteDiario, idVerify}, onboardingCases[:10]...)
	if err := runWithVerdicts(ctx, svc, p.ID, "Smoke — Release 4.2", smokeCases,
		[]domain.Verdict{domain.VerdictPass, domain.VerdictPass, domain.VerdictPass, domain.VerdictPass,
			domain.VerdictPass, domain.VerdictPass, domain.VerdictPass, domain.VerdictPass,
			domain.VerdictPass, domain.VerdictPass, domain.VerdictFailed}); err != nil {
		return err
	}
	if err := runWithVerdicts(ctx, svc, p.ID, "Onboarding completo", onboardingCases,
		[]domain.Verdict{domain.VerdictPass}); err != nil {
		return err
	}
	if err := runWithVerdicts(ctx, svc, p.ID, "Pagos con tarjeta", pagosCases[:6],
		[]domain.Verdict{domain.VerdictPass, domain.VerdictPass, domain.VerdictFailed,
			domain.VerdictPass, domain.VerdictFailed, domain.VerdictPass}); err != nil {
		return err
	}
	if err := runWithVerdicts(ctx, svc, p.ID, "Biometría / liveness", biometriaCases[:3],
		[]domain.Verdict{domain.VerdictPass, domain.VerdictFailed, domain.VerdictFailed}); err != nil {
		return err
	}
	if err := runWithVerdicts(ctx, svc, p.ID, "Regresión mensual", regresionCases[:19],
		[]domain.Verdict{domain.VerdictPass, domain.VerdictPass, domain.VerdictPass, domain.VerdictPass,
			domain.VerdictPass, domain.VerdictPass, domain.VerdictPass, domain.VerdictPass,
			domain.VerdictPass, domain.VerdictPass, domain.VerdictPass, domain.VerdictPass,
			domain.VerdictPass, domain.VerdictPass, domain.VerdictPass, domain.VerdictPass,
			domain.VerdictFailed, domain.VerdictFailed, domain.VerdictFailed}); err != nil {
		return err
	}

	return nil
}

// --- Desktop App: brand-new project -------------------------------------

func seedDesktopApp(ctx context.Context, svc *service.Service) error {
	p, err := svc.CreateProject(ctx, "Desktop App")
	if err != nil {
		return err
	}
	root, err := rootFolder(ctx, svc, p.ID)
	if err != nil {
		return err
	}

	instalacion, err := folder(ctx, svc, p.ID, root.ID, "Instalación")
	if err != nil {
		return err
	}
	windows, err := folder(ctx, svc, p.ID, instalacion.ID, "Windows")
	if err != nil {
		return err
	}
	if _, err := filler(ctx, svc, p.ID, windows.ID, "Instalador Windows", 8); err != nil {
		return err
	}
	macos, err := folder(ctx, svc, p.ID, instalacion.ID, "macOS")
	if err != nil {
		return err
	}
	if _, err := filler(ctx, svc, p.ID, macos.ID, "Instalador macOS", 8); err != nil {
		return err
	}

	actualizacion, err := folder(ctx, svc, p.ID, root.ID, "Actualización automática")
	if err != nil {
		return err
	}
	if _, err := filler(ctx, svc, p.ID, actualizacion.ID, "Actualización automática", 4); err != nil {
		return err
	}

	// No suites, no runs yet — this is the "brand-new project" empty-state
	// case (design.md D4/D10).
	return nil
}

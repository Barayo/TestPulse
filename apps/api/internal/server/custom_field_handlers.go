package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// mountCustomFields registers the field-scoped custom field routes
// (rename/delete/deletion-preview, plus option CRUD/reorder) — the
// project-scoped list/create/order routes are mounted inline under
// /projects/{projectKey} in mountAPI, matching flaky-cases' precedent
// (add-case-custom-fields).
func mountCustomFields(r chi.Router, h *api) {
	r.Route("/custom-fields/{fieldID}", func(r chi.Router) {
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromCustomField)).Patch("/", h.renameCustomField)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromCustomField)).Delete("/", h.deleteCustomField)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromCustomField)).Get("/deletion-preview", h.customFieldDeletionPreview)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromCustomField)).Post("/options", h.addCustomFieldOption)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromCustomField)).Put("/options/order", h.reorderCustomFieldOptions)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromCustomField)).Delete("/options/{optionID}", h.removeCustomFieldOption)
	})
}

type customFieldInput struct {
	Name      string                 `json:"name"`
	FieldType domain.CustomFieldType `json:"fieldType"`
}

func (h *api) listCustomFields(w http.ResponseWriter, r *http.Request) {
	fields, err := h.svc.ListCustomFields(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusOK, fields, err)
}

func (h *api) createCustomField(w http.ResponseWriter, r *http.Request) {
	in, err := decode[customFieldInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	field, err := h.svc.CreateCustomField(r.Context(), resolvedID(r, "projectKey"), in.Name, in.FieldType)
	h.respond(w, http.StatusCreated, field, err)
}

type reorderCustomFieldsInput struct {
	FieldIDs []string `json:"fieldIds"`
}

func (h *api) reorderCustomFields(w http.ResponseWriter, r *http.Request) {
	in, err := decode[reorderCustomFieldsInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	err = h.svc.ReorderCustomFields(r.Context(), resolvedID(r, "projectKey"), in.FieldIDs)
	h.respond(w, http.StatusNoContent, nil, err)
}

type renameCustomFieldInput struct {
	Name string `json:"name"`
}

func (h *api) renameCustomField(w http.ResponseWriter, r *http.Request) {
	in, err := decode[renameCustomFieldInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	field, err := h.svc.RenameCustomField(r.Context(), chi.URLParam(r, "fieldID"), in.Name)
	h.respond(w, http.StatusOK, field, err)
}

func (h *api) deleteCustomField(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteCustomField(r.Context(), chi.URLParam(r, "fieldID"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) customFieldDeletionPreview(w http.ResponseWriter, r *http.Request) {
	fieldID := chi.URLParam(r, "fieldID")
	projectID, err := h.svc.ProjectIDForCustomField(r.Context(), fieldID)
	if err != nil {
		h.respond(w, http.StatusOK, nil, err)
		return
	}
	preview, err := h.svc.CustomFieldDeletionPreview(r.Context(), fieldID, projectID)
	h.respond(w, http.StatusOK, preview, err)
}

type customFieldOptionInput struct {
	Value string `json:"value"`
}

func (h *api) addCustomFieldOption(w http.ResponseWriter, r *http.Request) {
	in, err := decode[customFieldOptionInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	opt, err := h.svc.AddCustomFieldOption(r.Context(), chi.URLParam(r, "fieldID"), in.Value)
	h.respond(w, http.StatusCreated, opt, err)
}

func (h *api) removeCustomFieldOption(w http.ResponseWriter, r *http.Request) {
	err := h.svc.RemoveCustomFieldOption(r.Context(), chi.URLParam(r, "fieldID"), chi.URLParam(r, "optionID"))
	h.respond(w, http.StatusNoContent, nil, err)
}

type reorderCustomFieldOptionsInput struct {
	OptionIDs []string `json:"optionIds"`
}

func (h *api) reorderCustomFieldOptions(w http.ResponseWriter, r *http.Request) {
	in, err := decode[reorderCustomFieldOptionsInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	err = h.svc.ReorderCustomFieldOptions(r.Context(), chi.URLParam(r, "fieldID"), in.OptionIDs)
	h.respond(w, http.StatusNoContent, nil, err)
}

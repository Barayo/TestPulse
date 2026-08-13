-- TestPulse database schema — the single source of truth for the schema,
-- pre-1.0.0 (replace-migrations-with-schema-sql). Edited directly in place;
-- there is no per-change migration file and no immutability rule while the
-- schema is still settling. Applied once, in full, to an empty database by
-- Service (internal/db).ApplySchema — see that file for exactly how, and
-- design.md for why this is safe to do pre-1.0 (a schema/database checksum
-- mismatch fails readiness loudly, it is never silently ignored).
--
-- Generated via `pg_dump --schema-only` against a database that had every
-- migration this schema replaces applied, then hand-cleaned of pg_dump
-- boilerplate (session SET statements, ownership/privilege noise, and
-- goose's own bookkeeping table) — not manually reconstructed, so it is
-- byte-accurate to what was actually deployed.
--
-- 1.0.0 readiness: this file, and the apply-once/checksum-verify model it
-- depends on, are explicitly temporary. Before 1.0.0 ships with real
-- customer deployments to protect, the project must adopt a real
-- incremental-migration discipline again (see CLAUDE.md).

CREATE FUNCTION public.create_project_defaults() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO test_case_folders (project_id, parent_folder_id, name)
    VALUES (NEW.id, NULL, 'Root');
    INSERT INTO project_key_counters (project_id, entity_type, next_value)
    VALUES (NEW.id, 'case', 1), (NEW.id, 'run', 1), (NEW.id, 'suite', 1);
    RETURN NEW;
END;
$$;

-- --- Tables ---------------------------------------------------------------

-- schema_info: bookkeeping for ApplySchema itself, not application data —
-- one row, storing the checksum of the schema.sql that was applied.
CREATE TABLE public.schema_info (
    id boolean DEFAULT true NOT NULL,
    checksum text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schema_info_id_check CHECK (id)
);

CREATE TABLE public.api_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL,
    token_prefix text NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id uuid,
    role_id uuid,
    CONSTRAINT api_tokens_name_check CHECK ((name <> ''::text)),
    CONSTRAINT api_tokens_scope_check CHECK (((project_id IS NULL) = (role_id IS NULL)))
);

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_kind text NOT NULL,
    actor_id text NOT NULL,
    actor_name text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_log_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['user'::text, 'agent'::text])))
);

CREATE TABLE public.instance_settings (
    id boolean DEFAULT true NOT NULL,
    public_projects_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT instance_settings_id_check CHECK (id)
);

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.project_favorites (
    user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.project_key_counters (
    project_id uuid NOT NULL,
    entity_type text NOT NULL,
    next_value integer DEFAULT 1 NOT NULL,
    CONSTRAINT project_key_counters_entity_type_check CHECK ((entity_type = ANY (ARRAY['case'::text, 'run'::text, 'suite'::text])))
);

CREATE TABLE public.project_members (
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);

CREATE TABLE public.project_team_roles (
    project_id uuid NOT NULL,
    team_id uuid NOT NULL,
    role_id uuid NOT NULL
);

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    is_sample boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    public_access boolean DEFAULT false NOT NULL,
    CONSTRAINT projects_name_check CHECK ((name <> ''::text))
);

CREATE TABLE public.result_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_item_id uuid NOT NULL,
    result_id uuid,
    filename text NOT NULL,
    content_type text NOT NULL,
    image bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    rank integer DEFAULT 0 NOT NULL,
    can_read boolean DEFAULT true NOT NULL,
    can_case_create boolean DEFAULT false NOT NULL,
    can_case_edit boolean DEFAULT false NOT NULL,
    can_case_delete boolean DEFAULT false NOT NULL,
    can_section_create boolean DEFAULT false NOT NULL,
    can_section_delete boolean DEFAULT false NOT NULL,
    can_suite_create boolean DEFAULT false NOT NULL,
    can_suite_edit_membership boolean DEFAULT false NOT NULL,
    can_run_create boolean DEFAULT false NOT NULL,
    can_run_record_result boolean DEFAULT false NOT NULL,
    can_manage_project boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT roles_name_check CHECK ((name <> ''::text))
);

CREATE TABLE public.sessions (
    session_hash text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

CREATE TABLE public.suite_cases (
    suite_id uuid NOT NULL,
    case_id uuid NOT NULL
);

CREATE TABLE public.team_members (
    team_id uuid NOT NULL,
    user_id uuid NOT NULL
);

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT teams_name_check CHECK ((name <> ''::text))
);

CREATE TABLE public.test_case_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    parent_folder_id uuid,
    name text NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT test_case_folders_name_check CHECK ((name <> ''::text))
);

CREATE TABLE public.test_case_versions (
    case_id uuid NOT NULL,
    version integer NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    expected_result text DEFAULT ''::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    platform text DEFAULT ''::text NOT NULL,
    test_type text DEFAULT ''::text NOT NULL,
    automated boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_kind text DEFAULT 'unknown'::text NOT NULL,
    actor_ref_id text,
    CONSTRAINT test_case_versions_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['user'::text, 'agent'::text, 'unknown'::text]))),
    CONSTRAINT test_case_versions_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT test_case_versions_title_check CHECK ((title <> ''::text)),
    CONSTRAINT test_case_versions_version_check CHECK ((version >= 1))
);

CREATE TABLE public.test_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    project_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    current_version integer DEFAULT 1 NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.test_run_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    case_id uuid NOT NULL,
    case_version integer NOT NULL,
    current_status text DEFAULT 'pending'::text NOT NULL,
    test_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    assignee_user_id uuid,
    assignee_team_id uuid,
    CONSTRAINT test_run_items_assignee_single CHECK (((assignee_user_id IS NULL) OR (assignee_team_id IS NULL))),
    CONSTRAINT test_run_items_current_status_check CHECK ((current_status = ANY (ARRAY['pending'::text, 'pass'::text, 'failed'::text, 'skipped'::text, 'blocked'::text, 'retest'::text])))
);

CREATE TABLE public.test_run_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_item_id uuid NOT NULL,
    actor text NOT NULL,
    verdict text NOT NULL,
    comment text DEFAULT ''::text NOT NULL,
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    platform text DEFAULT ''::text NOT NULL,
    version text DEFAULT ''::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    actor_kind text DEFAULT 'unknown'::text NOT NULL,
    actor_ref_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT test_run_results_actor_check CHECK ((actor <> ''::text)),
    CONSTRAINT test_run_results_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['user'::text, 'agent'::text, 'unknown'::text]))),
    CONSTRAINT test_run_results_verdict_check CHECK ((verdict = ANY (ARRAY['pass'::text, 'failed'::text, 'skipped'::text, 'blocked'::text])))
);

CREATE TABLE public.test_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    suite_id uuid,
    CONSTRAINT test_runs_name_check CHECK ((name <> ''::text)),
    CONSTRAINT test_runs_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);

CREATE TABLE public.test_suites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT test_suites_name_check CHECK ((name <> ''::text))
);

CREATE TABLE public.user_avatars (
    user_id uuid NOT NULL,
    image bytea NOT NULL,
    content_type text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    is_tenant_admin boolean DEFAULT false NOT NULL,
    deactivated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    display_name text,
    avatar_key text,
    timezone text,
    CONSTRAINT users_email_check CHECK ((email <> ''::text))
);

-- --- Primary keys / unique constraints -------------------------------------

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.instance_settings
    ADD CONSTRAINT instance_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY public.project_favorites
    ADD CONSTRAINT project_favorites_pkey PRIMARY KEY (user_id, project_id);

ALTER TABLE ONLY public.project_key_counters
    ADD CONSTRAINT project_key_counters_pkey PRIMARY KEY (project_id, entity_type);

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_pkey PRIMARY KEY (project_id, user_id);

ALTER TABLE ONLY public.project_team_roles
    ADD CONSTRAINT project_team_roles_pkey PRIMARY KEY (project_id, team_id);

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_key_key UNIQUE (key);

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.result_attachments
    ADD CONSTRAINT result_attachments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (session_hash);

ALTER TABLE ONLY public.suite_cases
    ADD CONSTRAINT suite_cases_pkey PRIMARY KEY (suite_id, case_id);

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (team_id, user_id);

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.test_case_folders
    ADD CONSTRAINT test_case_folders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.test_case_versions
    ADD CONSTRAINT test_case_versions_pkey PRIMARY KEY (case_id, version);

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT test_cases_key_key UNIQUE (key);

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT test_cases_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.test_run_items
    ADD CONSTRAINT test_run_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.test_run_items
    ADD CONSTRAINT test_run_items_run_id_case_id_key UNIQUE (run_id, case_id);

ALTER TABLE ONLY public.test_run_results
    ADD CONSTRAINT test_run_results_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT test_runs_key_key UNIQUE (key);

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT test_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.test_suites
    ADD CONSTRAINT test_suites_key_key UNIQUE (key);

ALTER TABLE ONLY public.test_suites
    ADD CONSTRAINT test_suites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_avatars
    ADD CONSTRAINT user_avatars_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- --- Indexes ----------------------------------------------------------------

CREATE INDEX api_tokens_created_by_idx ON public.api_tokens USING btree (created_by);

CREATE INDEX audit_log_entity_idx ON public.audit_log USING btree (entity_type, entity_id, occurred_at);

CREATE INDEX password_reset_tokens_user_idx ON public.password_reset_tokens USING btree (user_id);

CREATE INDEX result_attachments_result_id_idx ON public.result_attachments USING btree (result_id);

CREATE INDEX result_attachments_run_item_id_idx ON public.result_attachments USING btree (run_item_id) WHERE (result_id IS NULL);

CREATE INDEX sessions_user_idx ON public.sessions USING btree (user_id);

CREATE UNIQUE INDEX test_case_folders_one_root_idx ON public.test_case_folders USING btree (project_id) WHERE (parent_folder_id IS NULL);

CREATE INDEX test_case_folders_parent_idx ON public.test_case_folders USING btree (parent_folder_id) WHERE (NOT deleted);

CREATE INDEX test_case_folders_project_idx ON public.test_case_folders USING btree (project_id) WHERE (NOT deleted);

CREATE INDEX test_cases_folder_idx ON public.test_cases USING btree (folder_id) WHERE (NOT deleted);

CREATE INDEX test_cases_project_idx ON public.test_cases USING btree (project_id) WHERE (NOT deleted);

CREATE INDEX test_run_items_case_version_idx ON public.test_run_items USING btree (case_id, case_version);

CREATE INDEX test_run_items_run_idx ON public.test_run_items USING btree (run_id);

CREATE INDEX test_run_results_item_idx ON public.test_run_results USING btree (run_item_id, created_at);

CREATE INDEX test_runs_project_idx ON public.test_runs USING btree (project_id);

CREATE INDEX test_suites_project_idx ON public.test_suites USING btree (project_id);

-- --- Triggers -----------------------------------------------------------

CREATE TRIGGER projects_create_defaults AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.create_project_defaults();

-- --- Foreign keys -----------------------------------------------------------

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_favorites
    ADD CONSTRAINT project_favorites_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_favorites
    ADD CONSTRAINT project_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_key_counters
    ADD CONSTRAINT project_key_counters_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_team_roles
    ADD CONSTRAINT project_team_roles_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_team_roles
    ADD CONSTRAINT project_team_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_team_roles
    ADD CONSTRAINT project_team_roles_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.result_attachments
    ADD CONSTRAINT result_attachments_result_id_fkey FOREIGN KEY (result_id) REFERENCES public.test_run_results(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.result_attachments
    ADD CONSTRAINT result_attachments_run_item_id_fkey FOREIGN KEY (run_item_id) REFERENCES public.test_run_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.suite_cases
    ADD CONSTRAINT suite_cases_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.test_cases(id);

ALTER TABLE ONLY public.suite_cases
    ADD CONSTRAINT suite_cases_suite_id_fkey FOREIGN KEY (suite_id) REFERENCES public.test_suites(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.test_case_folders
    ADD CONSTRAINT test_case_folders_parent_folder_id_fkey FOREIGN KEY (parent_folder_id) REFERENCES public.test_case_folders(id);

ALTER TABLE ONLY public.test_case_folders
    ADD CONSTRAINT test_case_folders_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);

ALTER TABLE ONLY public.test_case_versions
    ADD CONSTRAINT test_case_versions_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.test_cases(id);

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT test_cases_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.test_case_folders(id);

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT test_cases_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);

ALTER TABLE ONLY public.test_run_items
    ADD CONSTRAINT test_run_items_assignee_team_id_fkey FOREIGN KEY (assignee_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.test_run_items
    ADD CONSTRAINT test_run_items_assignee_user_id_fkey FOREIGN KEY (assignee_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.test_run_items
    ADD CONSTRAINT test_run_items_case_id_case_version_fkey FOREIGN KEY (case_id, case_version) REFERENCES public.test_case_versions(case_id, version);

ALTER TABLE ONLY public.test_run_items
    ADD CONSTRAINT test_run_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.test_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.test_run_results
    ADD CONSTRAINT test_run_results_run_item_id_fkey FOREIGN KEY (run_item_id) REFERENCES public.test_run_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT test_runs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT test_runs_suite_id_fkey FOREIGN KEY (suite_id) REFERENCES public.test_suites(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.test_suites
    ADD CONSTRAINT test_suites_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);

ALTER TABLE ONLY public.user_avatars
    ADD CONSTRAINT user_avatars_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- --- Seed data ---------------------------------------------------------
-- pg_dump --schema-only excludes table data by design, so the seed
-- INSERTs the old migrations carried inline (00011, 00003, 00013) have to
-- be reproduced explicitly here — not something pg_dump could verify for
-- us. `schema_info` is NOT seeded here: its row is inserted by
-- ApplySchema itself, since the checksum it stores is only known at
-- runtime.

INSERT INTO public.instance_settings (id) VALUES (true);

-- Seeded defaults reproduce the four fixed roles' net permissions exactly
-- (design.md D11/D2 of add-project-rbac / add-scoped-api-tokens) — an
-- instance that never opens the Roles admin page sees identical behavior
-- to before those flags existed.
INSERT INTO public.roles (
    name, rank, can_read, can_case_create, can_case_edit, can_case_delete,
    can_section_create, can_section_delete, can_suite_create,
    can_suite_edit_membership, can_run_create, can_run_record_result, can_manage_project
) VALUES
    ('Viewer',        0, true, false, false, false, false, false, false, false, false, false, false),
    ('Tester',        1, true, false, false, false, false, false, false, false, true,  true,  false),
    ('Contributor',   2, true, true,  true,  false, true,  false, true,  true,  true,  true,  false),
    ('Project Admin', 3, true, true,  true,  true,  true,  true,  true,  true,  true,  true,  true);

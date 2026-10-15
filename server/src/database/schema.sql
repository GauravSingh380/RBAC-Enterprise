-- =====================================================================
--  TEAM-FLEX  —  DATABASE SCHEMA + MASTER DATA   (multi-tenant, v2)
-- ---------------------------------------------------------------------
--  Single source of truth for every table and every master/seed row.
--  The whole file is idempotent: safe to run again and again
--  (npm run db:init). It never deletes business data.
--
--  MULTI-TENANCY MODEL  (shared database, shared tables)
--    * organizations          = tenants (customers). Every business row
--                               carries organization_id.
--    * users                  = GLOBAL accounts (one login per person).
--    * organization_members   = which users belong to which organization.
--    * member_roles           = a member's roles INSIDE one organization.
--    * role_templates         = the BLUEPRINT roles (owner, admin, qa, ...). Master data,
--                               never assigned to anyone. Copied into every new organization.
--    * roles                  = the real roles of each organization (organization_id always set).
--                               Each organization owns its copy, so it can change permissions
--                               or add custom roles without affecting other organizations.
--    * users.is_platform_admin = the product owner level ("Platform"),
--                               above all organizations.
--
--  Sections
--    1. Tables
--    2. Upgrade columns   (v1 single-tenant -> v2 multi-tenant, no-op on fresh DBs)
--    3. Indexes & tenant-integrity constraints
--    4. Master data       (permissions, role templates, menus, public content)
--    5. Data migration    (v1 -> v2, runs once, only if the old user_roles table exists)
--
--  Conventions
--    * Permission name = <module>.<action>, e.g. users.read (organization scope)
--    * Seeds use ON CONFLICT DO NOTHING / WHERE NOT EXISTS, so edits made from the UI
--      are never overwritten by a re-run.
--    * Every NEW business table (projects, bugs, sprints, ...) must have:
--        organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
--      and an index starting with organization_id.
-- =====================================================================


-- =====================================================================
-- 0. EXTENSIONS
-- =====================================================================

-- trigram similarity: "possible duplicates" when someone files a bug (trusted extension, PostgreSQL 13+)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- lets an EXCLUDE constraint combine "same user" (=) with "overlapping dates" (&&): no double-booked leave
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- Global user accounts
CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  email             VARCHAR(255) NOT NULL UNIQUE,     -- always stored lowercase
  password_hash     VARCHAR(255) NOT NULL,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE, -- FALSE = account disabled platform-wide
  is_platform_admin BOOLEAN      NOT NULL DEFAULT FALSE,-- product owner / platform staff
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Tenants
CREATE TABLE IF NOT EXISTS organizations (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(60)  NOT NULL UNIQUE,            -- URL-friendly id, e.g. "acme-inc"
  status      VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  plan        VARCHAR(30)  NOT NULL DEFAULT 'free',    -- free / pro / enterprise (billing later)
  created_by  INT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,           -- e.g. users.read
  module      VARCHAR(50)  NOT NULL,                  -- grouping in the UI, e.g. users
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Blueprint roles copied into every new organization (master data, see section 4.2)
CREATE TABLE IF NOT EXISTS role_templates (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(50)  NOT NULL UNIQUE,          -- e.g. owner, admin
  display_name VARCHAR(100) NOT NULL,
  description  TEXT,
  sort_order   INT          NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS role_template_permissions (
  template_id   INT NOT NULL REFERENCES role_templates(id) ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES permissions(id)    ON DELETE CASCADE,
  PRIMARY KEY (template_id, permission_id)
);

-- The real roles of each organization (a copy of every template + custom roles)
CREATE TABLE IF NOT EXISTS roles (
  id              SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(50)  NOT NULL,              -- slug used in code, unique per organization
  display_name    VARCHAR(100) NOT NULL,
  description     TEXT,
  is_system       BOOLEAN      NOT NULL DEFAULT FALSE,-- copied from a template: cannot be deleted
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Which users belong to which organization
CREATE TABLE IF NOT EXISTS organization_members (
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         INT NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  invited_by      INT REFERENCES users(id) ON DELETE SET NULL,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

-- A member's roles inside one organization
CREATE TABLE IF NOT EXISTS member_roles (
  organization_id INT NOT NULL,
  user_id         INT NOT NULL,
  role_id         INT NOT NULL,
  assigned_by     INT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id, role_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_members(organization_id, user_id) ON DELETE CASCADE
  -- role must belong to the SAME organization: see constraint fk_member_roles_role_same_org (section 3)
);

-- Invite someone (by email) to join an organization with a role
CREATE TABLE IF NOT EXISTS invitations (
  id              SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  role_id         INT NOT NULL,
  token_hash      CHAR(64)     NOT NULL UNIQUE,       -- only the SHA-256 of the link token is stored
  invited_by      INT REFERENCES users(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ  NOT NULL,
  accepted_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Opaque refresh tokens (only the SHA-256 hash is stored)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  CHAR(64)     NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  revoked_at  TIMESTAMPTZ,
  user_agent  VARCHAR(255),
  ip_address  VARCHAR(64),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Sidebar menu (product-level, managed by the platform admin).
--   scope 'organization' : shown inside an organization, filtered by permission_id
--   scope 'platform'     : shown only to platform admins
--   path NULL            : group heading
CREATE TABLE IF NOT EXISTS menus (
  id            SERIAL PRIMARY KEY,
  key           VARCHAR(50)  NOT NULL UNIQUE,
  label         VARCHAR(100) NOT NULL,
  path          VARCHAR(200),
  icon          VARCHAR(50),
  scope         VARCHAR(20)  NOT NULL DEFAULT 'organization' CHECK (scope IN ('organization', 'platform')),
  parent_id     INT REFERENCES menus(id) ON DELETE CASCADE,
  permission_id INT REFERENCES permissions(id) ON DELETE SET NULL,
  sort_order    INT          NOT NULL DEFAULT 0,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Editable content. organization_id NULL = public/platform content (home page),
-- otherwise per-organization content (dashboard announcement).
CREATE TABLE IF NOT EXISTS site_content (
  id              SERIAL PRIMARY KEY,
  organization_id INT REFERENCES organizations(id) ON DELETE CASCADE,
  key             VARCHAR(50) NOT NULL,
  content         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_by      INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  organization_id INT REFERENCES organizations(id) ON DELETE SET NULL, -- NULL = platform/auth event
  user_id         INT REFERENCES users(id) ON DELETE SET NULL,         -- who did it (NULL = anonymous)
  action          VARCHAR(100) NOT NULL,                               -- e.g. member.roles_update
  entity          VARCHAR(50),
  entity_id       VARCHAR(50),
  details         JSONB,
  ip_address      VARCHAR(64),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------
-- 1b. PLATFORM SERVICES  (migrations, background jobs, email, password reset)
-- ---------------------------------------------------------------------

-- One-time migration scripts in database/migrations/*.sql that have been applied
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    VARCHAR(255) PRIMARY KEY,                -- file name, e.g. 0001_project_permissions.sql
  checksum   CHAR(64)     NOT NULL,                   -- SHA-256 of the file (detects edited migrations)
  applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Background job queue (worker polls with FOR UPDATE SKIP LOCKED)
CREATE TABLE IF NOT EXISTS jobs (
  id              BIGSERIAL PRIMARY KEY,
  queue           VARCHAR(100) NOT NULL,              -- e.g. email.send
  payload         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts        INT          NOT NULL DEFAULT 0,
  max_attempts    INT          NOT NULL DEFAULT 5,
  run_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(), -- not before (used for retries with backoff)
  locked_at       TIMESTAMPTZ,
  locked_by       VARCHAR(100),                       -- worker id
  last_error      TEXT,
  organization_id INT REFERENCES organizations(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- Recurring jobs ("every day at 08:00"): the worker enqueues a job when next_run_at has passed.
-- Several servers can run the worker — the conditional UPDATE lets exactly one of them win each run.
CREATE TABLE IF NOT EXISTS job_schedules (
  name             VARCHAR(100) PRIMARY KEY,
  queue            VARCHAR(100) NOT NULL,              -- job queue to enqueue
  interval_seconds INT          NOT NULL CHECK (interval_seconds >= 60),
  next_run_at      TIMESTAMPTZ  NOT NULL,
  last_run_at      TIMESTAMPTZ,
  enabled          BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Every email the platform sends (also the local "Mailbox" in development)
CREATE TABLE IF NOT EXISTS email_messages (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     INT REFERENCES organizations(id) ON DELETE SET NULL,
  to_address          VARCHAR(255) NOT NULL,
  subject             VARCHAR(255) NOT NULL,
  template            VARCHAR(50)  NOT NULL,          -- e.g. password-reset
  html                TEXT,                           -- cleared after sending in production
  text                TEXT,
  status              VARCHAR(20)  NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  driver              VARCHAR(20),                    -- outbox / ethereal / smtp
  provider_message_id VARCHAR(255),
  preview_url         TEXT,                           -- ethereal web preview
  error               TEXT,
  attempts            INT          NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  sent_at             TIMESTAMPTZ
);

-- "Forgot password" links (only the SHA-256 of the token is stored, single use)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  CHAR(64)    NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  ip_address  VARCHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------
-- 1c. PROJECTS & WORK ITEMS  (every row carries organization_id; composite
--     foreign keys guarantee rows can only point to rows of the SAME organization)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             VARCHAR(10)  NOT NULL CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'), -- prefix of item numbers: TF-123
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  icon            VARCHAR(50),
  color           VARCHAR(20),
  lead_id         INT,
  visibility      VARCHAR(20)  NOT NULL DEFAULT 'organization' CHECK (visibility IN ('private', 'organization')),
  status          VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  template        VARCHAR(30)  NOT NULL DEFAULT 'kanban',
  item_counter    INT          NOT NULL DEFAULT 0,    -- last issued item number in this project
  test_case_counter INT        NOT NULL DEFAULT 0,    -- last issued test case number (TC-1, TC-2 ...)
  -- QA verification flow (bugs): "ready for QA" status → QA passes (→ passed status) or fails (→ failed status).
  -- Foreign keys to project_statuses are added in section 2 (that table is created after this one).
  qa_ready_status_id  INT,
  qa_passed_status_id INT,
  qa_failed_status_id INT,
  created_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  archived_at     TIMESTAMPTZ,
  UNIQUE (organization_id, key),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id, lead_id) REFERENCES organization_members (organization_id, user_id) ON DELETE SET NULL (lead_id)
);

-- Project-level roles on top of organization roles
CREATE TABLE IF NOT EXISTS project_members (
  project_id      INT         NOT NULL,
  organization_id INT         NOT NULL,
  user_id         INT         NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  added_by        INT REFERENCES users(id) ON DELETE SET NULL,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE,
  -- removed from the organization => removed from its projects
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_members (organization_id, user_id) ON DELETE CASCADE
);

-- Workflow: the statuses of a project, in board order
CREATE TABLE IF NOT EXISTS project_statuses (
  id               SERIAL PRIMARY KEY,
  organization_id  INT         NOT NULL,
  project_id       INT         NOT NULL,
  name             VARCHAR(50) NOT NULL,
  category         VARCHAR(20) NOT NULL CHECK (category IN ('todo', 'in_progress', 'done')),
  color            VARCHAR(20) NOT NULL DEFAULT '#8c8c8c',
  position         INT         NOT NULL DEFAULT 0,
  -- organization role names allowed to move an item INTO this status (empty = anyone who can edit)
  restricted_roles TEXT[]      NOT NULL DEFAULT '{}',
  wip_limit        INT         CHECK (wip_limit > 0), -- board: warn when a column holds more items
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, project_id),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_labels (
  id              SERIAL PRIMARY KEY,
  organization_id INT         NOT NULL,
  project_id      INT         NOT NULL,
  name            VARCHAR(50) NOT NULL,
  color           VARCHAR(20) NOT NULL DEFAULT 'blue',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, project_id),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE
);

-- Custom fields defined per project; values live in work_items.custom_fields (JSONB, keyed by field id)
CREATE TABLE IF NOT EXISTS project_custom_fields (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL,
  project_id      INT          NOT NULL,
  name            VARCHAR(100) NOT NULL,
  field_type      VARCHAR(20)  NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'select', 'multi_select', 'checkbox')),
  options         TEXT[]       NOT NULL DEFAULT '{}', -- for select / multi_select
  required        BOOLEAN      NOT NULL DEFAULT FALSE,
  position        INT          NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE
);

-- Sprints (time-boxed iterations): planned → active → completed. One active sprint per project.
CREATE TABLE IF NOT EXISTS sprints (
  id               SERIAL PRIMARY KEY,
  organization_id  INT          NOT NULL,
  project_id       INT          NOT NULL,
  name             VARCHAR(100) NOT NULL,
  goal             TEXT,
  status           VARCHAR(20)  NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  start_date       DATE,
  end_date         DATE,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  -- snapshots for velocity: scope when the sprint started / what was done when it ended
  committed_points NUMERIC(8,1),
  committed_count  INT,
  completed_points NUMERIC(8,1),
  completed_count  INT,
  created_by       INT REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  UNIQUE (id, project_id),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE
);

-- Saved filter sets ("views") for the list / board / backlog of a project
CREATE TABLE IF NOT EXISTS saved_views (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL,
  project_id      INT          NOT NULL,
  owner_id        INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  view_type       VARCHAR(20)  NOT NULL CHECK (view_type IN ('list', 'board')),
  filters         JSONB        NOT NULL DEFAULT '{}'::jsonb, -- the URL query of the view, e.g. {"types":"bug","assignees":"me"}
  is_shared       BOOLEAN      NOT NULL DEFAULT FALSE,       -- visible to everyone who can see the project
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE
);

-- One table for every kind of work: epic > story / task / bug > subtask
CREATE TABLE IF NOT EXISTS work_items (
  id                 SERIAL PRIMARY KEY,
  organization_id    INT          NOT NULL,
  project_id         INT          NOT NULL,
  number             INT          NOT NULL,           -- TF-<number>, sequential per project
  type               VARCHAR(20)  NOT NULL CHECK (type IN ('epic', 'story', 'task', 'bug', 'subtask')),
  title              VARCHAR(500) NOT NULL,
  description        TEXT,                            -- markdown
  status_id          INT          NOT NULL,
  priority           VARCHAR(10)  NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low', 'none')),
  severity           VARCHAR(10)  CHECK (severity IN ('critical', 'major', 'minor', 'trivial')), -- bugs: impact
  assignee_id        INT,
  reporter_id        INT REFERENCES users(id) ON DELETE SET NULL,
  parent_id          INT,
  sprint_id          INT,                             -- NULL = backlog
  due_date           DATE,
  estimate           NUMERIC(6,1) CHECK (estimate >= 0), -- story points or hours
  -- bug details
  environment        VARCHAR(255),
  steps_to_reproduce TEXT,
  expected_result    TEXT,
  actual_result      TEXT,
  browser            VARCHAR(100),                    -- e.g. Chrome 128
  os                 VARCHAR(100),                    -- e.g. Windows 11
  found_in_version   VARCHAR(50),                     -- release / build where it was found
  fixed_in_version   VARCHAR(50),                     -- release / build that contains the fix
  resolution         VARCHAR(20)  CHECK (resolution IN ('fixed', 'duplicate', 'wont_fix', 'cannot_reproduce', 'by_design')),
  reopen_count       INT          NOT NULL DEFAULT 0, -- times QA sent it back (quality signal)
  custom_fields      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  rank               DOUBLE PRECISION NOT NULL DEFAULT 0, -- ordering inside a status (boards)
  completed_at       TIMESTAMPTZ,                     -- set when moved to a "done" status
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  search_vector      TSVECTOR GENERATED ALWAYS AS (
                       setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                       setweight(to_tsvector('simple', coalesce(description, '')), 'B')
                     ) STORED,
  UNIQUE (project_id, number),
  UNIQUE (id, project_id),
  UNIQUE (id, organization_id),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (status_id, project_id)       REFERENCES project_statuses (id, project_id),
  FOREIGN KEY (parent_id, project_id)       REFERENCES work_items (id, project_id) ON DELETE SET NULL (parent_id),
  FOREIGN KEY (organization_id, assignee_id) REFERENCES organization_members (organization_id, user_id) ON DELETE SET NULL (assignee_id),
  -- a sprint of the SAME project; deleting a sprint sends its items back to the backlog
  CONSTRAINT fk_work_items_sprint FOREIGN KEY (sprint_id, project_id) REFERENCES sprints (id, project_id) ON DELETE SET NULL (sprint_id)
);

CREATE TABLE IF NOT EXISTS work_item_labels (
  work_item_id INT NOT NULL,
  label_id     INT NOT NULL,
  project_id   INT NOT NULL,
  PRIMARY KEY (work_item_id, label_id),
  FOREIGN KEY (work_item_id, project_id) REFERENCES work_items (id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (label_id, project_id)     REFERENCES project_labels (id, project_id) ON DELETE CASCADE
);

-- blocks / duplicates / relates_to (can cross projects inside one organization)
CREATE TABLE IF NOT EXISTS work_item_links (
  id              SERIAL PRIMARY KEY,
  organization_id INT         NOT NULL,
  source_id       INT         NOT NULL,
  target_id       INT         NOT NULL,
  link_type       VARCHAR(20) NOT NULL CHECK (link_type IN ('blocks', 'duplicates', 'relates_to')),
  created_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_id <> target_id),
  UNIQUE (source_id, target_id, link_type),
  FOREIGN KEY (source_id, organization_id) REFERENCES work_items (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (target_id, organization_id) REFERENCES work_items (id, organization_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS work_item_comments (
  id              SERIAL PRIMARY KEY,
  organization_id INT         NOT NULL,
  work_item_id    INT         NOT NULL,
  author_id       INT REFERENCES users(id) ON DELETE SET NULL,
  body            TEXT        NOT NULL,              -- markdown; mentions as @[Name](user:12)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at       TIMESTAMPTZ,
  FOREIGN KEY (work_item_id, organization_id) REFERENCES work_items (id, organization_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comment_mentions (
  comment_id INT NOT NULL REFERENCES work_item_comments(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS comment_reactions (
  comment_id INT         NOT NULL REFERENCES work_item_comments(id) ON DELETE CASCADE,
  user_id    INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS work_item_watchers (
  work_item_id    INT         NOT NULL,
  organization_id INT         NOT NULL,
  user_id         INT         NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (work_item_id, user_id),
  FOREIGN KEY (work_item_id, organization_id) REFERENCES work_items (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_members (organization_id, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS work_item_attachments (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL,
  work_item_id    INT          NOT NULL,
  uploaded_by     INT REFERENCES users(id) ON DELETE SET NULL,
  file_name       VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(150) NOT NULL,
  size_bytes      BIGINT       NOT NULL,
  storage_key     VARCHAR(255) NOT NULL UNIQUE,       -- path inside the storage (local disk / S3 later)
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  FOREIGN KEY (work_item_id, organization_id) REFERENCES work_items (id, organization_id) ON DELETE CASCADE
);

-- Activity history: one row per change. Powers the History tab, reports and (later) AI.
CREATE TABLE IF NOT EXISTS work_item_events (
  id              BIGSERIAL PRIMARY KEY,
  organization_id INT         NOT NULL,
  work_item_id    INT         NOT NULL,
  actor_id        INT REFERENCES users(id) ON DELETE SET NULL,
  event_type      VARCHAR(40) NOT NULL,              -- created, updated, commented, attachment_added, link_added, ...
  field           VARCHAR(50),                       -- for "updated": which field
  old_value       JSONB,
  new_value       JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (work_item_id, organization_id) REFERENCES work_items (id, organization_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 1d. QA — TEST CASES & TEST RUNS
-- ---------------------------------------------------------------------

-- Folders for test cases ("Login", "Checkout", ...)
CREATE TABLE IF NOT EXISTS test_suites (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL,
  project_id      INT          NOT NULL,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  position        INT          NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name),
  UNIQUE (id, project_id),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE
);

-- A reusable check: preconditions + numbered steps, each with an expected result
CREATE TABLE IF NOT EXISTS test_cases (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL,
  project_id      INT          NOT NULL,
  number          INT          NOT NULL,              -- shown as TC-<number>
  suite_id        INT,
  title           VARCHAR(500) NOT NULL,
  preconditions   TEXT,
  steps           JSONB        NOT NULL DEFAULT '[]'::jsonb, -- [{"action": "Open /login", "expected": "Form is shown"}, ...]
  priority        VARCHAR(10)  NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  case_type       VARCHAR(20)  NOT NULL DEFAULT 'functional'
                  CHECK (case_type IN ('functional', 'regression', 'smoke', 'integration', 'performance', 'security', 'usability', 'other')),
  status          VARCHAR(20)  NOT NULL DEFAULT 'ready' CHECK (status IN ('draft', 'ready', 'deprecated')),
  work_item_id    INT,                                -- the story / requirement this case covers
  created_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  search_vector   TSVECTOR GENERATED ALWAYS AS (
                    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                    setweight(to_tsvector('simple', coalesce(preconditions, '')), 'B')
                  ) STORED,
  UNIQUE (project_id, number),
  UNIQUE (id, project_id),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (suite_id, project_id)     REFERENCES test_suites (id, project_id) ON DELETE SET NULL (suite_id),
  FOREIGN KEY (work_item_id, project_id) REFERENCES work_items (id, project_id) ON DELETE SET NULL (work_item_id)
);

-- One execution of a set of test cases (e.g. "Release 2.4 regression", optionally tied to a sprint)
CREATE TABLE IF NOT EXISTS test_runs (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL,
  project_id      INT          NOT NULL,
  name            VARCHAR(150) NOT NULL,
  description     TEXT,
  sprint_id       INT,
  environment     VARCHAR(255),                       -- copied into bugs filed from this run
  build_version   VARCHAR(50),
  status          VARCHAR(20)  NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  created_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  UNIQUE (id, project_id),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (sprint_id, project_id) REFERENCES sprints (id, project_id) ON DELETE SET NULL (sprint_id)
);

-- The result of one test case in one run. The case is SNAPSHOTTED (title / steps) when the run is
-- created, so editing or deleting the case later never changes what was actually tested.
CREATE TABLE IF NOT EXISTS test_results (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL,
  project_id      INT          NOT NULL,
  run_id          INT          NOT NULL,
  test_case_id    INT,
  case_number     INT          NOT NULL,
  title           VARCHAR(500) NOT NULL,
  preconditions   TEXT,
  steps           JSONB        NOT NULL DEFAULT '[]'::jsonb,
  position        INT          NOT NULL DEFAULT 0,
  status          VARCHAR(20)  NOT NULL DEFAULT 'untested' CHECK (status IN ('untested', 'passed', 'failed', 'blocked', 'skipped')),
  step_results    JSONB        NOT NULL DEFAULT '[]'::jsonb, -- per step: "passed" / "failed" / "blocked" / null
  comment         TEXT,
  executed_by     INT REFERENCES users(id) ON DELETE SET NULL,
  executed_at     TIMESTAMPTZ,
  bug_id          INT,                                -- bug filed from this failure
  UNIQUE (run_id, test_case_id),
  FOREIGN KEY (run_id, project_id)       REFERENCES test_runs (id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (test_case_id, project_id) REFERENCES test_cases (id, project_id) ON DELETE SET NULL (test_case_id),
  FOREIGN KEY (bug_id, project_id)       REFERENCES work_items (id, project_id) ON DELETE SET NULL (bug_id)
);

-- ---------------------------------------------------------------------
-- 1e. PRODUCTION ERRORS  (server 5xx + browser crashes, grouped like Sentry)
-- ---------------------------------------------------------------------

-- One row per DISTINCT problem: occurrences with the same fingerprint are counted, not duplicated
CREATE TABLE IF NOT EXISTS error_groups (
  id              SERIAL PRIMARY KEY,
  organization_id INT          REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = outside any organization (login page, public API)
  source          VARCHAR(10)  NOT NULL CHECK (source IN ('server', 'client')),
  fingerprint     CHAR(40)     NOT NULL,              -- sha1(type + normalized message + top frame + route)
  title           VARCHAR(500) NOT NULL,              -- "TypeError: Cannot read properties of undefined"
  culprit         VARCHAR(500),                       -- "GET /api/projects/:projectRef/items" or "BoardPage.tsx in onDrop"
  status          VARCHAR(20)  NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved', 'ignored')),
  occurrences     INT          NOT NULL DEFAULT 0,
  first_seen_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     INT REFERENCES users(id) ON DELETE SET NULL,
  regressed_at    TIMESTAMPTZ,                        -- came back after being resolved
  work_item_id    INT,                                -- the bug filed for it
  last_release    VARCHAR(50),
  FOREIGN KEY (work_item_id, organization_id) REFERENCES work_items (id, organization_id) ON DELETE SET NULL (work_item_id)
);

-- Individual occurrences (the newest ~100 per group are kept): what the request / browser looked like
CREATE TABLE IF NOT EXISTS error_events (
  id              BIGSERIAL PRIMARY KEY,
  group_id        INT          NOT NULL REFERENCES error_groups(id) ON DELETE CASCADE,
  occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  request_id      VARCHAR(64),                        -- same id as in logs/http-*.log → full request + SQL
  user_id         INT REFERENCES users(id) ON DELETE SET NULL,
  method          VARCHAR(10),
  url             TEXT,
  message         TEXT         NOT NULL,
  stack           TEXT,
  user_agent      VARCHAR(500),
  release         VARCHAR(50),
  context         JSONB        NOT NULL DEFAULT '{}'::jsonb -- server: route, status, SQL of the request; client: component stack, source
);

-- ---------------------------------------------------------------------
-- 1f. LEAVE & HOLIDAYS
-- ---------------------------------------------------------------------

-- Master data: the leave types every new organization starts with (copied like role templates)
CREATE TABLE IF NOT EXISTS leave_type_templates (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(50)  NOT NULL UNIQUE,
  color          VARCHAR(20)  NOT NULL,
  is_paid        BOOLEAN      NOT NULL DEFAULT TRUE,
  default_days   NUMERIC(5,1),                          -- yearly allowance; NULL = unlimited (e.g. unpaid)
  allow_half_day BOOLEAN      NOT NULL DEFAULT TRUE,
  requires_approval BOOLEAN   NOT NULL DEFAULT TRUE,
  sort_order     INT          NOT NULL DEFAULT 0
);

-- A set of public holidays + which week days are off ("India 2026", "US office")
CREATE TABLE IF NOT EXISTS holiday_calendars (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  weekend_days    SMALLINT[]   NOT NULL DEFAULT '{0,6}', -- 0 = Sunday … 6 = Saturday
  is_default      BOOLEAN      NOT NULL DEFAULT FALSE,   -- used by members without a calendar
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name),
  UNIQUE (id, organization_id)
);

CREATE TABLE IF NOT EXISTS holidays (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL,
  calendar_id     INT          NOT NULL,
  date            DATE         NOT NULL,
  name            VARCHAR(100) NOT NULL,
  is_optional     BOOLEAN      NOT NULL DEFAULT FALSE,   -- "restricted" holiday: a normal working day unless taken as leave
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (calendar_id, date),
  FOREIGN KEY (calendar_id, organization_id) REFERENCES holiday_calendars (id, organization_id) ON DELETE CASCADE
);

-- The leave types of one organization (Annual, Sick, Unpaid, ...)
CREATE TABLE IF NOT EXISTS leave_types (
  id                SERIAL PRIMARY KEY,
  organization_id   INT          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              VARCHAR(50)  NOT NULL,
  color             VARCHAR(20)  NOT NULL DEFAULT '#1677ff',
  is_paid           BOOLEAN      NOT NULL DEFAULT TRUE,
  default_days      NUMERIC(5,1) CHECK (default_days >= 0), -- yearly allowance per person; NULL = unlimited
  allow_half_day    BOOLEAN      NOT NULL DEFAULT TRUE,
  requires_approval BOOLEAN      NOT NULL DEFAULT TRUE,  -- FALSE = approved automatically
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,  -- types with history are deactivated, not deleted
  position          INT          NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name),
  UNIQUE (id, organization_id)
);

-- Per person / type / year overrides of the allowance (no row = the type's default_days)
CREATE TABLE IF NOT EXISTS leave_balances (
  organization_id INT          NOT NULL,
  user_id         INT          NOT NULL,
  leave_type_id   INT          NOT NULL,
  year            INT          NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  entitled        NUMERIC(5,1) NOT NULL CHECK (entitled >= 0),
  carried_over    NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (carried_over >= 0),
  note            VARCHAR(255),
  updated_by      INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, leave_type_id, year),
  FOREIGN KEY (leave_type_id, organization_id) REFERENCES leave_types (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_members (organization_id, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL,
  user_id         INT          NOT NULL,
  leave_type_id   INT          NOT NULL,
  start_date      DATE         NOT NULL,
  end_date        DATE         NOT NULL,
  portion         VARCHAR(4)   NOT NULL DEFAULT 'full' CHECK (portion IN ('full', 'am', 'pm')), -- am / pm = half day (single-day requests)
  days            NUMERIC(5,1) NOT NULL CHECK (days > 0), -- working days, computed at request time (weekends & holidays excluded)
  reason          TEXT,
  status          VARCHAR(10)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by      INT REFERENCES users(id) ON DELETE SET NULL,
  decided_at      TIMESTAMPTZ,
  decision_note   TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date),
  CHECK (EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM end_date)), -- one balance year per request
  CHECK (portion = 'full' OR start_date = end_date),
  FOREIGN KEY (leave_type_id, organization_id) REFERENCES leave_types (id, organization_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_members (organization_id, user_id) ON DELETE CASCADE,
  -- the DATABASE refuses overlapping pending / approved leave of the same person (even under concurrency)
  CONSTRAINT no_overlapping_leave EXCLUDE USING gist (
    user_id WITH =, daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (status IN ('pending', 'approved'))
);


-- ---------------------------------------------------------------------
-- 1g. NOTIFICATIONS  (in-app bell + email, per-person preferences)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id              BIGSERIAL PRIMARY KEY,
  organization_id INT          NOT NULL,
  user_id         INT          NOT NULL,              -- recipient
  category        VARCHAR(20)  NOT NULL CHECK (category IN ('assignments', 'mentions', 'watching', 'qa', 'leave', 'errors')),
  type            VARCHAR(30)  NOT NULL,              -- assigned, mentioned, commented, status_changed, qa_failed, leave_requested, ...
  actor_id        INT REFERENCES users(id) ON DELETE SET NULL,
  title           VARCHAR(300) NOT NULL,
  body            TEXT,
  url             VARCHAR(500) NOT NULL,              -- where clicking takes you (app path)
  work_item_id    INT,
  count           INT          NOT NULL DEFAULT 1,    -- several similar events collapsed into one ("3 new comments")
  in_app          BOOLEAN      NOT NULL DEFAULT TRUE, -- show in the bell (preference at creation time)
  email           VARCHAR(10)  NOT NULL DEFAULT 'off' CHECK (email IN ('off', 'instant', 'daily')),
  read_at         TIMESTAMPTZ,
  emailed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_members (organization_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (work_item_id, organization_id) REFERENCES work_items (id, organization_id) ON DELETE CASCADE
);

-- Per person, per organization, per category: in-app on/off and email off / instant / daily digest.
-- No row = the defaults in code (notifications/notification-types.ts).
CREATE TABLE IF NOT EXISTS notification_preferences (
  organization_id INT         NOT NULL,
  user_id         INT         NOT NULL,
  -- "reports" = the weekly organization report email (insights.view)
  category        VARCHAR(20) NOT NULL CONSTRAINT notification_preferences_category_check
                  CHECK (category IN ('assignments', 'mentions', 'watching', 'qa', 'leave', 'errors', 'reports')),
  in_app          BOOLEAN     NOT NULL,
  email           VARCHAR(10) NOT NULL CHECK (email IN ('off', 'instant', 'daily')),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id, category),
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_members (organization_id, user_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 1h. TEAMS  (groups of people inside an organization; managers live on organization_members)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS teams (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  color           VARCHAR(20)  NOT NULL DEFAULT '#1677ff',
  lead_id         INT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id, lead_id) REFERENCES organization_members (organization_id, user_id) ON DELETE SET NULL (lead_id)
);

-- A person can belong to several teams
CREATE TABLE IF NOT EXISTS team_members (
  team_id         INT         NOT NULL,
  organization_id INT         NOT NULL,
  user_id         INT         NOT NULL,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id),
  FOREIGN KEY (team_id, organization_id) REFERENCES teams (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_members (organization_id, user_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 1i. CAPACITY PLANNING
-- ---------------------------------------------------------------------

-- How much of their time a person gives to a sprint (part-time, shared across projects, ...).
-- No row = 100 %. Working days, holidays and leave are computed from the calendars and leave requests.
CREATE TABLE IF NOT EXISTS sprint_capacity (
  sprint_id       INT          NOT NULL,
  project_id      INT          NOT NULL,
  organization_id INT          NOT NULL,
  user_id         INT          NOT NULL,
  allocation      INT          NOT NULL DEFAULT 100 CHECK (allocation BETWEEN 0 AND 100), -- % of working time; 0 = not in this sprint
  note            VARCHAR(255),
  updated_by      INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sprint_id, user_id),
  FOREIGN KEY (sprint_id, project_id) REFERENCES sprints (id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_members (organization_id, user_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 1j. HELP CENTER  (product guide written by the platform owner, read inside every organization)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS guide_sections (
  id         SERIAL PRIMARY KEY,
  slug       VARCHAR(60)  NOT NULL UNIQUE,
  title      VARCHAR(100) NOT NULL,
  icon       VARCHAR(30),
  position   INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guide_articles (
  id          SERIAL PRIMARY KEY,
  section_id  INT          NOT NULL REFERENCES guide_sections(id) ON DELETE CASCADE,
  slug        VARCHAR(80)  NOT NULL UNIQUE,               -- /guide/<slug>
  title       VARCHAR(200) NOT NULL,
  summary     VARCHAR(300),
  body        TEXT         NOT NULL,                      -- markdown
  audience    VARCHAR(10)  NOT NULL DEFAULT 'everyone' CHECK (audience IN ('everyone', 'admins')), -- admins = owners + users.update
  app_path    VARCHAR(200),                               -- "Open this page" button, e.g. /leave
  position    INT          NOT NULL DEFAULT 0,
  status      VARCHAR(10)  NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  visibility  VARCHAR(10)  NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'selected')),     -- selected = only the organizations below
  updated_by  INT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'C')
  ) STORED
);

-- visibility = 'selected': which organizations see the article
CREATE TABLE IF NOT EXISTS guide_article_organizations (
  article_id      INT NOT NULL REFERENCES guide_articles(id) ON DELETE CASCADE,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, organization_id)
);

-- ---------------------------------------------------------------------
-- 1k. PLANS  (limits per subscription plan; organizations.plan holds the key)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plans (
  key          VARCHAR(30)  PRIMARY KEY,                  -- free / pro / enterprise / …
  name         VARCHAR(60)  NOT NULL,
  description  VARCHAR(300),
  -- NULL = unlimited
  max_members  INT CHECK (max_members  IS NULL OR max_members  >= 1),   -- full members (not guests), incl. pending invitations
  max_projects INT CHECK (max_projects IS NULL OR max_projects >= 0),   -- active (not archived) projects
  max_guests   INT CHECK (max_guests   IS NULL OR max_guests   >= 0),   -- guests, incl. pending guest invitations
  sort_order   INT          NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 1l. CHECKLISTS, TEMPLATES & RECURRING WORK, PROJECT DOCS
-- ---------------------------------------------------------------------

-- Small to-do list inside a work item ("2 / 5 done" on the card)
CREATE TABLE IF NOT EXISTS work_item_checklist_items (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL,
  work_item_id    INT          NOT NULL,
  text            VARCHAR(500) NOT NULL,
  done            BOOLEAN      NOT NULL DEFAULT FALSE,
  position        INT          NOT NULL DEFAULT 0,
  done_by         INT REFERENCES users(id) ON DELETE SET NULL,
  done_at         TIMESTAMPTZ,
  created_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  FOREIGN KEY (work_item_id, organization_id) REFERENCES work_items (id, organization_id) ON DELETE CASCADE
);

-- Item templates of a project ("Bug report", "Release checklist"). A template can also REPEAT:
-- the "work-items.recurring" job creates an item from it on schedule.
CREATE TABLE IF NOT EXISTS work_item_templates (
  id               SERIAL PRIMARY KEY,
  organization_id  INT          NOT NULL,
  project_id       INT          NOT NULL,
  name             VARCHAR(100) NOT NULL,
  type             VARCHAR(20)  NOT NULL CHECK (type IN ('epic', 'story', 'task', 'bug')),
  title            VARCHAR(500) NOT NULL,                 -- may contain {date} (filled in when the item is created)
  description      TEXT,                                  -- markdown
  priority         VARCHAR(10)  NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low', 'none')),
  label_ids        INT[]        NOT NULL DEFAULT '{}',    -- labels that no longer exist are skipped
  checklist        JSONB        NOT NULL DEFAULT '[]'::jsonb, -- ["step 1", "step 2"]
  -- repeating
  repeat           VARCHAR(10)  NOT NULL DEFAULT 'never' CHECK (repeat IN ('never', 'weekdays', 'weekly', 'monthly')),
  repeat_weekday   SMALLINT     CHECK (repeat_weekday BETWEEN 0 AND 6),      -- weekly: 0 = Sunday … 6 = Saturday
  repeat_month_day SMALLINT     CHECK (repeat_month_day BETWEEN 1 AND 28),   -- monthly: day of the month
  assignee_id      INT,
  due_in_days      SMALLINT     CHECK (due_in_days BETWEEN 0 AND 365),       -- due date = creation day + N
  next_run_on      DATE,                                  -- next day an item is created (NULL = not repeating)
  last_run_at      TIMESTAMPTZ,
  created_by       INT REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  FOREIGN KEY (project_id, organization_id)  REFERENCES projects (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, assignee_id) REFERENCES organization_members (organization_id, user_id) ON DELETE SET NULL (assignee_id),
  CHECK (repeat <> 'weekly'  OR repeat_weekday   IS NOT NULL),
  CHECK (repeat <> 'monthly' OR repeat_month_day IS NOT NULL)
);

-- Project docs (wiki): pages and sub-pages in markdown
CREATE TABLE IF NOT EXISTS project_pages (
  id              SERIAL PRIMARY KEY,
  organization_id INT          NOT NULL,
  project_id      INT          NOT NULL,
  parent_id       INT,                                    -- sub-page of …
  title           VARCHAR(200) NOT NULL,
  body            TEXT         NOT NULL DEFAULT '',       -- markdown
  position        INT          NOT NULL DEFAULT 0,
  created_by      INT REFERENCES users(id) ON DELETE SET NULL,
  updated_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,                            -- in the trash (purged after 30 days)
  deleted_by      INT REFERENCES users(id) ON DELETE SET NULL,
  search_vector   TSVECTOR GENERATED ALWAYS AS (
                    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                    setweight(to_tsvector('simple', coalesce(body, '')), 'B')
                  ) STORED,
  UNIQUE (id, project_id),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id, project_id)       REFERENCES project_pages (id, project_id) ON DELETE CASCADE
);

-- Every saved change of a page (history; restore an older version)
CREATE TABLE IF NOT EXISTS project_page_versions (
  id         BIGSERIAL PRIMARY KEY,
  page_id    INT          NOT NULL REFERENCES project_pages(id) ON DELETE CASCADE,
  title      VARCHAR(200) NOT NULL,
  body       TEXT         NOT NULL,
  edited_by  INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 1m. PUBLIC WEBSITE  (marketing pages edited by the platform owner: Platform → Website)
--     A page is a list of sections (hero slider, features, pricing, …). Editing changes the DRAFT;
--     "Publish" copies it into website_pages.published, which is all visitors ever see.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS website_pages (
  id               SERIAL PRIMARY KEY,
  slug             VARCHAR(60)  NOT NULL UNIQUE,          -- home / features / pricing
  path             VARCHAR(100) NOT NULL UNIQUE,          -- / , /features , /pricing
  title            VARCHAR(100) NOT NULL,
  nav_label        VARCHAR(40),
  show_in_nav      BOOLEAN      NOT NULL DEFAULT TRUE,
  nav_order        INT          NOT NULL DEFAULT 0,
  seo_title        VARCHAR(70),
  seo_description  VARCHAR(170),
  published        JSONB,                                 -- snapshot { title, navLabel, …, sections: [...] }
  published_at     TIMESTAMPTZ,
  published_by     INT REFERENCES users(id) ON DELETE SET NULL,
  draft_updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),   -- > published_at = unpublished changes
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS website_sections (
  id          SERIAL PRIMARY KEY,
  page_id     INT         NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  type        VARCHAR(30) NOT NULL CHECK (type IN ('hero', 'logos', 'features_grid', 'feature_rows', 'stats',
                                                   'testimonials', 'cta', 'rich_text', 'pricing', 'faq')),
  position    INT         NOT NULL DEFAULT 0,
  is_visible  BOOLEAN     NOT NULL DEFAULT TRUE,
  content     JSONB       NOT NULL DEFAULT '{}'::jsonb,   -- shape depends on the type (validated by the API)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- header, footer, announcement bar (one row; draft + published like the pages)
CREATE TABLE IF NOT EXISTS website_settings (
  id               SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draft            JSONB       NOT NULL,
  published        JSONB,
  published_at     TIMESTAMPTZ,
  published_by     INT REFERENCES users(id) ON DELETE SET NULL,
  draft_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- images uploaded for the website (served publicly at /api/website/media/:id)
CREATE TABLE IF NOT EXISTS website_media (
  id          SERIAL PRIMARY KEY,
  storage_key VARCHAR(255) NOT NULL UNIQUE,
  file_name   VARCHAR(255) NOT NULL,
  mime_type   VARCHAR(100) NOT NULL,
  size_bytes  INT          NOT NULL,
  alt_text    VARCHAR(255),
  uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 2. UPGRADE COLUMNS  (v1 single-tenant databases; no-op on fresh installs)
-- =====================================================================

ALTER TABLE users        ADD COLUMN IF NOT EXISTS is_platform_admin    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users        ADD COLUMN IF NOT EXISTS last_organization_id INT REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE roles        ADD COLUMN IF NOT EXISTS organization_id      INT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE roles        DROP CONSTRAINT IF EXISTS roles_name_key;      -- v1: names were globally unique
ALTER TABLE menus        ADD COLUMN IF NOT EXISTS scope                VARCHAR(20) NOT NULL DEFAULT 'organization';
ALTER TABLE audit_logs   ADD COLUMN IF NOT EXISTS organization_id      INT REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE site_content ADD COLUMN IF NOT EXISTS organization_id      INT REFERENCES organizations(id) ON DELETE CASCADE;

-- Phase 2d / 2e upgrades (databases created before sprints existed)
ALTER TABLE project_statuses ADD COLUMN IF NOT EXISTS wip_limit INT CHECK (wip_limit > 0);
ALTER TABLE work_items       ADD COLUMN IF NOT EXISTS sprint_id INT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_work_items_sprint') THEN
    ALTER TABLE work_items ADD CONSTRAINT fk_work_items_sprint
      FOREIGN KEY (sprint_id, project_id) REFERENCES sprints (id, project_id) ON DELETE SET NULL (sprint_id);
  END IF;
END $$;

-- Phase 3f upgrades: trash — deleted items and projects are kept 30 days (job "trash.purge" removes them)
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS deleted_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE projects   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE projects   ADD COLUMN IF NOT EXISTS deleted_by INT REFERENCES users(id) ON DELETE SET NULL;

-- Phase 3e upgrades: security policy per organization, forced password change, session start, guests
ALTER TABLE organizations        ADD COLUMN IF NOT EXISTS password_min_length     INT     NOT NULL DEFAULT 8;
ALTER TABLE organizations        ADD COLUMN IF NOT EXISTS password_require_symbol BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations        ADD COLUMN IF NOT EXISTS session_idle_minutes    INT;    -- NULL = no inactivity limit
ALTER TABLE organizations        ADD COLUMN IF NOT EXISTS session_max_hours       INT;    -- NULL = refresh-token lifetime
ALTER TABLE users                ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN NOT NULL DEFAULT FALSE;
-- when the sign-in happened (kept through refresh-token rotation; created_at = last refresh = last activity)
ALTER TABLE refresh_tokens       ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- guest = outside collaborator: sees only the projects they are a member of
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;
-- a guest invitation names the project (and the project role) the guest gets
ALTER TABLE invitations          ADD COLUMN IF NOT EXISTS project_id   INT REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE invitations          ADD COLUMN IF NOT EXISTS project_role VARCHAR(10);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_password_min_length') THEN
    ALTER TABLE organizations ADD CONSTRAINT chk_org_password_min_length CHECK (password_min_length BETWEEN 8 AND 64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_session_idle') THEN
    ALTER TABLE organizations ADD CONSTRAINT chk_org_session_idle CHECK (session_idle_minutes IS NULL OR session_idle_minutes BETWEEN 15 AND 43200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_session_max') THEN
    ALTER TABLE organizations ADD CONSTRAINT chk_org_session_max CHECK (session_max_hours IS NULL OR session_max_hours BETWEEN 1 AND 8760);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invitations_project_role') THEN
    ALTER TABLE invitations ADD CONSTRAINT chk_invitations_project_role
      CHECK ((project_id IS NULL AND project_role IS NULL) OR (project_id IS NOT NULL AND project_role IN ('member', 'viewer')));
  END IF;
END $$;

-- Phase 3d upgrades: the "Getting started" checklist can be hidden per organization
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS getting_started_dismissed_at TIMESTAMPTZ;

-- Phase 3c upgrades: job title + manager of each member (the manager approves their leave)
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS job_title  VARCHAR(100);
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS manager_id INT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_members_manager') THEN
    ALTER TABLE organization_members ADD CONSTRAINT fk_members_manager
      FOREIGN KEY (organization_id, manager_id) REFERENCES organization_members (organization_id, user_id) ON DELETE SET NULL (manager_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_members_not_own_manager') THEN
    ALTER TABLE organization_members ADD CONSTRAINT chk_members_not_own_manager CHECK (manager_id IS NULL OR manager_id <> user_id);
  END IF;
END $$;

-- Phase 3b upgrades: the "reports" notification category (databases created before it existed)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'notification_preferences_category_check' AND pg_get_constraintdef(oid) LIKE '%reports%') THEN
    ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_category_check;
    ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_category_check
      CHECK (category IN ('assignments', 'mentions', 'watching', 'qa', 'leave', 'errors', 'reports'));
  END IF;
END $$;

-- Phase 2g upgrades (leave): which holiday calendar applies to a member (NULL = the organization's default)
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS holiday_calendar_id INT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_members_holiday_calendar') THEN
    ALTER TABLE organization_members ADD CONSTRAINT fk_members_holiday_calendar
      FOREIGN KEY (holiday_calendar_id, organization_id) REFERENCES holiday_calendars (id, organization_id) ON DELETE SET NULL (holiday_calendar_id);
  END IF;
END $$;

-- Phase 2f upgrades (bug fields, QA flow, test case numbering)
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS browser          VARCHAR(100);
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS os               VARCHAR(100);
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS found_in_version VARCHAR(50);
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS fixed_in_version VARCHAR(50);
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS resolution       VARCHAR(20)
  CHECK (resolution IN ('fixed', 'duplicate', 'wont_fix', 'cannot_reproduce', 'by_design'));
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS reopen_count     INT NOT NULL DEFAULT 0;
ALTER TABLE projects   ADD COLUMN IF NOT EXISTS test_case_counter   INT NOT NULL DEFAULT 0;
ALTER TABLE projects   ADD COLUMN IF NOT EXISTS qa_ready_status_id  INT;
ALTER TABLE projects   ADD COLUMN IF NOT EXISTS qa_passed_status_id INT;
ALTER TABLE projects   ADD COLUMN IF NOT EXISTS qa_failed_status_id INT;
-- the QA statuses must belong to the same project; deleting such a status just clears the setting
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_qa_ready') THEN
    ALTER TABLE projects ADD CONSTRAINT fk_projects_qa_ready
      FOREIGN KEY (qa_ready_status_id, id) REFERENCES project_statuses (id, project_id) ON DELETE SET NULL (qa_ready_status_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_qa_passed') THEN
    ALTER TABLE projects ADD CONSTRAINT fk_projects_qa_passed
      FOREIGN KEY (qa_passed_status_id, id) REFERENCES project_statuses (id, project_id) ON DELETE SET NULL (qa_passed_status_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_qa_failed') THEN
    ALTER TABLE projects ADD CONSTRAINT fk_projects_qa_failed
      FOREIGN KEY (qa_failed_status_id, id) REFERENCES project_statuses (id, project_id) ON DELETE SET NULL (qa_failed_status_id);
  END IF;
END $$;

-- v1 site_content used "key" as primary key; v2 uses id + unique (organization, key)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'site_content' AND column_name = 'id') THEN
    ALTER TABLE site_content DROP CONSTRAINT IF EXISTS site_content_pkey;
    ALTER TABLE site_content ADD COLUMN id SERIAL PRIMARY KEY;
  END IF;
END $$;

-- v1 permission names -> v2 (keeps existing role mappings)
UPDATE permissions SET name = 'users.invite', description = 'Invite members'
 WHERE name = 'users.create' AND NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'users.invite');
UPDATE permissions SET name = 'users.remove', description = 'Remove members from the organization'
 WHERE name = 'users.delete' AND NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'users.remove');
DELETE FROM permissions WHERE name = 'menus.manage';                    -- menus are platform-level now


-- =====================================================================
-- 3. INDEXES & TENANT-INTEGRITY CONSTRAINTS
-- =====================================================================

-- Role names are unique per organization (two organizations can both have "admin")
DROP INDEX IF EXISTS uq_roles_org_name;                  -- v2.0 index (templates lived in roles)
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_organization_name ON roles (organization_id, name);
-- Lets other tables reference (role, organization) together — see the foreign keys below
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_id_org       ON roles (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_content_org_key ON site_content ((COALESCE(organization_id, 0)), key);

CREATE INDEX IF NOT EXISTS idx_org_members_user      ON organization_members (user_id);
CREATE INDEX IF NOT EXISTS idx_member_roles_role     ON member_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_invitations_org       ON invitations (organization_id) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user   ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created    ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org        ON audit_logs (organization_id, created_at DESC);

-- platform services
CREATE INDEX IF NOT EXISTS idx_jobs_fetch            ON jobs (run_at, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_jobs_status           ON jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_created ON email_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_user   ON password_reset_tokens (user_id);

-- projects & work items (every index starts with the tenant / project)
CREATE INDEX IF NOT EXISTS idx_project_members_user  ON project_members (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_project_statuses_proj ON project_statuses (project_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_statuses_name ON project_statuses (project_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_labels_name   ON project_labels (project_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_custom_fields_project ON project_custom_fields (project_id, position);
CREATE INDEX IF NOT EXISTS idx_work_items_project    ON work_items (project_id, status_id, rank);
CREATE INDEX IF NOT EXISTS idx_work_items_org        ON work_items (organization_id);
CREATE INDEX IF NOT EXISTS idx_work_items_assignee   ON work_items (organization_id, assignee_id);
CREATE INDEX IF NOT EXISTS idx_work_items_parent     ON work_items (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_search     ON work_items USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_work_item_labels_label ON work_item_labels (label_id);
CREATE INDEX IF NOT EXISTS idx_work_item_links_target ON work_item_links (target_id);
CREATE INDEX IF NOT EXISTS idx_comments_item         ON work_item_comments (work_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attachments_item      ON work_item_attachments (work_item_id);
CREATE INDEX IF NOT EXISTS idx_events_item           ON work_item_events (work_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_watchers_user          ON work_item_watchers (organization_id, user_id);

-- sprints, board ordering, saved views
CREATE UNIQUE INDEX IF NOT EXISTS uq_sprints_one_active ON sprints (project_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sprints_project       ON sprints (project_id, status);
CREATE INDEX IF NOT EXISTS idx_work_items_sprint     ON work_items (sprint_id) WHERE sprint_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_rank       ON work_items (project_id, rank);
CREATE INDEX IF NOT EXISTS idx_saved_views_project   ON saved_views (project_id);
-- sprint / status history lookups for burndown charts
CREATE INDEX IF NOT EXISTS idx_events_item_field     ON work_item_events (work_item_id, field, created_at) WHERE field IN ('status', 'sprint');

-- duplicate detection (trigram similarity of titles)
CREATE INDEX IF NOT EXISTS idx_work_items_title_trgm ON work_items USING GIN (title gin_trgm_ops);

-- QA: test cases & runs
CREATE INDEX IF NOT EXISTS idx_test_cases_project    ON test_cases (project_id, suite_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_search     ON test_cases USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_test_cases_item       ON test_cases (work_item_id) WHERE work_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_runs_project     ON test_runs (project_id, status);
CREATE INDEX IF NOT EXISTS idx_test_results_run      ON test_results (run_id, position);
CREATE INDEX IF NOT EXISTS idx_test_results_case     ON test_results (test_case_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_results_bug      ON test_results (bug_id) WHERE bug_id IS NOT NULL;

-- production errors: one group per (organization, source, fingerprint); NULL organization counts as 0
CREATE UNIQUE INDEX IF NOT EXISTS uq_error_groups_fingerprint ON error_groups (COALESCE(organization_id, 0), source, fingerprint);
CREATE INDEX IF NOT EXISTS idx_error_groups_org      ON error_groups (organization_id, status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_groups_item     ON error_groups (work_item_id) WHERE work_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_error_events_group    ON error_events (group_id, occurred_at DESC);

-- leave & holidays
CREATE UNIQUE INDEX IF NOT EXISTS uq_holiday_calendars_default ON holiday_calendars (organization_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_holidays_calendar_date ON holidays (calendar_id, date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_org     ON leave_requests (organization_id, status, start_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user    ON leave_requests (user_id, start_date);

-- notifications: the bell (newest first) and the daily digest
CREATE INDEX IF NOT EXISTS idx_notifications_inbox    ON notifications (user_id, organization_id, updated_at DESC) WHERE in_app;
CREATE INDEX IF NOT EXISTS idx_notifications_unread   ON notifications (user_id, organization_id) WHERE read_at IS NULL AND in_app;
CREATE INDEX IF NOT EXISTS idx_notifications_digest   ON notifications (created_at) WHERE email = 'daily' AND emailed_at IS NULL AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_item     ON notifications (work_item_id) WHERE work_item_id IS NOT NULL;

-- organization insights: activity per organization / per person
CREATE INDEX IF NOT EXISTS idx_events_org_created     ON work_item_events (organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_work_items_org_open    ON work_items (organization_id, assignee_id) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_created ON refresh_tokens (user_id, created_at);

-- teams & managers
CREATE INDEX IF NOT EXISTS idx_team_members_user      ON team_members (user_id);

-- trash, checklists, templates, docs, calendar
CREATE INDEX IF NOT EXISTS idx_work_items_trash        ON work_items (project_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_due          ON work_items (project_id, due_date) WHERE due_date IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checklist_item          ON work_item_checklist_items (work_item_id, position);
CREATE INDEX IF NOT EXISTS idx_templates_project       ON work_item_templates (project_id);
CREATE INDEX IF NOT EXISTS idx_templates_due           ON work_item_templates (next_run_on) WHERE next_run_on IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_templates_name    ON work_item_templates (project_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_pages_project           ON project_pages (project_id, parent_id, position);
CREATE INDEX IF NOT EXISTS idx_pages_search            ON project_pages USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_page_versions_page      ON project_page_versions (page_id, created_at DESC);

-- public website
CREATE INDEX IF NOT EXISTS idx_website_sections_page   ON website_sections (page_id, position);

-- help center
CREATE INDEX IF NOT EXISTS idx_guide_articles_section ON guide_articles (section_id, position);
CREATE INDEX IF NOT EXISTS idx_guide_articles_search  ON guide_articles USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_members_manager        ON organization_members (organization_id, manager_id) WHERE manager_id IS NOT NULL;

-- The database itself guarantees a member can only get roles of THEIR organization,
-- and an invitation can only offer a role of its own organization.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_member_roles_role_same_org') THEN
    ALTER TABLE member_roles ADD CONSTRAINT fk_member_roles_role_same_org
      FOREIGN KEY (role_id, organization_id) REFERENCES roles (id, organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invitations_role_same_org') THEN
    ALTER TABLE invitations ADD CONSTRAINT fk_invitations_role_same_org
      FOREIGN KEY (role_id, organization_id) REFERENCES roles (id, organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_menus_scope') THEN
    ALTER TABLE menus ADD CONSTRAINT chk_menus_scope CHECK (scope IN ('organization', 'platform'));
  END IF;
END $$;


-- =====================================================================
-- 4. MASTER DATA
-- =====================================================================

-- 4.1 Permissions (organization scope) ------------------------------------
INSERT INTO permissions (name, module, description) VALUES
  ('dashboard.view',      'dashboard',    'View the dashboard'),

  ('users.read',          'members',      'View members'),
  ('users.invite',        'members',      'Invite members'),
  ('users.update',        'members',      'Activate / deactivate members'),
  ('users.remove',        'members',      'Remove members from the organization'),
  ('users.assign_roles',  'members',      'Assign roles to members'),

  ('roles.read',          'roles',        'View roles and permissions'),
  ('roles.create',        'roles',        'Create roles'),
  ('roles.update',        'roles',        'Edit roles and their permissions'),
  ('roles.delete',        'roles',        'Delete roles'),

  ('content.manage',      'organization', 'Manage organization content (dashboard announcement)'),
  ('audit.read',          'organization', 'View the organization audit log'),
  ('organization.manage', 'organization', 'Edit organization settings'),

  ('projects.create',     'projects',     'Create projects'),
  ('projects.manage_all', 'projects',     'Admin access to every project (including private ones)'),

  ('errors.read',         'errors',       'View production errors (stack traces, requests, SQL)'),
  ('errors.manage',       'errors',       'Resolve / ignore production errors and turn them into bugs'),

  ('leave.request',       'leave',        'Request leave, see own balances and the team calendar'),
  ('leave.approve',       'leave',        'Approve or reject leave requests of the organization'),
  ('leave.manage',        'leave',        'Manage leave types, balances and holiday calendars'),

  ('insights.view',       'organization', 'Organization insights: all projects, people, workload, quality (+ weekly report email)'),
  ('guide.view',          'organization', 'Read the Help Center (product guide)'),
  ('people.view',         'members',      'See the people directory, teams and org chart')
-- Permissions are code-defined master data: keep module/description in sync on every run
ON CONFLICT (name) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description;

-- 4.2 Role templates — the blueprint copied into every new organization ------
--     Changing a template only affects organizations created AFTER the change.
INSERT INTO role_templates (name, display_name, description, sort_order) VALUES
  ('owner',     'Owner',     'Full control of the organization. Cannot be removed while they are the last owner.', 10),
  ('admin',     'Admin',     'Manages members and day-to-day administration.',                                     20),
  ('qa',        'QA',        'Quality assurance / testers.',                                                       30),
  ('developer', 'Developer', 'Engineering team members.',                                                          40),
  ('member',    'Member',    'Default role for new members.',                                                      50),
  ('guest',     'Guest',     'Outside collaborator (e.g. a client): only the projects they are invited to.',      60)
ON CONFLICT (name) DO NOTHING;

-- 4.3 Template -> permission mapping ----------------------------------------
-- owner: every permission (owners are also bypassed in code, so new permissions apply automatically)
INSERT INTO role_template_permissions (template_id, permission_id)
SELECT t.id, p.id FROM role_templates t CROSS JOIN permissions p
WHERE t.name = 'owner'
ON CONFLICT DO NOTHING;

INSERT INTO role_template_permissions (template_id, permission_id)
SELECT t.id, p.id FROM role_templates t
JOIN permissions p ON p.name IN (
  'dashboard.view',
  'users.read', 'users.invite', 'users.update', 'users.remove', 'users.assign_roles',
  'roles.read', 'roles.create', 'content.manage', 'audit.read',
  'projects.create', 'projects.manage_all',
  'errors.read', 'errors.manage',
  'leave.request', 'leave.approve', 'leave.manage',
  'insights.view', 'guide.view', 'people.view'
)
WHERE t.name = 'admin'
ON CONFLICT DO NOTHING;

-- QA and developers work the production-error inbox
INSERT INTO role_template_permissions (template_id, permission_id)
SELECT t.id, p.id FROM role_templates t
JOIN permissions p ON p.name IN ('errors.read', 'errors.manage')
WHERE t.name IN ('qa', 'developer')
ON CONFLICT DO NOTHING;

INSERT INTO role_template_permissions (template_id, permission_id)
SELECT t.id, p.id FROM role_templates t
JOIN permissions p ON p.name IN ('dashboard.view', 'leave.request', 'guide.view', 'people.view')
WHERE t.name IN ('qa', 'developer', 'member')
ON CONFLICT DO NOTHING;

-- guests: only the Help Center (their projects come from project membership, not permissions)
INSERT INTO role_template_permissions (template_id, permission_id)
SELECT t.id, p.id FROM role_templates t
JOIN permissions p ON p.name IN ('guide.view')
WHERE t.name = 'guest'
ON CONFLICT DO NOTHING;

-- 4.3a Plans — limits per plan (NULL = unlimited). The platform owner edits them in Platform → Plans;
--      ON CONFLICT DO NOTHING keeps those edits.
INSERT INTO plans (key, name, description, max_members, max_projects, max_guests, sort_order) VALUES
  ('free',       'Free',       'For small teams getting started.', 10,   5,    5,    10),
  ('pro',        'Pro',        'For growing teams.',               100,  100,  100,  20),
  ('enterprise', 'Enterprise', 'No limits.',                       NULL, NULL, NULL, 30)
ON CONFLICT (key) DO NOTHING;

-- 4.3b Leave type templates — copied into every new organization (edit per organization afterwards)
INSERT INTO leave_type_templates (name, color, is_paid, default_days, allow_half_day, requires_approval, sort_order) VALUES
  ('Annual leave', '#1677ff', TRUE,  20,   TRUE,  TRUE, 10),
  ('Sick leave',   '#fa8c16', TRUE,  10,   TRUE,  TRUE, 20),
  ('Casual leave', '#13c2c2', TRUE,  6,    TRUE,  TRUE, 30),
  ('Unpaid leave', '#8c8c8c', FALSE, NULL, TRUE,  TRUE, 40),
  ('Work from home', '#722ed1', TRUE, NULL, TRUE, FALSE, 50)
ON CONFLICT (name) DO NOTHING;

-- 4.3c Recurring jobs ------------------------------------------------------------
-- Daily notification digest at 08:00 (database server time); ON CONFLICT keeps an existing schedule untouched
INSERT INTO job_schedules (name, queue, interval_seconds, next_run_at) VALUES
  ('notifications.daily-digest', 'notifications.digest', 86400,
     date_trunc('day', NOW()) + INTERVAL '8 hours' + CASE WHEN NOW() >= date_trunc('day', NOW()) + INTERVAL '8 hours' THEN INTERVAL '1 day' ELSE INTERVAL '0' END)
ON CONFLICT (name) DO NOTHING;

-- Recurring work (templates that repeat): checked every hour
INSERT INTO job_schedules (name, queue, interval_seconds, next_run_at) VALUES
  ('work-items.recurring', 'work-items.recurring', 3600, date_trunc('hour', NOW()) + INTERVAL '1 hour')
ON CONFLICT (name) DO NOTHING;

-- Trash: remove what was deleted more than 30 days ago, every night at 03:00 (database server time)
INSERT INTO job_schedules (name, queue, interval_seconds, next_run_at) VALUES
  ('trash.purge', 'trash.purge', 86400,
     date_trunc('day', NOW()) + INTERVAL '3 hours' + CASE WHEN NOW() >= date_trunc('day', NOW()) + INTERVAL '3 hours' THEN INTERVAL '1 day' ELSE INTERVAL '0' END)
ON CONFLICT (name) DO NOTHING;

-- Weekly organization report for people with insights.view: Mondays 08:00 (database server time)
INSERT INTO job_schedules (name, queue, interval_seconds, next_run_at) VALUES
  ('insights.weekly-report', 'insights.weekly-report', 604800,
     date_trunc('week', NOW()) + INTERVAL '8 hours' + CASE WHEN NOW() >= date_trunc('week', NOW()) + INTERVAL '8 hours' THEN INTERVAL '7 days' ELSE INTERVAL '0' END)
ON CONFLICT (name) DO NOTHING;

-- 4.3d Help Center content -------------------------------------------------------
-- The starting product guide. ON CONFLICT (slug) DO NOTHING: once the platform owner edits an article
-- (Platform → Help Content), db:init never overwrites it; new articles added here appear on the next run.
INSERT INTO guide_sections (slug, title, icon, position) VALUES
  ('getting-started', 'Getting started',               'rocket',   10),
  ('work',            'Projects & work items',         'project',  20),
  ('planning',        'Boards, backlog & sprints',     'board',    30),
  ('quality',         'Bugs, QA & production errors',  'bug',      40),
  ('people',          'People, leave & notifications', 'users',    50),
  ('reports',         'Dashboards & reports',          'chart',    60),
  ('admin',           'Administration',                'settings', 70)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO guide_articles (section_id, slug, title, summary, audience, app_path, position, body) VALUES
((SELECT id FROM guide_sections WHERE slug = 'getting-started'), 'welcome', 'Welcome to Team-Flex',
 'What Team-Flex does and how the pieces fit together.', 'everyone', '/dashboard', 10, $md$
Team-Flex is one place for your team's **work**, **quality** and **people**: projects and sprints, bugs and testing, production errors, leave and holidays — connected to each other.

## The big picture

- **Projects** hold your work: epics, stories, tasks, bugs and sub-tasks.
- **Boards, backlog and sprints** help you plan and follow that work.
- **Bugs, QA and test cases** make sure what you ship works.
- **Production errors** from your live app become bugs with one click.
- **Leave and holidays** tell everyone who is away — and capacity planning uses them.
- **Notifications, My Work and the dashboard** show you what needs your attention.

## Where to start

1. Open **[My Work](/my-work)** — everything assigned to you, across all projects.
2. Open a project from **[Projects](/projects)** and look at its **Board**.
3. Press **Ctrl + K** (⌘ K on Mac) anywhere to jump to an item, a project or a page.

> 💡 Every main page has a small **?** next to its title — it opens the matching article here.

If you are the owner or an admin of your organization, read **[Set up your organization](/guide/setup-organization)** next.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'getting-started'), 'setup-organization', 'Set up your organization',
 'The first things an owner or admin should do — about 15 minutes.', 'admins', '/org/members', 20, $md$
A good setup makes everything else work: approvals reach the right person, capacity is correct, reports make sense.

## 1. Invite your team

**Organization → Members → Invite.** Pick a role for each person:

- **Admin** — manages members, roles, projects, leave and insights.
- **QA** — verifies bugs (only QA may mark a bug *Verified* in bug-tracking projects).
- **Developer** — builds things and handles production errors.
- **Member** — everyone else.

Roles can be changed later in **Organization → Roles & Access**.

## 2. Teams and managers

In **[People](/people)**: create teams (Frontend, QA, Support…) and set each person's **manager**. Managers approve their people's leave, and teams can be used to filter capacity and insights.

## 3. Holidays

**Organization → Leave & Holidays → Holiday calendars**: paste your public holidays (one per line, `2026-12-25, Christmas`). Weekends and holidays are never counted as leave or as working days.

## 4. Your first project

See **[Your first project in 5 minutes](/guide/first-project)**.

> 💡 The **Getting started** checklist on the Help Center home ticks these steps off automatically as you do them.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'getting-started'), 'first-project', 'Your first project in 5 minutes',
 'Create a project, add work, and see it on the board.', 'everyone', '/projects', 30, $md$
## 1. Create the project

**[Projects](/projects) → New project.** Choose a **template**:

- **Kanban** — a simple flow: To Do → In Progress → Done.
- **Scrum** — work in sprints, with a backlog.
- **Bug tracking** — Open → In Progress → Ready for QA → Verified, with QA verification.
- **Blank** — build your own workflow.

The **key** (for example `WEB`) becomes the prefix of every item: `WEB-1`, `WEB-2`…

## 2. Add people

Project → **Settings → Members**. *Members* can create and edit work; *viewers* can only read and comment. Projects can be **private** (members only) or visible to the whole organization.

## 3. Add work

Click **Create** on the board or in the list. Give it a type, a title, an assignee and — if you plan in sprints — an **estimate** in points.

## 4. Work on the board

Drag cards between columns to change their status. Everyone sees the change immediately — no refresh needed.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'work'), 'projects', 'Projects, templates and project roles',
 'How projects are organized and who can do what inside them.', 'everyone', '/projects', 10, $md$
## Project roles

- **Admin** — settings, members, workflow, labels, custom fields.
- **Member** — create and edit work items.
- **Viewer** — read and comment.

Organization owners and people with *manage all projects* are admins of every project.

## Settings you can change

- **Workflow** — the statuses, their order, which roles may move work into a status (for example only QA into *Verified*), WIP limits for the board, and the **QA verification flow**.
- **Labels** and **custom fields** (text, number, date, choice, checkbox).
- **Archive** a finished project: it becomes read-only and leaves the project list.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'work'), 'work-items', 'Work items: epics, stories, tasks, bugs',
 'Item types, fields, comments, mentions, attachments, links and history.', 'everyone', '/projects', 20, $md$
## Types

- **Epic** — a large goal, made of stories, tasks and bugs.
- **Story / Task / Bug** — the everyday work.
- **Sub-task** — a step of a story, task or bug.

## On every item

- **Status, assignee, priority, due date, estimate, labels, sprint** — edit them in the right column; changes save immediately.
- **Description** in markdown.
- **Comments** — type `@` to **mention** someone; they get notified. React with emoji.
- **Attachments** — drag files onto the item.
- **Links** — *blocks*, *duplicates*, *relates to*.
- **Watch** an item to be notified about its changes.
- **History** — every change, who made it and when.

> 💡 The assignee picker shows **🌴 away** when someone has leave coming up, and the due date warns you if the assignee is away that day.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'work'), 'search-and-shortcuts', 'Search and keyboard shortcuts',
 'Find anything quickly.', 'everyone', NULL, 30, $md$
## Command palette — Ctrl + K (⌘ K)

Type a key like `WEB-12`, words from a title, a project name or a page name. Use ↑ ↓ and **Enter**.

## Filters and saved views

On the **List** and the **Board**, filter by type, status, assignee, priority, label or sprint. Filters live in the address bar — share the link, or **save the view** (privately or for the whole project).

## Running tests faster

On a test run: **P** pass · **F** fail · **B** blocked · **S** skip · **J / K** next / previous.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'planning'), 'board-and-list', 'Board and list',
 'See and move work: columns, ordering, WIP limits, bulk edit.', 'everyone', '/projects', 10, $md$
## Board

One column per status. **Drag a card** to change its status or its order. A column turns **red** when it holds more cards than its WIP limit (set in Settings → Workflow) — a signal to finish work before starting more.

In Scrum projects the board shows the **active sprint**; switch to *All items* to see everything.

## List

A table of all items with search, filters, sorting and paging. **Select several rows** to change their status, assignee, priority, sprint or labels in one go.

## Live updates

The header shows **Live** when changes by others appear automatically.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'planning'), 'backlog-and-sprints', 'Backlog and sprints',
 'Plan sprints, start them, complete them, and read the burndown.', 'everyone', '/projects', 20, $md$
## The backlog

Your active sprint, your planned sprints and the backlog, one under the other. **Drag items** between them to plan, and up or down to set priority. Sub-tasks always follow their parent.

## A sprint's life

1. **Create sprint** — give it a name and dates (optional until you start).
2. **Start sprint** — what is in it now becomes the commitment.
3. Work on the **board**.
4. **Complete sprint** — unfinished items move to the backlog or the next sprint.

## How did it go?

**Reports → Sprint burndown** shows the work remaining day by day; **Velocity** compares committed and completed points over your last sprints.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'planning'), 'capacity-planning', 'Capacity planning',
 'Can these people do this much work? Leave and holidays included.', 'everyone', '/projects', 30, $md$
In the **Backlog**, every sprint shows a capacity chip like *11.5 days · 92% load*. Click it.

## What it counts

- **Working days** of each person, from their own holiday calendar.
- Minus their **approved leave** in the sprint (pending leave is shown, not subtracted).
- Times their **allocation** — set 50 % for someone who works half on this project, 0 % to leave them out.

## The forecast

After your first completed sprint with estimates, Team-Flex learns **how many points your team finishes per available day** and shows how much fits into the sprint — for the team and for each person. *Overloaded* means more is planned than you usually finish.

Use the **team filter** to look at one team only.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'quality'), 'bug-flow', 'Bugs and QA verification',
 'Report good bugs, avoid duplicates, and verify fixes.', 'everyone', '/projects', 10, $md$
## Report a good bug

- **Severity** = how bad (critical … trivial). **Priority** = how soon. They are different.
- Steps to reproduce, expected vs actual result, browser, OS, version — **Use my browser** fills browser and OS.
- While you type the title, **possible duplicates** appear. Check them first.

## Fix → verify

In bug-tracking projects:

1. The developer moves the bug to **Ready for QA**.
2. QA opens it and clicks **Pass** (→ *Verified*) or **Fail** (→ *Reopened*, with the reason as a comment).

The *reopened ×2* tag shows bugs that bounced back. A bug reaching *done* gets the resolution **Fixed** automatically.

## Duplicates

Item menu **⋯ → Close as duplicate** links it to the original and moves its watchers there.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'quality'), 'test-cases', 'Test cases and test runs',
 'Write reusable checks, run them, and file bugs from failures.', 'everyone', '/projects', 20, $md$
## Test cases

Project → **Tests → Test cases**: organise cases in **suites**, write **steps** with an expected result each, and link a case to the **story** it covers — the story then shows its test coverage.

## Test runs

**Test runs → New test run**: pick all ready cases, some suites or single cases, plus the environment and build. Then execute:

- mark each **step** passed / failed / blocked — a failed step fails the case;
- write what you saw in the notes;
- **File bug** on a failure: steps, expected and actual result, environment and version are filled in for you.

Progress and pass rate update live while several testers work on the same run.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'quality'), 'production-errors', 'Production errors',
 'Crashes from your live app, grouped — and turned into bugs.', 'everyone', '/errors', 30, $md$
Every server error and browser crash of the app is recorded in **[Production Errors](/errors)** (for people allowed to see it — Admins, Developers and QA by default).

## Grouped, not repeated

The same problem happening 500 times is **one** row with a count, the people affected, first and last seen, and the release.

## From error to bug

Open an error → **Create bug**. The bug gets the details (where it happened, the request id, the stack) and is linked to the error.

- When the bug is **done**, the error is **resolved** automatically.
- If it **happens again**, it re-opens as a **regression** and the bug's history says so.

Use **Ignore** for known noise.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'people'), 'my-work', 'My Work',
 'Your daily to-do list across all projects.', 'everyone', '/my-work', 10, $md$
**[My Work](/my-work)** gathers everything waiting for you:

- **Assigned to me** — grouped *Overdue*, *Due today*, *This week*, *Later*.
- **Waiting for my QA** — bugs ready for your verdict (if you may verify).
- **Leave to approve** — requests of the people you manage; approve them right there.
- **Mentions** — comments where someone @mentioned you.

It updates by itself when something new arrives. A good habit: start your day here.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'people'), 'notifications', 'Notifications',
 'The bell, emails, and how to choose what you receive.', 'everyone', '/notifications', 20, $md$
The **bell** at the top shows what happened: work assigned to you, mentions, comments and status changes on items you watch, QA verdicts, leave decisions, new production errors. The number also appears in the browser tab.

## Choose what you receive

**[Notifications → Settings](/notifications?tab=settings)** — for each kind:

- **In the app** on or off.
- **Email**: *instantly*, in a **daily digest** (08:00), or *off*.

Instant emails wait a minute and are **skipped if you already saw** the notification in the app. You are never notified about your own actions, and many comments on one item become a single notification.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'people'), 'leave', 'Leave and holidays',
 'Request leave, see your balance and who is away.', 'everyone', '/leave', 30, $md$
## Request leave

**[Leave → My leave](/leave) → Request leave.** Pick the type and the dates (or a half day). The form shows right away:

- how many **working days** it costs (weekends and public holidays are not counted),
- your **balance** afterwards,
- who else is **away** then.

Your **manager** is notified and decides. You get the decision in the app (and by email).

## Who is away

**[Team calendar](/leave/calendar)** — a month view of everyone's leave and the holidays. Only you and approvers see *which kind* of leave someone takes; others see *Out of office*.

You can cancel a pending request, or approved leave that hasn't started yet.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'people'), 'people-and-teams', 'People and teams',
 'The directory, teams, managers and the org chart.', 'everyone', '/people', 40, $md$
**[People](/people)** shows who is who:

- **Directory** — name, job title, teams, manager, and who is away today. Click someone for their details and direct reports.
- **Teams** — each team with its lead and members.
- **Org chart** — the reporting lines.

Admins set **job titles, managers and teams** here. A person's **manager approves their leave**, and teams are used to filter capacity and organization insights.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'reports'), 'dashboards-and-reports', 'Dashboard and project reports',
 'Your dashboard, and the reports of every project.', 'everyone', '/dashboard', 10, $md$
## Dashboard

Your work (assigned, overdue, due this week), bugs opened vs closed in your projects, project health, who is away, upcoming holidays and your leave balances.

## Project reports

Project → **Reports**:

- **Overview** — items by status, workload per person, created vs resolved.
- **Bugs** — opened vs closed per week, open bugs over time, **ageing** by severity, the oldest open bugs.
- **Cycle & lead time** — how long work takes from start (or creation) to done.
- **Sprint burndown** and **Velocity**.

Every chart has a **Table** switch to see the exact numbers.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'reports'), 'organization-insights', 'Organization insights',
 'The whole organization at a glance — for owners and admins.', 'admins', '/org/insights', 20, $md$
**[Organization → Insights](/org/insights)** covers every project and person:

- **Needs attention** — projects *at risk* (critical bugs, many overdue items) or *stale* (no activity for 14 days), always with the reason.
- **Work trend** — created vs completed per week.
- **Workload** — open, overdue and in-progress work per person, plus upcoming leave. Filter by team.
- **Quality** — open bugs by severity, production errors, test pass rate.
- **Export CSV** of the projects and workload tables.

## Weekly report

Every **Monday at 08:00** you receive the summary by email. **Email me the weekly report** sends it now; switch it off in Notifications → Settings.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'admin'), 'roles-and-permissions', 'Roles and permissions',
 'Decide who can do what in your organization.', 'admins', '/org/roles', 10, $md$
**[Organization → Roles & Access](/org/roles)** lists the roles of your organization and their permissions. You can change what each role may do, or create your own roles.

Examples of permissions:

- *Invite members*, *assign roles* — member management.
- *Create projects*, *manage all projects*.
- *View / manage production errors*.
- *Request leave*, *approve leave*, *manage leave settings*.
- *Organization insights*.
- *Read the Help Center* — remove it from a role to hide this guide from that role.

The **owner** always has every permission. Inside a project, access is decided by the **project role** (admin, member, viewer).
$md$),

((SELECT id FROM guide_sections WHERE slug = 'admin'), 'leave-and-holiday-setup', 'Leave types, allowances and holiday calendars',
 'Configure leave for your organization.', 'admins', '/org/leave', 20, $md$
**[Organization → Leave & Holidays](/org/leave)**:

- **Leave types** — Annual, Sick, Casual, Unpaid, Work from home… with a yearly allowance (or unlimited), paid or not, half days allowed, approval needed or automatic.
- **Holiday calendars** — the public holidays and the **weekend days** (for example Friday + Saturday). Create one calendar per country or office and assign people to it.
- **Allowances** — give someone a different allowance this year, or carry days over from last year.

Overlapping leave of the same person is refused automatically.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'admin'), 'security-and-audit', 'Audit log and security',
 'What is recorded, and how your organization''s data is protected.', 'admins', '/org/audit-logs', 30, $md$
## Audit log

**[Organization → Audit Log](/org/audit-logs)** records security-relevant actions: sign-ins, role and member changes, project and leave decisions, settings — who, when and from where.

## How your data is protected

- Each organization's data is **separated** from every other organization.
- Passwords are stored as one-way hashes; sessions are renewed securely and can be ended everywhere from **My account**.
- Private projects are visible only to their members.
- Files are only downloadable by people who can see the item.
$md$)
ON CONFLICT (slug) DO NOTHING;

-- Help Center articles added in Phase 3e (security policy, plans, guests) — same rules as above
INSERT INTO guide_articles (section_id, slug, title, summary, audience, app_path, position, body) VALUES
((SELECT id FROM guide_sections WHERE slug = 'admin'), 'security-policy', 'Password and session rules',
 'Decide how strong passwords must be and when people are signed out.', 'admins', '/org/settings', 40, $md$
**[Organization → Settings → Security](/org/settings)** (people with *Edit organization settings* — owners by default).

## Passwords

- **Minimum length** — 8 to 64 characters. Every password also needs a letter and a number.
- **Require a symbol** — such as `!`, `#` or `%`.

The rules apply whenever someone **sets** a password: when they join through an invitation, change it in **My account**, or reset it.

**Existing passwords** are checked the next time each person signs in. If theirs is too weak, they must choose a new one before they can continue.

Need everyone to change now? Click **Ask everyone to set a new password**. On their next visit, every member (except you) must choose a new password.

## Sessions

- **Sign out after inactivity** — for example after 1 hour without using Team-Flex.
- **Maximum session length** — for example: sign in again every 12 hours, even when active.

Both are checked by the server, so closing the laptop and coming back later is covered too. A signed-out person sees why on the sign-in page.

## People in several organizations

A person has **one account**. If they belong to several organizations, the **strictest** rules of all of them apply to that account.

> 💡 Every change of these rules is recorded in the [audit log](/org/audit-logs).
$md$),

((SELECT id FROM guide_sections WHERE slug = 'admin'), 'plans-and-limits', 'Your plan and its limits',
 'How many members, guests and projects your plan includes.', 'admins', '/org/settings', 50, $md$
Your organization has a **plan**. **[Organization → Settings](/org/settings)** shows it, with what you use today:

- **Members** — people with full access. Pending invitations count too, so you can't invite more people than you have seats for.
- **Guests** — outside collaborators (see [Guest access](/guide/guest-access)). They have their own limit and don't use member seats.
- **Projects** — active projects. **Archived projects don't count**: archive a finished project to free a place.

## When a limit is reached

Nothing stops working. Everything you already have stays as it is — only **adding more** is blocked:

- inviting another member or guest,
- accepting an invitation when the organization is full,
- creating or restoring a project,
- turning a guest into a member, or re-activating a member.

The message says which limit was reached. To get more, **contact the platform team** to change your plan — or free a place: archive a project, revoke a pending invitation, or remove someone who no longer needs access.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'people'), 'guest-access', 'Guest access: working with clients',
 'Invite outside people to one project — they see nothing else.', 'everyone', '/org/members', 50, $md$
A **guest** is someone from outside your organization — a client, a freelancer, an auditor — who works with you on **one project**.

## Invite a guest

**[Organization → Members](/org/members) → Invite → Guest** (people who may invite members). Choose:

- the **project** they join,
- what they can do in it: **Member** (create and edit work) or **Viewer** (read and comment).

They receive an email with a link, exactly like a member.

## What a guest sees

**✅ Can see**

- their project(s): board, backlog, list, items, comments, files, reports
- My Work, notifications and the Help Center

**❌ Cannot see**

- any other project — even projects visible to the whole organization
- the people directory, members list, dashboard, leave, insights

Inside their project, guests only see the **people of that project** (for example when assigning work). A guest can never be a project admin.

## Later

- **Another project?** A project admin adds the guest in **Project → Settings → Members**.
- **They joined your team?** **Members → ⋯ → Make full member** (uses a member seat).
- **Work finished?** Remove them from the organization.

Guests are counted separately from members — see [Your plan and its limits](/guide/plans-and-limits).
$md$),

((SELECT id FROM guide_sections WHERE slug = 'getting-started'), 'working-as-a-guest', 'Working as a guest',
 'You were invited to a project of another organization — here is what to expect.', 'everyone', '/projects', 40, $md$
You were invited as a **guest**: you work with this organization on a project, without being part of the organization itself.

- **[Projects](/projects)** lists the project(s) you were invited to — nothing else.
- **[My Work](/my-work)** shows what is assigned to you.
- The **bell** tells you when someone mentions you, assigns you work or comments on something you watch.

Depending on what you were given, you can **create and edit work** or **read and comment**. Ask the project admin if you need more.

Your account is yours: if you already use Team-Flex in another organization, switch between them with the organization switcher at the top.
$md$)
ON CONFLICT (slug) DO NOTHING;

-- Help Center articles added in Phase 3f (checklists & templates, trash, docs, calendar) — same rules as above
INSERT INTO guide_articles (section_id, slug, title, summary, audience, app_path, position, body) VALUES
((SELECT id FROM guide_sections WHERE slug = 'work'), 'checklists-and-templates', 'Checklists, templates and recurring work',
 'Small to-do lists inside an item, ready-made items, and work that repeats by itself.', 'everyone', '/projects', 22, $md$
## Checklists

Open an item → **Checklist** → type a step and press **Enter**. Tick steps as you go; drag them to reorder.

The card on the board shows the progress, for example **☑ 2/5**. A checklist is lighter than sub-tasks: use it for steps that one person does, use sub-tasks for work that someone else picks up.

## Templates

**Project → Settings → Templates → New template**: a name, the type, a title, a description, a priority, labels and a checklist.

Then **Create → Use a template** fills everything in for you. Good candidates: *Bug report*, *Release checklist*, *New customer onboarding*.

> 💡 Put `{date}` in the title — it becomes the date the item is created, e.g. *Weekly deploy check — 2026-10-12*.

## Recurring work

A template can **repeat**:

- **Every weekday** (Monday to Friday),
- **Every week** on a chosen day,
- **Every month** on a chosen day (1–28).

Choose who it is **assigned to** and when it is **due** (for example 2 days after it is created). Team-Flex creates the item early that morning, with its checklist, and notifies the assignee. The template shows the **next date**; set *Repeat* back to *Never* to stop.

If the person who created the template leaves the project, the repetition stops — edit and save the template to restart it.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'work'), 'trash', 'Trash: restore what was deleted',
 'Deleted items, docs and projects can be restored for 30 days.', 'everyone', '/projects', 24, $md$
Deleting is not final any more: things go to the **Trash** and stay there for **30 days**. After that they are removed for good, with their comments and files.

## Work items and docs

**Project → Trash** (the link at the right of the project tabs) lists the items and doc pages deleted from the project, who deleted them and when.

- **Restore** — the item comes back exactly as it was: status, comments, files, history, checklist. Its sub-tasks come back with it.
- **Delete forever** — project admins only.

Project admins can restore anything; other people can restore what they deleted themselves.

A sub-task whose parent is still in the trash can't be restored on its own — restore the parent.

## Projects

Delete an **archived** project from its **Settings**. Organization admins find it under **[Projects](/projects) → Trash**, where it can be restored (it comes back archived) for 30 days.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'work'), 'project-docs', 'Project docs',
 'Specs, meeting notes and decisions, next to the work.', 'everyone', '/projects', 26, $md$
Every project has a **Docs** tab: pages written in markdown, organised in a tree (pages and sub-pages).

## Write

**Docs → New page**. Write with **Write / Preview**, and **Save**. Use it for:

- specifications and designs,
- meeting notes and decisions,
- how-tos for the team, onboarding, release steps.

Who can do what follows the project: **members** write, **viewers** read.

## History

Every save is kept. **History** shows who changed the page and when; open an older version and **Restore** it if needed.

If someone else saved the page while you were editing, Team-Flex tells you instead of overwriting their work — copy your text, reload, and apply your change again.

## Find

The search box above the page tree searches titles and text of every page in the project.

Deleted pages go to the [Trash](/guide/trash) for 30 days.
$md$),

((SELECT id FROM guide_sections WHERE slug = 'planning'), 'calendar', 'Calendar',
 'Due dates, sprints and who is away, month by month.', 'everyone', '/my-work', 15, $md$
## Project calendar

**Project → Calendar** shows a month:

- every item with a **due date** on its day (done items are faded),
- the **sprints** as bars across their dates,
- **who is away** and the **public holidays**.

**Drag an item to another day** to change its due date (if you can edit the project). Click an item to open it.

## My calendar

**[My Work](/my-work) → Calendar** shows the items assigned to you, across all projects, by due date.

> 💡 Items without a due date don't appear — give work a due date to see it here.
$md$)
ON CONFLICT (slug) DO NOTHING;


-- 4.3e Public website (Platform → Website) -------------------------------------
-- Starting content of the marketing pages. Inserted once (pages ON CONFLICT DO NOTHING, sections only for a page
-- that has none, the first "published" snapshot only when none exists) — the platform owner's edits are never overwritten.
INSERT INTO website_pages (slug, path, title, nav_label, show_in_nav, nav_order, seo_title, seo_description) VALUES
  ('home',     '/',         'Home',     'Home',     FALSE, 0,  'Team-Flex — plan, build, test and ship in one place',
     'Boards, sprints, bug tracking, test runs, production errors, leave and docs — connected in one product for teams that ship.'),
  ('features', '/features', 'Features', 'Features', TRUE,  10, 'Features — Team-Flex',
     'Planning, quality, people, docs, insights and security: every Team-Flex feature on one page.'),
  ('pricing',  '/pricing',  'Pricing',  'Pricing',  TRUE,  20, 'Pricing — Team-Flex',
     'Start free. Upgrade when your team grows. Simple plans with clear limits.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO website_sections (page_id, type, position, is_visible, content)
SELECT p.id, v.type, v.position, v.visible, v.content::jsonb
  FROM website_pages p
  JOIN (VALUES
  -- ---------------------------------------------------------------- home
  ('home', 'hero', 1, TRUE, $json${
    "autoplaySeconds": 7,
    "slides": [
      { "eyebrow": "Project management for teams that ship",
        "title": "Plan, build, test and ship — in one place",
        "subtitle": "Boards, sprints, bug tracking, test runs, production errors, leave and docs, connected. No more five tools that don't talk to each other.",
        "mediaId": null,
        "primaryCta": { "label": "Start free", "href": "/register" },
        "secondaryCta": { "label": "See all features", "href": "/features" } },
      { "eyebrow": "Quality built in",
        "title": "Every bug verified. Every release tested.",
        "subtitle": "A QA flow that checks every fix, test runs that file bugs for you, and production errors that become bugs in one click.",
        "mediaId": null,
        "primaryCta": { "label": "Start free", "href": "/register" },
        "secondaryCta": { "label": "How quality works", "href": "/features" } },
      { "eyebrow": "Your team, not just your tasks",
        "title": "Know who is available before you plan",
        "subtitle": "Leave, holidays and capacity are part of every sprint — so plans are realistic from day one.",
        "mediaId": null,
        "primaryCta": { "label": "Start free", "href": "/register" },
        "secondaryCta": { "label": "See pricing", "href": "/pricing" } }
    ]
  }$json$),
  ('home', 'stats', 2, TRUE, $json${
    "items": [
      { "value": "10+", "label": "modules in one product" },
      { "value": "1 click", "label": "from production error to bug" },
      { "value": "30 days", "label": "to restore anything deleted" },
      { "value": "Live", "label": "updates on every board" }
    ]
  }$json$),
  ('home', 'features_grid', 3, TRUE, $json${
    "title": "Everything your team needs, connected",
    "subtitle": "Work, quality and people live in one place — so nothing falls between tools.",
    "columns": 3,
    "items": [
      { "icon": "board", "title": "Boards & sprints", "text": "Kanban or Scrum, backlog, sprints with burndown and velocity, WIP limits." },
      { "icon": "bug", "title": "Bug tracking & QA", "text": "Severity, steps to reproduce, duplicate detection and a QA flow that verifies every fix." },
      { "icon": "experiment", "title": "Test cases & runs", "text": "Reusable test cases, step-by-step runs, and bugs filed straight from a failed step." },
      { "icon": "alert", "title": "Production errors", "text": "Server and browser crashes grouped by cause — turn one into a bug, see regressions." },
      { "icon": "calendar", "title": "Leave & capacity", "text": "Leave requests, holidays and sprint capacity that knows who is away." },
      { "icon": "file", "title": "Docs & calendar", "text": "Specs and meeting notes next to the work, and a calendar of every due date." },
      { "icon": "chart", "title": "Insights & reports", "text": "Project health, workload, quality and a weekly report for owners." },
      { "icon": "team", "title": "Teams & guests", "text": "Teams, managers, a people directory — and guests who see only their project." },
      { "icon": "safety", "title": "Roles & security", "text": "Custom roles, password and session rules, audit log and a trash for mistakes." }
    ]
  }$json$),
  ('home', 'feature_rows', 4, TRUE, $json${
    "items": [
      { "eyebrow": "Planning", "title": "Sprints that fit your team's real week",
        "text": "Plan in the backlog, drag work into sprints and see instantly if it fits — leave and holidays are already counted.",
        "bullets": ["Capacity per person and per team", "Burndown and velocity", "Recurring work created by itself"], "mediaId": null },
      { "eyebrow": "Quality", "title": "Fixed means verified",
        "text": "Developers move a bug to Ready for QA; QA passes or reopens it. Test runs and production errors feed straight into the same flow.",
        "bullets": ["QA verification flow", "Test runs with per-step results", "Errors grouped and linked to bugs"], "mediaId": null },
      { "eyebrow": "Insights", "title": "See the whole organization at a glance",
        "text": "Which projects need attention and why, who is overloaded, how quality is trending — and a weekly summary in your inbox.",
        "bullets": ["Project health with reasons", "Workload by person and team", "CSV export"], "mediaId": null }
    ]
  }$json$),
  ('home', 'logos', 5, FALSE, $json${
    "title": "Teams that ship with Team-Flex",
    "items": [ { "name": "Replace with a customer logo", "mediaId": null, "href": null } ]
  }$json$),
  ('home', 'testimonials', 6, FALSE, $json${
    "title": "What teams say",
    "items": [ { "quote": "Replace this with a real quote from a customer.", "name": "Customer name", "role": "Role", "company": "Company", "mediaId": null } ]
  }$json$),
  ('home', 'cta', 7, TRUE, $json${
    "title": "Start in minutes",
    "text": "Create your organization, invite your team and plan your first sprint today. The free plan needs no credit card.",
    "primaryCta": { "label": "Create your organization", "href": "/register" },
    "secondaryCta": { "label": "See pricing", "href": "/pricing" }
  }$json$),
  -- ---------------------------------------------------------------- features
  ('features', 'hero', 1, TRUE, $json${
    "autoplaySeconds": 0,
    "slides": [
      { "eyebrow": "Features", "title": "All the features. One product.",
        "subtitle": "From the first sprint to the last bug fix — planning, quality, people and insights work together.",
        "mediaId": null,
        "primaryCta": { "label": "Start free", "href": "/register" },
        "secondaryCta": { "label": "See pricing", "href": "/pricing" } }
    ]
  }$json$),
  ('features', 'feature_rows', 2, TRUE, $json${
    "items": [
      { "eyebrow": "Planning", "title": "Boards, backlog and sprints",
        "text": "Kanban, Scrum, bug tracking or your own workflow. Drag work across the board, plan sprints in the backlog and follow progress live.",
        "bullets": ["Board, list and saved views", "Sprints with burndown and velocity", "Capacity with leave and holidays", "Bulk edit and Ctrl + K search"], "mediaId": null },
      { "eyebrow": "Work items", "title": "Every detail of the work, in one item",
        "text": "Epics, stories, tasks, bugs and sub-tasks with checklists, comments, @mentions, attachments, links and full history.",
        "bullets": ["Checklists with progress on cards", "Templates for repeated work", "Work that repeats every weekday, week or month", "A trash to restore mistakes for 30 days"], "mediaId": null },
      { "eyebrow": "Quality", "title": "Bugs, QA, tests and production errors",
        "text": "A real QA flow: fixes are verified or reopened. Test cases run step by step, failures become bugs, and production errors are grouped and linked.",
        "bullets": ["Severity vs priority, steps to reproduce", "Duplicate detection while typing", "Test suites, runs and pass rates", "Regressions detected automatically"], "mediaId": null },
      { "eyebrow": "People", "title": "Teams, managers, leave and holidays",
        "text": "A people directory with teams and an org chart. Leave goes to the right manager, holidays come from calendars, and everyone sees who is away.",
        "bullets": ["Leave requests, approvals and balances", "Holiday calendars per office", "Team calendar", "My Work for everyone's day"], "mediaId": null },
      { "eyebrow": "Knowledge", "title": "Docs and calendar next to the work",
        "text": "Write specs, meeting notes and decisions in each project, with history and search. See due dates, sprints and absences on a calendar.",
        "bullets": ["Pages and sub-pages in markdown", "Version history and restore", "Drag items to reschedule", "Help Center inside the product"], "mediaId": null },
      { "eyebrow": "Administration", "title": "Roles, guests and security",
        "text": "Decide who can do what with roles and permissions, invite clients as guests who see only their project, and set password and session rules.",
        "bullets": ["Custom roles and permissions", "Guest access for clients", "Password and session rules", "Audit log of important actions"], "mediaId": null }
    ]
  }$json$),
  ('features', 'features_grid', 3, TRUE, $json${
    "title": "And much more",
    "subtitle": null,
    "columns": 3,
    "items": [
      { "icon": "thunder", "title": "Real-time", "text": "Changes by others appear without refreshing." },
      { "icon": "bell", "title": "Notifications", "text": "In the app and by email — instantly or as a daily digest." },
      { "icon": "dashboard", "title": "Dashboards", "text": "A personal dashboard and project reports with tables behind every chart." },
      { "icon": "search", "title": "Search everything", "text": "Ctrl + K finds any item, project or page." },
      { "icon": "help", "title": "Help Center", "text": "A built-in guide with a ? on every page." },
      { "icon": "moon", "title": "Dark mode", "text": "Light, dark or follow your system." }
    ]
  }$json$),
  ('features', 'cta', 4, TRUE, $json${
    "title": "See it with your own work",
    "text": "Create a free organization and bring your team — it takes a few minutes.",
    "primaryCta": { "label": "Start free", "href": "/register" },
    "secondaryCta": { "label": "See pricing", "href": "/pricing" }
  }$json$),
  -- ---------------------------------------------------------------- pricing
  ('pricing', 'pricing', 1, TRUE, $json${
    "title": "Simple pricing that grows with you",
    "subtitle": "Start free. Upgrade when your team grows. Limits come straight from each plan.",
    "showLimits": true,
    "plans": [
      { "planKey": "free", "priceLabel": "Free", "period": "forever", "description": "For small teams getting started.",
        "highlight": false, "badge": null,
        "features": ["Boards, backlog and sprints", "Bug tracking and QA flow", "Leave and holidays", "Help Center"],
        "cta": { "label": "Start free", "href": "/register" } },
      { "planKey": "pro", "priceLabel": "Set your price", "period": "per user / month", "description": "For growing teams that ship every week.",
        "highlight": true, "badge": "Most popular",
        "features": ["Everything in Free", "Test runs and production errors", "Organization insights and weekly report", "Guests for clients", "Docs, calendar and recurring work"],
        "cta": { "label": "Start free", "href": "/register" } },
      { "planKey": "enterprise", "priceLabel": "Custom", "period": null, "description": "For organizations with advanced needs.",
        "highlight": false, "badge": null,
        "features": ["Everything in Pro", "No limits", "Password and session rules", "Priority support"],
        "cta": { "label": "Get started", "href": "/register" } }
    ],
    "footnote": "Members and guests include pending invitations. Archived projects don't count towards the limit."
  }$json$),
  ('pricing', 'faq', 2, TRUE, $json${
    "title": "Questions about pricing",
    "items": [
      { "question": "Is there a free plan?", "answer": "Yes. The Free plan is free forever, with the limits shown above." },
      { "question": "What counts as a member?", "answer": "Everyone with full access to your organization, including pending invitations. Guests are counted separately." },
      { "question": "What is a guest?", "answer": "An outside collaborator — for example a client — who sees only the projects they are invited to." },
      { "question": "What happens when we reach a limit?", "answer": "Nothing stops working. You simply can't add more until you free a place or move to a bigger plan." },
      { "question": "Can we change plans later?", "answer": "Yes, at any time. Your data stays exactly where it is." }
    ]
  }$json$),
  ('pricing', 'cta', 3, TRUE, $json${
    "title": "Ready when you are",
    "text": "Create your organization in minutes.",
    "primaryCta": { "label": "Start free", "href": "/register" },
    "secondaryCta": null
  }$json$)
  ) AS v(slug, type, position, visible, content) ON v.slug = p.slug
 WHERE NOT EXISTS (SELECT 1 FROM website_sections s WHERE s.page_id = p.id);

-- first publish: the starting content is live until the platform owner publishes changes
UPDATE website_pages p
   SET published = jsonb_build_object(
         'title', p.title, 'navLabel', p.nav_label, 'showInNav', p.show_in_nav, 'navOrder', p.nav_order,
         'seoTitle', p.seo_title, 'seoDescription', p.seo_description,
         'sections', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'type', s.type, 'isVisible', s.is_visible, 'content', s.content)
                                       ORDER BY s.position, s.id)
                                 FROM website_sections s WHERE s.page_id = p.id), '[]'::jsonb)),
       published_at = NOW(), draft_updated_at = NOW()
 WHERE p.published IS NULL;

INSERT INTO website_settings (id, draft, published, published_at)
SELECT 1, c.content::jsonb, c.content::jsonb, NOW()
  FROM (VALUES ($json${
    "brandName": "Team-Flex",
    "logoMediaId": null,
    "announcement": { "enabled": true, "text": "New: project docs, calendar and recurring work are here.", "href": "/features" },
    "header": { "loginLabel": "Log in", "ctaLabel": "Start free", "ctaHref": "/register" },
    "footer": {
      "text": "Team-Flex is one place for your team's work, quality and people.",
      "columns": [
        { "title": "Product", "links": [ { "label": "Features", "href": "/features" }, { "label": "Pricing", "href": "/pricing" } ] },
        { "title": "Get started", "links": [ { "label": "Create an account", "href": "/register" }, { "label": "Log in", "href": "/login" } ] }
      ],
      "copyright": "© {year} Team-Flex. All rights reserved."
    }
  }$json$)) AS c(content)
ON CONFLICT (id) DO NOTHING;

-- 4.4 Public (platform) content --------------------------------------------
INSERT INTO site_content (organization_id, key, content)
SELECT NULL, 'home', '{
  "title": "Team-Flex",
  "subtitle": "Manage your team, projects, bugs and sprints in one place.",
  "features": [
    { "title": "Projects", "description": "Plan projects and assign members." },
    { "title": "Bug tracking", "description": "Report, triage and resolve issues." },
    { "title": "Sprints", "description": "Run sprints and track progress." }
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM site_content WHERE organization_id IS NULL AND key = 'home');


-- =====================================================================
-- 5. DATA MIGRATION  v1 (single-tenant) -> v2 (multi-tenant)
--    Runs only when the old user_roles table still exists, then drops it.
--    * former super_admin(s) become platform admins + owners of a default organization
--    * every existing user becomes a member of that organization with the same roles
--    * custom roles move into the organization; the dashboard announcement becomes its content
-- =====================================================================
DO $$
DECLARE
  v_owner INT;
  v_org   INT;
BEGIN
  IF to_regclass('public.user_roles') IS NULL THEN
    RETURN;
  END IF;

  UPDATE users SET is_platform_admin = TRUE
   WHERE id IN (SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'super_admin');

  SELECT MIN(id) INTO v_owner FROM users WHERE is_platform_admin;
  IF v_owner IS NULL THEN SELECT MIN(id) INTO v_owner FROM users; END IF;

  IF v_owner IS NOT NULL THEN
    INSERT INTO organizations (name, slug, created_by) VALUES ('Team-Flex', 'team-flex', v_owner)
    RETURNING id INTO v_org;

    -- custom (non-system) v1 roles move into the organization, keeping their permissions
    UPDATE roles SET organization_id = v_org
     WHERE organization_id IS NULL AND is_system = FALSE;

    -- copy the templates (+ their permissions) into the organization
    INSERT INTO roles (organization_id, name, display_name, description, is_system)
    SELECT v_org, name, display_name, description, TRUE FROM role_templates ORDER BY sort_order;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, tp.permission_id
      FROM roles r
      JOIN role_templates t ON t.name = r.name
      JOIN role_template_permissions tp ON tp.template_id = t.id
     WHERE r.organization_id = v_org
    ON CONFLICT DO NOTHING;

    -- memberships (account active flag -> membership status)
    INSERT INTO organization_members (organization_id, user_id, status)
    SELECT v_org, id, CASE WHEN is_active THEN 'active' ELSE 'inactive' END FROM users;

    -- same roles as before: super_admin -> owner, user -> member
    INSERT INTO member_roles (organization_id, user_id, role_id)
    SELECT v_org, ur.user_id, nr.id
      FROM user_roles ur
      JOIN roles o  ON o.id = ur.role_id
      JOIN roles nr ON nr.organization_id = v_org
                   AND nr.name = CASE o.name WHEN 'super_admin' THEN 'owner' WHEN 'user' THEN 'member' ELSE o.name END
    ON CONFLICT DO NOTHING;

    -- make sure the organization has an owner
    INSERT INTO member_roles (organization_id, user_id, role_id)
    SELECT v_org, v_owner, id FROM roles WHERE organization_id = v_org AND name = 'owner'
    ON CONFLICT DO NOTHING;

    UPDATE users        SET last_organization_id = v_org;
    UPDATE site_content SET organization_id = v_org WHERE key = 'dashboard' AND organization_id IS NULL;
    UPDATE audit_logs   SET organization_id = v_org WHERE organization_id IS NULL AND action NOT LIKE 'auth.%';
  END IF;

  DROP TABLE user_roles;
  DELETE FROM roles WHERE organization_id IS NULL;           -- v1 global roles, now replaced per organization
  -- v1 admin menus are replaced by the organization + platform menus below
  DELETE FROM menus WHERE key IN ('administration', 'admin_users', 'admin_roles', 'admin_menus', 'admin_content', 'admin_audit');

  RAISE NOTICE 'Upgraded to multi-tenant (default organization id: %)', v_org;
END $$;

-- v2.0 -> v2.1: templates used to be rows in "roles" with organization_id NULL.
-- They now live in role_templates (seeded above), so remove those rows and make
-- organization_id mandatory: every row in "roles" belongs to exactly one organization.
-- Permissions granted to the old template rows from the UI are kept on the new templates.
INSERT INTO role_template_permissions (template_id, permission_id)
SELECT t.id, rp.permission_id
  FROM roles r
  JOIN role_templates t    ON t.name = r.name
  JOIN role_permissions rp ON rp.role_id = r.id
 WHERE r.organization_id IS NULL
ON CONFLICT DO NOTHING;

DELETE FROM roles r
 WHERE r.organization_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM member_roles mr WHERE mr.role_id = r.id);
ALTER TABLE roles ALTER COLUMN organization_id SET NOT NULL;


-- =====================================================================
-- 6. SIDEBAR MENUS  (after the migration so old keys are gone)
-- =====================================================================

-- 6.1 Organization menus (visible inside the active organization, by permission)
INSERT INTO menus (key, label, path, icon, scope, parent_id, permission_id, sort_order) VALUES
  ('dashboard',    'Dashboard',    '/dashboard', 'dashboard', 'organization', NULL,
     (SELECT id FROM permissions WHERE name = 'dashboard.view'), 10),
  -- every member sees Projects; the list shows only projects they can access
  -- every member: their own to-do list across projects, and the people directory
  ('my_work',      'My Work',      '/my-work',   'checklist', 'organization', NULL, NULL, 15),
  ('projects',     'Projects',     '/projects',  'project',   'organization', NULL, NULL, 20),
  ('errors',       'Production Errors', '/errors', 'bug',     'organization', NULL,
     (SELECT id FROM permissions WHERE name = 'errors.read'), 30),
  ('leave',        'Leave',        NULL,         'calendar',  'organization', NULL, NULL, 40),
  ('people',       'People',       '/people',    'users',     'organization', NULL,
     (SELECT id FROM permissions WHERE name = 'people.view'), 50),
  ('organization', 'Organization', NULL,         'settings',  'organization', NULL, NULL, 80),
  ('guide',        'Help Center',  '/guide',     'help',      'organization', NULL,
     (SELECT id FROM permissions WHERE name = 'guide.view'), 90)
ON CONFLICT (key) DO NOTHING;

INSERT INTO menus (key, label, path, icon, scope, parent_id, permission_id, sort_order) VALUES
  ('org_insights', 'Insights',       '/org/insights',   'dashboard', 'organization', (SELECT id FROM menus WHERE key = 'organization'), (SELECT id FROM permissions WHERE name = 'insights.view'),      5),
  ('org_members',  'Members',        '/org/members',    'users',    'organization', (SELECT id FROM menus WHERE key = 'organization'), (SELECT id FROM permissions WHERE name = 'users.read'),          10),
  ('org_roles',    'Roles & Access', '/org/roles',      'shield',   'organization', (SELECT id FROM menus WHERE key = 'organization'), (SELECT id FROM permissions WHERE name = 'roles.read'),          20),
  ('org_content',  'Announcement',   '/org/content',    'file',     'organization', (SELECT id FROM menus WHERE key = 'organization'), (SELECT id FROM permissions WHERE name = 'content.manage'),      30),
  ('org_audit',    'Audit Log',      '/org/audit-logs', 'history',  'organization', (SELECT id FROM menus WHERE key = 'organization'), (SELECT id FROM permissions WHERE name = 'audit.read'),          40),
  ('org_settings', 'Settings',       '/org/settings',   'settings', 'organization', (SELECT id FROM menus WHERE key = 'organization'), (SELECT id FROM permissions WHERE name = 'organization.manage'), 50)
ON CONFLICT (key) DO NOTHING;

INSERT INTO menus (key, label, path, icon, scope, parent_id, permission_id, sort_order) VALUES
  ('leave_mine',      'My leave',         '/leave',           'user',     'organization', (SELECT id FROM menus WHERE key = 'leave'), (SELECT id FROM permissions WHERE name = 'leave.request'), 10),
  ('leave_calendar',  'Team calendar',    '/leave/calendar',  'calendar', 'organization', (SELECT id FROM menus WHERE key = 'leave'), (SELECT id FROM permissions WHERE name = 'leave.request'), 20),
  ('leave_approvals', 'Approvals',        '/leave/approvals', 'shield',   'organization', (SELECT id FROM menus WHERE key = 'leave'), (SELECT id FROM permissions WHERE name = 'leave.approve'), 30),
  ('org_leave',       'Leave & Holidays', '/org/leave',       'calendar', 'organization', (SELECT id FROM menus WHERE key = 'organization'), (SELECT id FROM permissions WHERE name = 'leave.manage'), 45)
ON CONFLICT (key) DO NOTHING;

-- 6.2 Platform menus (platform admins only)
INSERT INTO menus (key, label, path, icon, scope, parent_id, permission_id, sort_order) VALUES
  ('platform', 'Platform', NULL, 'platform', 'platform', NULL, NULL, 90)
ON CONFLICT (key) DO NOTHING;

INSERT INTO menus (key, label, path, icon, scope, parent_id, permission_id, sort_order) VALUES
  ('platform_overview', 'Overview',       '/platform',               'dashboard',    'platform', (SELECT id FROM menus WHERE key = 'platform'), NULL, 10),
  ('platform_orgs',     'Organizations',  '/platform/organizations', 'organization', 'platform', (SELECT id FROM menus WHERE key = 'platform'), NULL, 20),
  ('platform_users',    'All Users',      '/platform/users',         'users',        'platform', (SELECT id FROM menus WHERE key = 'platform'), NULL, 30),
  ('platform_menus',    'Menus',          '/platform/menus',         'menu',         'platform', (SELECT id FROM menus WHERE key = 'platform'), NULL, 40),
  ('platform_website',  'Website',        '/platform/website',       'platform',     'platform', (SELECT id FROM menus WHERE key = 'platform'), NULL, 50),
  ('platform_audit',    'Platform Audit', '/platform/audit-logs',    'history',      'platform', (SELECT id FROM menus WHERE key = 'platform'), NULL, 60),
  ('platform_mailbox',  'Mailbox',        '/platform/mailbox',       'mail',         'platform', (SELECT id FROM menus WHERE key = 'platform'), NULL, 70),
  ('platform_jobs',     'Background Jobs','/platform/jobs',          'jobs',         'platform', (SELECT id FROM menus WHERE key = 'platform'), NULL, 80),
  ('platform_errors',   'All Errors',     '/platform/errors',        'bug',          'platform', (SELECT id FROM menus WHERE key = 'platform'), NULL, 85),
  ('platform_guide',    'Help Content',   '/platform/guide',         'help',         'platform', (SELECT id FROM menus WHERE key = 'platform'), NULL, 55),
  ('platform_plans',    'Plans',          '/platform/plans',         'plan',         'platform', (SELECT id FROM menus WHERE key = 'platform'), NULL, 25)
ON CONFLICT (key) DO NOTHING;

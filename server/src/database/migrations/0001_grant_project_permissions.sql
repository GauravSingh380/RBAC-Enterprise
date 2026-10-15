-- Phase 2b — projects
-- New permissions projects.create / projects.manage_all were added to the Admin role TEMPLATE
-- in schema.sql. Templates only affect organizations created afterwards, so give them to the
-- Admin role of every EXISTING organization too. (Owners have every permission implicitly.)

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.name IN ('projects.create', 'projects.manage_all')
 WHERE r.name = 'admin' AND r.is_system = TRUE
ON CONFLICT DO NOTHING;

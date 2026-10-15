-- Phase 3b — organization insights
-- The new permission insights.view was added to the Admin role TEMPLATE in schema.sql. Templates only
-- affect organizations created afterwards, so give it to the Admin role of every EXISTING organization.
-- (Owners have every permission implicitly.)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.name = 'insights.view'
 WHERE r.name = 'admin' AND r.is_system = TRUE
ON CONFLICT DO NOTHING;

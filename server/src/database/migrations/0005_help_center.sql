-- Phase 3d — Help Center
-- The new permission guide.view was added to every role TEMPLATE in schema.sql. Templates only affect
-- organizations created afterwards, so give it to the system roles of every EXISTING organization.
-- Organization owners can remove it from a role later (Roles & Access) to hide the guide from that role.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.name = 'guide.view'
 WHERE r.is_system = TRUE AND r.name IN ('admin', 'qa', 'developer', 'member')
ON CONFLICT DO NOTHING;

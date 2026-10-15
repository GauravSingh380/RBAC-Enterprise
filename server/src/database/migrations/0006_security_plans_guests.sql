-- Phase 3e — security policy, plans, guest access
-- Templates only affect organizations created afterwards, so bring EXISTING organizations up to date.

-- 1. every organization gets the new "guest" system role (+ its template permissions)
INSERT INTO roles (organization_id, name, display_name, description, is_system)
SELECT o.id, t.name, t.display_name, t.description, TRUE
  FROM organizations o CROSS JOIN role_templates t
 WHERE t.name = 'guest'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, tp.permission_id
  FROM roles r
  JOIN role_templates t ON t.name = r.name AND t.name = 'guest'
  JOIN role_template_permissions tp ON tp.template_id = t.id
 WHERE r.is_system
ON CONFLICT DO NOTHING;

-- 2. the people directory now needs people.view: give it to the system roles that could see it before
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.name = 'people.view'
 WHERE r.is_system = TRUE AND r.name IN ('admin', 'qa', 'developer', 'member')
ON CONFLICT DO NOTHING;

-- 3. the People menu is shown by that permission
UPDATE menus SET permission_id = (SELECT id FROM permissions WHERE name = 'people.view')
 WHERE key = 'people' AND permission_id IS NULL;

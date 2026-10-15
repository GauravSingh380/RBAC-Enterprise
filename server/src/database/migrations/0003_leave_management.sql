-- Phase 2g — leave & holidays
--
-- 1. New permissions: leave.request for every system role, leave.approve / leave.manage for Admin
--    (templates only affect organizations created afterwards; owners have every permission implicitly).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.name = 'leave.request'
 WHERE r.is_system = TRUE AND r.name IN ('admin', 'qa', 'developer', 'member')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.name IN ('leave.approve', 'leave.manage')
 WHERE r.is_system = TRUE AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- 2. Every existing organization gets the default leave types (from leave_type_templates) ...
INSERT INTO leave_types (organization_id, name, color, is_paid, default_days, allow_half_day, requires_approval, position)
SELECT o.id, t.name, t.color, t.is_paid, t.default_days, t.allow_half_day, t.requires_approval, t.sort_order
  FROM organizations o CROSS JOIN leave_type_templates t
ON CONFLICT (organization_id, name) DO NOTHING;

-- 3. ... and a default holiday calendar (Saturday + Sunday off, holidays added by the admin)
INSERT INTO holiday_calendars (organization_id, name, weekend_days, is_default)
SELECT o.id, 'Default', '{0,6}', TRUE
  FROM organizations o
 WHERE NOT EXISTS (SELECT 1 FROM holiday_calendars c WHERE c.organization_id = o.id AND c.is_default);

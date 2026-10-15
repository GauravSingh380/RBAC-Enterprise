-- Phase 2f — bug flow, test cases, production errors
--
-- 1. New permissions errors.read / errors.manage were added to the Admin, QA and Developer role
--    TEMPLATES in schema.sql. Templates only affect organizations created afterwards, so give them
--    to the matching system roles of every EXISTING organization too.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.name IN ('errors.read', 'errors.manage')
 WHERE r.name IN ('admin', 'qa', 'developer') AND r.is_system = TRUE
ON CONFLICT DO NOTHING;

-- 2. Projects created from the "Bug tracking" template get the QA verification flow
--    (Ready for QA → Verified / Reopened) — only where those statuses still exist under these names
--    and nothing was configured yet.
UPDATE projects p
   SET qa_ready_status_id  = (SELECT s.id FROM project_statuses s WHERE s.project_id = p.id AND s.name = 'Ready for QA'),
       qa_passed_status_id = (SELECT s.id FROM project_statuses s WHERE s.project_id = p.id AND s.name = 'Verified'),
       qa_failed_status_id = (SELECT s.id FROM project_statuses s WHERE s.project_id = p.id AND s.name = 'Reopened')
 WHERE p.template = 'bug_tracking'
   AND p.qa_ready_status_id IS NULL AND p.qa_passed_status_id IS NULL AND p.qa_failed_status_id IS NULL;

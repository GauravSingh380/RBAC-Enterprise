-- Phase 4c — website: product tour, "how it works", richer contact page and footer
-- Adds content WITHOUT replacing what the platform owner wrote:
--   home    — "How it works" + "Product tour" after the feature grid (draft and published), once
--   contact — response time + "what happens next" merged into the contact form (the owner's values win)
--   footer  — new columns / buttons only if the footer still has the original starting columns

DO $$
DECLARE
  v_page  INT;
  v_after INT;
  v_ord   BIGINT;
  v_steps INT;
  v_tour  INT;
BEGIN
  SELECT id INTO v_page FROM website_pages WHERE slug = 'home';
  IF v_page IS NULL OR EXISTS (SELECT 1 FROM website_sections WHERE page_id = v_page AND type IN ('steps', 'showcase')) THEN
    RETURN;
  END IF;
  SELECT position INTO v_after FROM website_sections WHERE page_id = v_page AND type = 'features_grid' ORDER BY position LIMIT 1;
  v_after := COALESCE(v_after, 1);
  UPDATE website_sections SET position = position + 2 WHERE page_id = v_page AND position > v_after;
  INSERT INTO website_sections (page_id, type, position, content) VALUES (v_page, 'steps', v_after + 1, $json${
    "title": "From sign-up to shipping in four steps",
    "subtitle": "No consultants, no long setup. Most teams plan their first sprint on day one.",
    "items": [
      { "icon": "rocket", "title": "Create your organization", "text": "Sign up, name your workspace and start on the free plan — no credit card." },
      { "icon": "team", "title": "Invite your team", "text": "Add people with roles, set up teams and managers, and invite clients as guests." },
      { "icon": "board", "title": "Plan the work", "text": "Pick Kanban, Scrum or Bug tracking and plan your first sprint with everyone's availability in view." },
      { "icon": "check", "title": "Ship with confidence", "text": "QA verifies every fix, insights show what needs attention, and nothing deleted is lost for 30 days." }
    ],
    "cta": { "label": "Start free", "href": "/register" }
  }$json$::jsonb) RETURNING id INTO v_steps;
  INSERT INTO website_sections (page_id, type, position, content) VALUES (v_page, 'showcase', v_after + 2, $json${
    "eyebrow": "Product tour",
    "title": "See what your team will use every day",
    "subtitle": "One product instead of five tools. Click through the screens your team works in.",
    "tabs": [
      { "label": "Boards", "icon": "board", "mock": "board", "mediaId": null,
        "title": "Boards your team actually keeps up to date",
        "text": "Drag work across columns, keep work-in-progress under control and see changes from others appear live — no refresh, no status meetings.",
        "bullets": ["Kanban, Scrum and bug-tracking workflows", "Live updates for everyone on the board", "Saved views, filters and bulk edit"] },
      { "label": "Quality", "icon": "bug", "mock": "qa", "mediaId": null,
        "title": "A QA flow that proves every fix",
        "text": "Developers send a fixed bug to Ready for QA; QA verifies it or reopens it with a reason. Test runs file bugs from failed steps, and production errors become bugs in one click.",
        "bullets": ["Verified or reopened — never just \"done\"", "Test runs with per-step results", "Errors grouped and linked to bugs"] },
      { "label": "Docs", "icon": "file", "mock": "docs", "mediaId": null,
        "title": "Specs and decisions next to the work",
        "text": "Every project has its own docs: specifications, meeting notes and decisions, with full version history and search.",
        "bullets": ["Pages and sub-pages in markdown", "History — restore any version", "Search across all pages"] },
      { "label": "Calendar", "icon": "calendar", "mock": "calendar", "mediaId": null,
        "title": "Due dates, sprints and absences at a glance",
        "text": "See the month of a project — or just your own work — and drag an item to another day to reschedule it.",
        "bullets": ["Sprints as bands across their dates", "Who is away and public holidays", "Drag to change a due date"] },
      { "label": "People", "icon": "team", "mock": "leave", "mediaId": null,
        "title": "Leave, holidays and capacity built in",
        "text": "Leave requests go to the right manager, holiday calendars are per office, and sprint capacity already counts who is away.",
        "bullets": ["Requests, approvals and balances", "Team calendar for everyone", "Capacity per person and team"] },
      { "label": "Insights", "icon": "chart", "mock": "insights", "mediaId": null,
        "title": "The whole organization on one screen",
        "text": "Which projects need attention and why, who is overloaded, how quality is trending — plus a weekly summary in your inbox.",
        "bullets": ["Project health with reasons", "Workload by person and team", "Weekly report by email"] }
    ]
  }$json$::jsonb) RETURNING id INTO v_tour;

  -- the published page gets the same two sections at the same place (nothing else is published)
  SELECT t.ord INTO v_ord FROM website_pages p, jsonb_array_elements(p.published->'sections') WITH ORDINALITY AS t(e, ord)
   WHERE p.id = v_page AND t.e->>'type' = 'features_grid' ORDER BY t.ord LIMIT 1;
  UPDATE website_pages p
     SET published = jsonb_set(p.published, '{sections}', (
           SELECT jsonb_agg(x.e ORDER BY x.ord, x.sub)
             FROM (SELECT t.e, t.ord, 0 AS sub FROM jsonb_array_elements(p.published->'sections') WITH ORDINALITY AS t(e, ord)
                   UNION ALL
                   SELECT jsonb_build_object('id', s.id, 'type', s.type, 'isVisible', s.is_visible, 'content', s.content),
                          COALESCE(v_ord, 0), s.position
                     FROM website_sections s WHERE s.id IN (v_steps, v_tour)) x))
   WHERE p.id = v_page AND p.published IS NOT NULL;
END $$;

UPDATE website_sections SET content = $json${
    "responseTime": "Replies within 1 working day",
    "nextSteps": [
      "We read every message — a real person, no bots",
      "You get an answer by email, usually within one working day",
      "For a demo, we agree a time and show Team-Flex with your own use case"
    ]
  }$json$::jsonb || content, updated_at = NOW()
 WHERE type = 'contact_form' AND NOT content ? 'nextSteps';

UPDATE website_pages p
   SET published = jsonb_set(p.published, '{sections}', (
         SELECT jsonb_agg(CASE WHEN t.e->>'type' = 'contact_form' AND NOT (t.e->'content') ? 'nextSteps'
                               THEN jsonb_set(t.e, '{content}', $json${
    "responseTime": "Replies within 1 working day",
    "nextSteps": [
      "We read every message — a real person, no bots",
      "You get an answer by email, usually within one working day",
      "For a demo, we agree a time and show Team-Flex with your own use case"
    ]
  }$json$::jsonb || (t.e->'content'))
                               ELSE t.e END ORDER BY t.ord)
           FROM jsonb_array_elements(p.published->'sections') WITH ORDINALITY AS t(e, ord)))
 WHERE p.published IS NOT NULL
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.published->'sections') e WHERE e->>'type' = 'contact_form');

UPDATE website_settings
   SET draft = jsonb_set(draft || '{"social": []}'::jsonb, '{footer}', (draft->'footer') || $json${
      "text": "Team-Flex brings planning, quality and people together — so your team ships with confidence.",
      "primaryCta": { "label": "Start free", "href": "/register" },
      "secondaryCta": { "label": "Book a demo", "href": "/contact?type=demo" },
      "columns": [
        { "title": "Product", "links": [ { "label": "Features", "href": "/features" }, { "label": "Pricing", "href": "/pricing" }, { "label": "FAQ", "href": "/faq" } ] },
        { "title": "Company", "links": [ { "label": "Contact us", "href": "/contact" }, { "label": "Book a demo", "href": "/contact?type=demo" }, { "label": "Talk to sales", "href": "/contact?type=sales" } ] },
        { "title": "Get started", "links": [ { "label": "Create an account", "href": "/register" }, { "label": "Log in", "href": "/login" }, { "label": "Help Center", "href": "/guide" } ] }
      ],
      "copyright": "© {year} Team-Flex. All rights reserved."
    }$json$::jsonb)
 WHERE draft->'footer'->'columns' = $json$[{"title": "Product", "links": [{"label": "Features", "href": "/features"}, {"label": "Pricing", "href": "/pricing"}]}, {"title": "Get started", "links": [{"label": "Create an account", "href": "/register"}, {"label": "Log in", "href": "/login"}]}]$json$::jsonb;
UPDATE website_settings
   SET published = jsonb_set(published || '{"social": []}'::jsonb, '{footer}', (published->'footer') || $json${
      "text": "Team-Flex brings planning, quality and people together — so your team ships with confidence.",
      "primaryCta": { "label": "Start free", "href": "/register" },
      "secondaryCta": { "label": "Book a demo", "href": "/contact?type=demo" },
      "columns": [
        { "title": "Product", "links": [ { "label": "Features", "href": "/features" }, { "label": "Pricing", "href": "/pricing" }, { "label": "FAQ", "href": "/faq" } ] },
        { "title": "Company", "links": [ { "label": "Contact us", "href": "/contact" }, { "label": "Book a demo", "href": "/contact?type=demo" }, { "label": "Talk to sales", "href": "/contact?type=sales" } ] },
        { "title": "Get started", "links": [ { "label": "Create an account", "href": "/register" }, { "label": "Log in", "href": "/login" }, { "label": "Help Center", "href": "/guide" } ] }
      ],
      "copyright": "© {year} Team-Flex. All rights reserved."
    }$json$::jsonb)
 WHERE published->'footer'->'columns' = $json$[{"title": "Product", "links": [{"label": "Features", "href": "/features"}, {"label": "Pricing", "href": "/pricing"}]}, {"title": "Get started", "links": [{"label": "Create an account", "href": "/register"}, {"label": "Log in", "href": "/login"}]}]$json$::jsonb;

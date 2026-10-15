# Phase 3d — How it works (Help Center)

A short **learning guide** (previous: [3c](PHASE-3C.md)). Reference tables are in the [README](README.md).

## 1. Who does what

```
platform owner   writes the guide           /platform/guide   (platform admins)
org owner        decides which roles read it Roles & Access → "Read the Help Center" (guide.view)
everyone         reads it                   /guide  + the "?" next to page titles
```

The guide is **one** product guide for the whole platform — it is not copied into each organization. That keeps it
simple: fix a typo once, every organization sees it.

## 2. The model

```
guide_sections               slug, title, icon, position
guide_articles               section, slug, title, summary, body (markdown), app_path,
                             audience   everyone | admins
                             status     draft | published
                             visibility all | selected
                             search_vector  (generated column, GIN index)
guide_article_organizations  article ↔ organization   (used when visibility = selected)
organizations.getting_started_dismissed_at
```

## 3. Who sees an article — three questions, asked by the server

```sql
a.status = 'published'                                                         -- 1. not a draft
AND (a.visibility = 'all' OR EXISTS (… guide_article_organizations … = $org))  -- 2. for my organization
AND (a.audience = 'everyone' OR $isAdmin)                                      -- 3. for my role
```

`$isAdmin` = organization owner, or has `users.update` (the Admin role). The same `VISIBLE` condition is used for the
contents, one article, search and previous / next — so a hidden article can't leak through any of them.

## 4. Search without a search engine

Postgres does it. A **generated column** keeps the search data up to date by itself:

```sql
search_vector TSVECTOR GENERATED ALWAYS AS (
  setweight(to_tsvector('english', title),   'A') ||   -- a hit in the title counts most
  setweight(to_tsvector('english', summary), 'B') ||
  setweight(to_tsvector('english', body),    'C')) STORED
```

`websearch_to_tsquery` understands what people type (`leave -sick`, `"test run"`), "holidays" also finds "holiday"
(stemming), `ts_rank` orders the results and `ts_headline` cuts a snippet with the matches wrapped in `[[ ]]` — the
client turns those into `<mark>`. Full-text search does not match half words, so a `title ILIKE '%capac%'` fallback
helps while typing.

## 5. Starting content that you can still edit

The 21 starting articles are master data in `schema.sql`:

```sql
INSERT INTO guide_articles (…, slug, …) VALUES (…) ON CONFLICT (slug) DO NOTHING;
```

`db:init` runs on every deploy: a **new** article in the file appears, an article the platform owner **edited** is left
alone. Bodies use `$md$ … $md$` (dollar quoting), so apostrophes in the text need no escaping.

## 6. The "Getting started" checklist

No "mark as done" button — every step is a question to the real data:

| Step | Done when |
|---|---|
| Invite your team | more than one member, or an invitation was sent |
| Teams and managers | a team exists, or someone has a manager |
| Holidays | a holiday exists in any calendar |
| First project · Some work · A sprint | a project / work item / sprint exists |

So it can never be wrong, and it needs no extra table. Hiding it is one timestamp on the organization.

## 7. The "?" links

`PageHeader` got a `help` prop (an article slug); `HelpLink` renders the small "?" and hides itself without
`guide.view`. In a project the "?" follows the tab (board → *Board and list*, backlog → *Backlog and sprints*, …).
Links inside articles that start with `/` stay in the app (React Router); other links open a new tab.

## Hands-on

1. As the **platform admin**: Platform → **Help content** → open *Leave and holidays* → change a sentence → Save.
   Open `/guide/leave` in an organization → the change is there.
2. New article, leave **Published** off → organizations don't see it. Switch it on, choose **Only selected
   organizations** → only those see it.
3. As an organization owner: **Roles & Access** → Member → untick *Read the Help Center* → a member gets 403 on
   `/guide` and the "?" links disappear.
4. Search "holiday", "QA", "sprint".
5. New organization → the dashboard shows **Getting started 0 of 6**; create a project → it ticks itself.

## Where to look

`server/src/modules/guide/guide.service.ts` · `guide.routes.ts` · `server/src/database/schema.sql` (1j, 4.3d) ·
`client/src/pages/guide/HelpCenterPage.tsx` · `GettingStartedCard.tsx` · `client/src/pages/platform/GuideAdminPage.tsx` ·
`client/src/components/HelpLink.tsx` · tests: `server/tests/api/guide.test.ts`, `client/src/__tests__/guideMeta.test.ts`.

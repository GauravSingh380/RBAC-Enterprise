# Phase 3e — How it works (security rules, plans, guests)

A short **learning guide** (previous: [3d](PHASE-3D.md)). Reference tables are in the [README](README.md).
Organization owners read the same features explained for users in the Help Center: *Password and session rules*,
*Your plan and its limits*, *Guest access* and *Working as a guest*.

## 1. Password & session rules

```
organizations  password_min_length · password_require_symbol · session_idle_minutes · session_max_hours
users          password_change_required
refresh_tokens session_started_at        (created_at already = time of the last refresh)
```

**One account, many organizations.** Rules belong to organizations, but a password belongs to an account. So the
account follows the **strictest** rules of all its active memberships, computed in one query:

```sql
SELECT MAX(o.password_min_length), BOOL_OR(o.password_require_symbol),
       MIN(o.session_idle_minutes), MIN(o.session_max_hours)
  FROM organization_members m JOIN organizations o ON o.id = m.organization_id
 WHERE m.user_id = $1 AND m.status = 'active' AND o.status = 'active'
```

**When is a password checked?** The server only ever sees a password in plain text when someone types it, so:

| Moment | What happens |
|---|---|
| sign-up through an invitation · change · reset | must follow the rules, or 400 (sign-up is rolled back) |
| **sign-in** | too weak for today's rules → `password_change_required = true` |
| "Ask everyone to set a new password" | the flag for every other member |

While the flag is set, `authenticate` lets only `/api/auth/*` through; everything else answers
`403 PASSWORD_CHANGE_REQUIRED`. The client shows a "Choose a new password" screen instead of the app.

**Sessions** end on the next refresh, because that's where the server sees the session:

```
refresh token issued at (created_at)  = last activity   → older than session_idle_minutes → 401 SESSION_IDLE
session_started_at (kept on rotation) = sign-in time    → older than session_max_hours    → 401 SESSION_MAX
```

The browser only refreshes when it uses the API, so a quiet tab really is inactive. The access token (15 minutes)
still works until it expires, so the cut-off is precise to within those minutes. The sign-in page shows why.

## 2. Plans and limits

```
plans  key · name · max_members · max_guests · max_projects     (NULL = unlimited)
organizations.plan → plans.key
```

One function answers "may this organization grow?":

```ts
await assertWithinPlan(client, organizationId, 'members' | 'guests' | 'projects', adding = 1)
//  1. SELECT … FROM organizations WHERE id = $1 FOR UPDATE   ← two invitations can't take the last seat together
//  2. count: active members (+ pending invitations) / guests (+ pending) / active projects
//  3. used + adding > max  →  403 PLAN_LIMIT_REACHED  "Your Free plan includes 10 members; 10 are in use…"
```

It runs in the same transaction as the change. It is called on: invite, accept (with `adding = 0`, since the
invitation is already counted), re-activate, guest → member, create project, restore project.

**Nothing is ever deleted.** Lowering a plan only stops growth. Archived projects don't count, so archiving frees a
place.

Tests: `registerOwner()` puts test organizations on the unlimited plan, so only `plans.test.ts` sees limits.

## 3. Guests

A guest is an organization member with `is_guest = true` and the system **Guest** role (only `guide.view`).

| Where | Rule |
|---|---|
| `effectiveRole()` (every project API, realtime) | a guest gets **only** their project membership. No "viewer because the project is organization-visible", and never "admin of all projects", even if someone adds that permission to the Guest role |
| `ACCESSIBLE_PROJECT_SQL` (lists, My Work, dashboard) | same rule in SQL |
| `MEMBER_CAN_ACCESS_SQL` (assignee pickers, mentions, availability) | guests appear only in projects they belong to |
| `peopleVisibility()` | when the *viewer* is a guest, people lists show only the project's people |
| `people.view` | the directory, teams and org chart need it. Every role except Guest has it |
| roles | the Guest role can't be granted like other roles (`assertCanGrantRoles`), and a guest's roles can't be edited, so they're not escalated by accident |
| project admin | a guest can be a project member or viewer, never an admin |

Invitation: `{ email, projectId, projectRole }`. The inviter must administer the project. When accepted, the
membership becomes `is_guest`, the project membership is created, and the person lands on **My Work** (no
`dashboard.view`).

## Hands-on

1. **Settings → Security**: minimum 12, require a symbol. Sign in as a member whose password is `secret123`. You get
   the "Choose a new password" screen, and the API answers 403 for everything else.
2. Set **Sign out after inactivity: 30 minutes**. In the database, age your refresh token
   (`UPDATE refresh_tokens SET created_at = NOW() - INTERVAL '31 minutes' …`), reload the page, and you're signed out
   with the reason shown.
3. **Platform → Plans** → set Free to 2 members. Invite one person, then a second one: refused, with the reason.
   Revoke the first invitation: allowed again.
4. **Members → Invite → Guest** on a project. As the guest, you see that project only, there's no People menu, and
   the assignee picker lists only that project's people.
5. **Members → the guest → Make full member**.

## Where to look

`server/src/modules/security/` · `server/src/modules/plans/` · `server/src/modules/projects/project-access.ts`
(`effectiveRole`, `MEMBER_CAN_ACCESS_SQL`, `peopleVisibility`) · `invitations.service.ts` (`acceptInvitation`) ·
`common/middleware/auth.middleware.ts` · client: `pages/org/settings/SecuritySettingsCard.tsx`, `PlanUsageCard.tsx`,
`pages/org/members/InviteModal.tsx`, `pages/platform/PlansPage.tsx`, `pages/dashboard/PasswordChangeRequiredPage.tsx` ·
tests: `server/tests/api/security.test.ts`, `plans.test.ts`, `guests.test.ts`, `tests/unit/security-plans.test.ts`.

# Postman: every API, ready to run

One collection with **every endpoint of the server**: 446 requests in 22 folders. Each request has example payloads,
saved variables and a status check, so a full run covers both the happy paths and the error cases
(400 / 401 / 403 / 404 / 409).

| File | What it is |
|---|---|
| `Team-Flex.postman_collection.json` | the collection: import it |
| `Team-Flex.local.postman_environment.json` | the environment **Team-Flex · local**: import it too |
| `files/sample.png`, `files/sample.txt` | files used by the upload requests |

> The JSON is **generated**. Edit `server/scripts/postman/generate-postman.ts`, then run
> `npm run postman:generate` (in `server/`). Don't edit the JSON by hand.

## 1. Import (one time)

1. Postman → **Import** → drag in **both** JSON files.
2. In the top-right environment picker, select **Team-Flex · local**.
3. Optional, under **Settings → General → Working directory**: choose `docs/postman`, so the upload requests find
   `files/…`. Without it, pick a file in the request's **Body → form-data** yourself.

## 2. Run everything in one go

1. Start the API: `cd server && npm run dev` (port 5000).
2. Right-click the collection → **Run collection** → **Run Team-Flex API**.

The run takes about a minute.

**`00 · Setup` creates a fresh sandbox:**

* a new organization **Sandbox &lt;number&gt;**, with:
  * an **owner**: `owner.<n>@sandbox.test`
  * a **member**, who joins through an invitation
  * later, a **guest**: `guest.<n>@client.test`
* every account uses the password **`Sandbox@2026`**, so you can also log in to the web app as these people and see
  what the run created
* the run never touches your other organizations

**Every later request reuses what earlier ones saved:**

* tokens: `accessToken`, `memberToken`, `guestToken`, `platformToken`
* `orgId`, `projectKey`, `itemKey`, `sprintId`, `testRunId`, …

These are **collection variables**: open the collection → **Variables** to see them.

**Running it again:** each run creates a new sandbox. The server allows **20 sign-ins per 15 minutes per IP**, and one run
uses about 14, so a second run straight after the first gets `429 Too many attempts`. Either wait 15 minutes, restart
`npm run dev` (the counters live in memory), or put `RATE_LIMIT_DISABLED=true` in `server/.env`. That setting is for
local use only and is ignored in production.

## 3. Run single requests

Run **`00 · Setup`** once first. After that you can open any request and press **Send**. Access tokens last
15 minutes; once they are older than 13 minutes, the collection logs the sandbox people in again by itself before
the next request.

## 4. How auth works in the collection

| What | Where it comes from |
|---|---|
| `Authorization: Bearer {{accessToken}}` | set on the collection: the owner, by default |
| member / guest / platform requests | the request overrides it with `{{memberToken}}`, `{{guestToken}}` or `{{platformToken}}` |
| public requests (website, health, login) | auth "No Auth" |
| `X-Organization-Id` | added to every request by the collection's pre-request script (from `orgId`); a request can send its own header to override it |
| refresh token | httpOnly cookie `tf_refresh` (path `/api/auth`), kept by Postman's cookie jar. That's why **Refresh** works with no body |

## 5. The Platform folder (product owner)

`20 · Platform` needs a **platform admin**:

* **On an empty database** (the first account ever created) the sandbox owner *is* the platform admin, so the
  folder just runs.
* **On your normal database**, fill in `platformEmail` / `platformPassword` in the environment. Without them, the
  Platform requests are **skipped**, not failed.

Requests that **change the public website** are skipped unless `allowSiteChanges` is `true`. These are adding,
editing and deleting sections, saving settings, publishing and discarding. Leave it `false` on a database whose
website you care about.

The other platform requests clean up after themselves:

* a test plan, menu and Help Center section/article are created and then deleted
* the side organization is suspended and then reactivated

## 6. What is in each folder

| Folder | Covers |
|---|---|
| 00 Setup | health · register owner + organization · roles · invite → register member · login · optional platform login |
| 01 Auth & session | wrong password 401 · invalid e-mail 400 · duplicate 409 · weak password · password policy · no / bad token 401 · profile · refresh (cookie) · switch organization · forgot / reset password · change password |
| 02 Organization & security | current org · rename · plan usage · password & session policy (+ out of range 400, member 403) · second organization · "last owner can't leave" |
| 03 Members, invitations, roles | permission catalog · custom role (duplicate 409, bad slug 400, member 403) · role permissions · members (search, roles, deactivate → blocked → reactivate, can't remove yourself) · invitations (create, revoke, already a member 409, unknown token 404) |
| 04 People & teams | directory · job title + manager (own manager 400) · teams CRUD + members |
| 05 Projects & settings | scrum / bug_tracking / kanban projects · invalid key, duplicate key, unknown template · list / filter · archive / restore · project members & roles · statuses (create, WIP limit, reorder, delete) · labels · custom fields |
| 06 Work items | epic → story (every field, custom field, checklist) → task / subtask · bugs with bug fields · parent rules (400) · filters, search, similar, bulk · move / rank · history · watch · comments + reactions (someone else's comment 403) · links (blocks, relates, self-link 400) · checklist · attachments (multipart) · QA flow (not ready 409 → Ready for QA → fail → pass) · close as duplicate · delete → trash |
| 07 Sprints, capacity & reports | create / plan / start (second active sprint 409) · capacity (150% → 400) · availability · burndown, velocity, quality, overview · complete → open items to the next sprint · project calendar |
| 08 Saved views | create shared board view · update · delete |
| 09 QA tests | suites · cases with steps linked to a story · run over all cases · per-step results · bug from a failed result · complete / reopen (completed run 409) |
| 10 Production errors | simulate a server error (500) · browser error report · inbox filters · ignore / reopen · bug from error · link to a bug |
| 11 Leave & holidays | leave types, holiday calendars, bulk holiday text, balances · member requests (preview, overlap 409, end before start 400) · approve / reject (needs a reason) / cancel · team calendar |
| 12 Notifications | list · unread · mark read / unread / all · preferences |
| 13 My work, dashboard & insights | my work · my calendar · dashboard · insights + CSV exports · weekly report e-mail · member 403 |
| 14 Docs | page tree · child pages · search · edit with `baseUpdatedAt` · stale edit **409 PAGE_CHANGED** · versions + restore |
| 15 Templates | weekly / monthly / plain templates · invalid repeat 400 |
| 16 Trash | restore item · delete page forever · archive → delete project → restore → delete forever |
| 17 Guests | invite a guest to one project · guest sees only that project · 403 / 404 elsewhere · make the guest a member |
| 18 Help Center, audit, content, realtime | guide, search, articles, getting started · audit log · announcement · realtime ticket |
| 19 Public website | site, pages, 404 · contact form (demo request, bot → spam, too short 400) |
| 20 Platform | stats · organizations (plan, suspend) · users · plans · menus · Help Center editor · errors · mailbox + resend · jobs · inquiries (note, reply, spam) · media upload (non-image 400) · pages / sections / settings (only with `allowSiteChanges`) |
| 99 Sessions & clean-up | "role still in use" 409 · require a new password → member blocked **403 PASSWORD_CHANGE_REQUIRED** → change password · logout → refresh 401 · logout everywhere |

**Not in the run:** the event stream `GET /realtime/stream?ticket=…`. It never ends, so it would hang the
runner. Get a ticket with **Realtime ticket**, then open the stream URL in a browser tab, or in Postman as a new
**SSE** request.

## 7. How it was checked

The collection was run with **newman** (Postman's command-line runner) against a separate server on port 5055, using a
throwaway database that was dropped afterwards. It passed in all four situations:

| Situation | Requests | Assertions | Failed |
|---|---|---|---|
| empty database | 445 | 451 | 0 |
| existing data, without a platform admin | 378 | 384 | 0 |
| existing data, with platform credentials | 433 | 439 | 0 |
| two runs back to back (`RATE_LIMIT_DISABLED=true`) | 445 + 378 | 451 + 384 | 0 |

You can run it the same way from a terminal:

```bash
npx newman run docs/postman/Team-Flex.postman_collection.json \
  -e docs/postman/Team-Flex.local.postman_environment.json --working-dir docs/postman
```

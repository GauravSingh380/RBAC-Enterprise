# Phase 4a — How it works (public website)

A short **learning guide** (previous: [3f](PHASE-3F.md)). Reference tables are in the [README](README.md).

## 1. A separate module

The website does not touch the app's features. Everything lives in two folders:

```
server/src/modules/website/
  website.sections.ts   section types: Zod schema + starting content per type, header & footer schema
  website.service.ts    reading (visitors), editing, publish / discard, images
  website.routes.ts     publicWebsiteRouter (/api/website) · platformWebsiteRouter (/api/platform/website)

client/src/website/
  routes.tsx            the only thing the app's router imports (public routes + the editor route)
  public/               WebsiteLayout (announcement, header, footer) · WebsitePage (sections + <title>)
  sections/             one component per section type + parts (buttons, images, drawn product preview)
  admin/                WebsiteAdminPage · PageEditor · SectionEditor (a form per type) · SettingsEditor · MediaLibrary
  api.ts types.ts websiteMeta.ts iconMap.ts website.css
```

The app knows about the module in exactly four places: `routes.ts` (server), `platform.routes.ts` (server),
`router.tsx` (client), and the "Website" menu row in `schema.sql`. The old "Platform → Home Page" was removed
(migration `0007`).

## 2. A page is a list of sections

```
website_pages     slug · path · title · menu label · in menu · order · SEO title / description
                  published (JSONB snapshot) · published_at · draft_updated_at
website_sections  page · type · position · is_visible · content (JSONB, shape depends on the type)
```

Each type has a **Zod schema** on the server (`SECTION_SCHEMAS`) and a **renderer** plus a **form** on the client.
Adding a new type later takes three small steps: a schema and starting content (server), a renderer (client
`sections/`), and a form (client `admin/SectionEditor.tsx`).

## 3. Draft → publish

```
editor ──PATCH──▶ website_sections        (the draft; draft_updated_at = now → "unpublished changes")
          Publish ──▶ website_pages.published = { meta…, sections: [...] }   (one JSONB snapshot)
visitor ──GET────▶ website_pages.published (only visible sections)
          Discard ──▶ sections are rebuilt from the snapshot
```

Visitors **never** read the draft tables, so a half-edited page can't leak. The header & footer work the same way with
`website_settings.draft` / `.published`.

## 4. Pricing from Plans

The pricing section stores only what is marketing: the price label, period, badge, features and button, per plan
key. When the page is served, `withPlans()` adds the **live** plan (name, limits) from the `plans` table. Changing a
limit in Platform → Plans updates the pricing page immediately, without publishing, and a deleted plan simply
disappears from it.

## 5. Safety

* **Links:** only `/path`, `https://…`, `mailto:` or `#anchor`. `javascript:` and `data:` are refused on the
  server, and the client form checks the same rule.
* **Markdown:** text and FAQ answers are rendered without raw HTML.
* **Images:**
  * Only PNG, JPG, WebP and GIF, checked by their **first bytes**, not just the file name. An HTML file renamed to
    `.png` is refused.
  * They are served with `Content-Security-Policy: default-src 'none'` and `immutable` caching, because a new upload
    gets a new id.
  * An image can't be deleted while any draft, published snapshot or the header uses it. A JSON path search finds
    every `mediaId` in the stored content.

## 6. Starting content

The pages start with real copy about Team-Flex (master data in `schema.sql`, inserted once). The testimonials and
logo sections start **hidden**, with placeholder text: publishing invented customer quotes as if they were real
would mislead visitors. The Pro price starts as "Set your price"; the platform owner fills it in.

## Hands-on

1. Open `/`, `/features`, `/pricing` logged out. Switch dark mode, then make the window narrow (phone).
2. **Platform → Website → Home**:
   * **Edit** the hero, add a slide and upload an image. The preview updates.
   * Open `/` in another tab: nothing changed yet.
   * **Publish**, then reload `/`.
3. Drag the "Numbers" section above the hero. Click **Discard** and the order comes back.
4. **Platform → Plans**: change Free's member limit, then reload `/pricing`. The limit is already updated.
5. **Images**: try to delete an image that a slide uses. It's refused until you remove it from the slide and publish.

## Where to look

`server/src/modules/website/*` · `client/src/website/*` · tests: `server/tests/api/website.test.ts`,
`client/src/__tests__/website.test.ts`.

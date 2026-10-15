// Public website: pages made of sections, header & footer, images.
//   visitors read the PUBLISHED snapshot only · the platform owner edits the draft, previews it and publishes
//   pricing sections get the live plan limits (Platform → Plans) added when the page is served
import crypto from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { BadRequestException, ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { storage } from '../../common/storage/storage.js';
import { audit } from '../../common/utils/audit.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { collectMediaIds, parseSectionContent, SECTION_DEFAULTS, SECTION_TYPES, settingsSchema, type SectionType, type WebsiteSettings } from './website.sections.js';

export const IMAGE_TYPES: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
export const MAX_IMAGE_MB = 5;

export const pageMetaSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    navLabel: z.string().trim().max(40).nullable(),
    showInNav: z.boolean(),
    navOrder: z.number().int().min(0).max(1000),
    seoTitle: z.string().trim().max(70).nullable(),
    seoDescription: z.string().trim().max(170).nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export const addSectionSchema = z.object({ type: z.enum(SECTION_TYPES), afterId: z.number().int().positive().nullable().optional() });
export const updateSectionSchema = z
  .object({ content: z.unknown().optional(), isVisible: z.boolean().optional() })
  .refine((d) => d.content !== undefined || d.isVisible !== undefined, { message: 'Nothing to update' });
export const orderSchema = z.object({ ids: z.array(z.number().int().positive()).max(100) });
export const mediaUpdateSchema = z.object({ altText: z.string().trim().max(255).nullable() });

export interface Section {
  id: number;
  type: SectionType;
  isVisible: boolean;
  content: Record<string, unknown>;
}
export interface PlanInfo {
  key: string;
  name: string;
  description: string | null;
  limits: { members: number | null; guests: number | null; projects: number | null };
}

const META = `p.slug, p.path, p.title, p.nav_label AS "navLabel", p.show_in_nav AS "showInNav", p.nav_order AS "navOrder",
              p.seo_title AS "seoTitle", p.seo_description AS "seoDescription"`;

async function plans(): Promise<PlanInfo[]> {
  const { rows } = await db.query<PlanInfo>(
    `SELECT key, name, description, json_build_object('members', max_members, 'guests', max_guests, 'projects', max_projects) AS limits
       FROM plans ORDER BY sort_order, key`,
  );
  return rows;
}

/** Pricing sections show the live limits of the plans they mention (a deleted plan simply disappears). */
async function withPlans(sections: Section[]): Promise<Section[]> {
  if (!sections.some((s) => s.type === 'pricing')) return sections;
  const all = await plans();
  return sections.map((s) => {
    if (s.type !== 'pricing') return s;
    const cards = ((s.content.plans as { planKey: string }[]) ?? [])
      .map((c) => ({ ...c, plan: all.find((p) => p.key === c.planKey) ?? null }))
      .filter((c) => c.plan);
    return { ...s, content: { ...s.content, plans: cards } };
  });
}

async function assertMediaExist(value: unknown, executor: Queryable = db) {
  const ids = [...collectMediaIds(value)];
  if (!ids.length) return;
  const { rows } = await executor.query<{ id: number }>('SELECT id FROM website_media WHERE id = ANY($1::int[])', [ids]);
  const missing = ids.filter((id) => !rows.some((r) => r.id === id));
  if (missing.length) throw new BadRequestException(`Image #${missing[0]} does not exist — pick one from the media library`);
}

const touch = (executor: Queryable, pageId: number) => executor.query('UPDATE website_pages SET draft_updated_at = NOW() WHERE id = $1', [pageId]);

export class WebsiteService {
  // ---------------------------------------------------------------- public (visitors)

  /** Header, footer and the navigation (published). */
  async site() {
    const [settings, nav] = await Promise.all([
      db.query<{ published: WebsiteSettings | null }>('SELECT published FROM website_settings WHERE id = 1'),
      db.query<{ path: string; label: string }>(
        `SELECT p.path, COALESCE(p.published->>'navLabel', p.published->>'title') AS label
           FROM website_pages p
          WHERE p.published IS NOT NULL AND (p.published->>'showInNav')::boolean
          ORDER BY (p.published->>'navOrder')::int, p.id`,
      ),
    ]);
    return { settings: settings.rows[0]?.published ?? null, nav: nav.rows };
  }

  /** One page as visitors see it: the published snapshot, visible sections only. */
  async publishedPage(slug: string) {
    const { rows } = await db.query<{ path: string; published: { title: string; seoTitle: string | null; seoDescription: string | null; sections: Section[] } | null }>(
      'SELECT path, published FROM website_pages WHERE slug = $1',
      [slug],
    );
    const page = rows[0];
    if (!page?.published) throw new NotFoundException('Page not found');
    const { sections, ...meta } = page.published;
    return { slug, path: page.path, ...meta, sections: await withPlans(sections.filter((s) => s.isVisible)) };
  }

  async mediaFile(id: number) {
    const { rows } = await db.query<{ storageKey: string; mimeType: string; sizeBytes: number }>(
      'SELECT storage_key AS "storageKey", mime_type AS "mimeType", size_bytes AS "sizeBytes" FROM website_media WHERE id = $1',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Image not found');
    return { ...rows[0], stream: await storage.read(rows[0].storageKey) };
  }

  // ---------------------------------------------------------------- editing (platform owner)

  async pages() {
    const { rows } = await db.query(
      `SELECT ${META}, p.published_at AS "publishedAt", u.name AS "publishedBy",
              (p.published_at IS NULL OR p.draft_updated_at > p.published_at) AS "hasChanges",
              (SELECT COUNT(*)::int FROM website_sections s WHERE s.page_id = p.id) AS sections
         FROM website_pages p LEFT JOIN users u ON u.id = p.published_by
        ORDER BY p.nav_order, p.id`,
    );
    return rows;
  }

  /** The draft of a page (+ the plans, for the pricing editor and the preview). */
  async draftPage(slug: string) {
    const page = await this.pageRow(slug);
    const { rows } = await db.query<Section>(
      `SELECT id, type, is_visible AS "isVisible", content FROM website_sections WHERE page_id = $1 ORDER BY position, id`,
      [page.id],
    );
    return { ...page, sections: rows, previewSections: await withPlans(rows.filter((s) => s.isVisible)), plans: await plans() };
  }

  async updateMeta(slug: string, dto: z.infer<typeof pageMetaSchema>, ctx: RequestContext) {
    const page = await this.pageRow(slug);
    await db.query(
      `UPDATE website_pages SET
          title = COALESCE($2, title),
          nav_label = CASE WHEN $3::boolean THEN $4 ELSE nav_label END,
          show_in_nav = COALESCE($5, show_in_nav),
          nav_order = COALESCE($6, nav_order),
          seo_title = CASE WHEN $7::boolean THEN $8 ELSE seo_title END,
          seo_description = CASE WHEN $9::boolean THEN $10 ELSE seo_description END,
          draft_updated_at = NOW()
        WHERE id = $1`,
      [page.id, dto.title ?? null, dto.navLabel !== undefined, dto.navLabel ?? null, dto.showInNav ?? null, dto.navOrder ?? null,
       dto.seoTitle !== undefined, dto.seoTitle ?? null, dto.seoDescription !== undefined, dto.seoDescription ?? null],
    );
    await audit(ctx, { action: 'website.page_update', entity: 'website_page', entityId: slug, details: dto, organizationId: null });
    return this.draftPage(slug);
  }

  async addSection(slug: string, type: SectionType, afterId: number | null | undefined, ctx: RequestContext) {
    const page = await this.pageRow(slug);
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>('SELECT id FROM website_sections WHERE page_id = $1 ORDER BY position, id FOR UPDATE', [page.id]);
      const ids = rows.map((r) => r.id);
      const { rows: created } = await client.query<{ id: number }>(
        'INSERT INTO website_sections (page_id, type, content) VALUES ($1, $2, $3) RETURNING id',
        [page.id, type, JSON.stringify(SECTION_DEFAULTS[type])],
      );
      const at = afterId && ids.includes(afterId) ? ids.indexOf(afterId) + 1 : ids.length;
      ids.splice(at, 0, created[0]!.id);
      await renumber(client, ids);
      await touch(client, page.id);
      await audit(ctx, { action: 'website.section_add', entity: 'website_page', entityId: slug, details: { type }, organizationId: null }, client);
    });
    return this.draftPage(slug);
  }

  async updateSection(id: number, dto: z.infer<typeof updateSectionSchema>, ctx: RequestContext) {
    const section = await this.sectionRow(id);
    const content = dto.content !== undefined ? parseSectionContent(section.type, dto.content) : undefined;
    if (content) await assertMediaExist(content);
    await db.query(
      `UPDATE website_sections SET content = COALESCE($2, content), is_visible = COALESCE($3, is_visible), updated_at = NOW() WHERE id = $1`,
      [id, content ? JSON.stringify(content) : null, dto.isVisible ?? null],
    );
    await touch(db, section.pageId);
    await audit(ctx, { action: 'website.section_update', entity: 'website_section', entityId: id, details: { type: section.type, visible: dto.isVisible }, organizationId: null });
    return this.draftPage(section.slug);
  }

  async duplicateSection(id: number, ctx: RequestContext) {
    const section = await this.sectionRow(id);
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>('SELECT id FROM website_sections WHERE page_id = $1 ORDER BY position, id FOR UPDATE', [section.pageId]);
      const ids = rows.map((r) => r.id);
      const { rows: copy } = await client.query<{ id: number }>(
        `INSERT INTO website_sections (page_id, type, is_visible, content) SELECT page_id, type, is_visible, content FROM website_sections WHERE id = $1 RETURNING id`,
        [id],
      );
      ids.splice(ids.indexOf(id) + 1, 0, copy[0]!.id);
      await renumber(client, ids);
      await touch(client, section.pageId);
      await audit(ctx, { action: 'website.section_duplicate', entity: 'website_section', entityId: id, organizationId: null }, client);
    });
    return this.draftPage(section.slug);
  }

  async deleteSection(id: number, ctx: RequestContext) {
    const section = await this.sectionRow(id);
    await db.query('DELETE FROM website_sections WHERE id = $1', [id]);
    await touch(db, section.pageId);
    await audit(ctx, { action: 'website.section_delete', entity: 'website_section', entityId: id, details: { type: section.type }, organizationId: null });
    return this.draftPage(section.slug);
  }

  async reorder(slug: string, ids: number[], ctx: RequestContext) {
    const page = await this.pageRow(slug);
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>('SELECT id FROM website_sections WHERE page_id = $1 FOR UPDATE', [page.id]);
      const current = new Set(rows.map((r) => r.id));
      if (ids.length !== current.size || !ids.every((i) => current.has(i))) throw new BadRequestException('Send every section of the page once');
      await renumber(client, ids);
      await touch(client, page.id);
    });
    await audit(ctx, { action: 'website.section_reorder', entity: 'website_page', entityId: slug, organizationId: null });
    return this.draftPage(slug);
  }

  /** The draft becomes what visitors see. */
  async publish(slug: string, ctx: RequestContext) {
    const page = await this.pageRow(slug);
    await db.query(
      `UPDATE website_pages p
          SET published = jsonb_build_object(
                'title', p.title, 'navLabel', p.nav_label, 'showInNav', p.show_in_nav, 'navOrder', p.nav_order,
                'seoTitle', p.seo_title, 'seoDescription', p.seo_description,
                'sections', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'type', s.type, 'isVisible', s.is_visible, 'content', s.content)
                                              ORDER BY s.position, s.id)
                                        FROM website_sections s WHERE s.page_id = p.id), '[]'::jsonb)),
              published_at = NOW(), published_by = $2, draft_updated_at = NOW() - INTERVAL '1 millisecond'
        WHERE p.id = $1`,
      [page.id, ctx.user!.id],
    );
    await audit(ctx, { action: 'website.publish', entity: 'website_page', entityId: slug, organizationId: null });
    return this.draftPage(slug);
  }

  /** Throws away unpublished changes: the draft goes back to what is published. */
  async discard(slug: string, ctx: RequestContext) {
    const page = await this.pageRow(slug);
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ published: { title: string; navLabel: string | null; showInNav: boolean; navOrder: number; seoTitle: string | null; seoDescription: string | null; sections: Section[] } | null }>(
        'SELECT published FROM website_pages WHERE id = $1 FOR UPDATE',
        [page.id],
      );
      const pub = rows[0]?.published;
      if (!pub) throw new BadRequestException('This page has never been published');
      await client.query('DELETE FROM website_sections WHERE page_id = $1', [page.id]);
      for (const [i, s] of pub.sections.entries()) {
        await client.query('INSERT INTO website_sections (page_id, type, position, is_visible, content) VALUES ($1, $2, $3, $4, $5)', [
          page.id, s.type, i + 1, s.isVisible, JSON.stringify(s.content),
        ]);
      }
      await client.query(
        `UPDATE website_pages SET title = $2, nav_label = $3, show_in_nav = $4, nav_order = $5, seo_title = $6, seo_description = $7,
                draft_updated_at = published_at WHERE id = $1`,
        [page.id, pub.title, pub.navLabel, pub.showInNav, pub.navOrder, pub.seoTitle, pub.seoDescription],
      );
      // the new rows got new ids: the snapshot refers to them from now on
      await client.query(
        `UPDATE website_pages p SET published = jsonb_set(p.published, '{sections}', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'type', s.type, 'isVisible', s.is_visible, 'content', s.content)
                ORDER BY s.position, s.id) FROM website_sections s WHERE s.page_id = p.id), '[]'::jsonb)) WHERE p.id = $1`,
        [page.id],
      );
    });
    await audit(ctx, { action: 'website.discard', entity: 'website_page', entityId: slug, organizationId: null });
    return this.draftPage(slug);
  }

  // ---------------------------------------------------------------- header & footer

  async settingsDraft() {
    const { rows } = await db.query(
      `SELECT draft, published, published_at AS "publishedAt", (published_at IS NULL OR draft_updated_at > published_at) AS "hasChanges"
         FROM website_settings WHERE id = 1`,
    );
    if (!rows[0]) throw new NotFoundException('Website settings are missing — run db:init');
    return rows[0];
  }

  async saveSettings(body: unknown, ctx: RequestContext) {
    const draft = settingsSchema.parse(body);
    await assertMediaExist(draft);
    await db.query('UPDATE website_settings SET draft = $1, draft_updated_at = NOW() WHERE id = 1', [JSON.stringify(draft)]);
    await audit(ctx, { action: 'website.settings_update', entity: 'website', entityId: 'settings', organizationId: null });
    return this.settingsDraft();
  }

  async publishSettings(ctx: RequestContext) {
    await db.query('UPDATE website_settings SET published = draft, published_at = NOW(), published_by = $1, draft_updated_at = NOW() - INTERVAL \'1 millisecond\' WHERE id = 1', [ctx.user!.id]);
    await audit(ctx, { action: 'website.settings_publish', entity: 'website', entityId: 'settings', organizationId: null });
    return this.settingsDraft();
  }

  // ---------------------------------------------------------------- media library

  async media() {
    const { rows } = await db.query(
      `SELECT m.id, m.file_name AS "fileName", m.mime_type AS "mimeType", m.size_bytes AS "sizeBytes", m.alt_text AS "altText",
              m.created_at AS "createdAt", u.name AS "uploadedBy"
         FROM website_media m LEFT JOIN users u ON u.id = m.uploaded_by ORDER BY m.created_at DESC, m.id DESC`,
    );
    return rows;
  }

  async upload(file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined, ctx: RequestContext) {
    if (!file) throw new BadRequestException('Choose an image');
    const ext = IMAGE_TYPES[file.mimetype];
    if (!ext || !looksLikeImage(file.buffer, file.mimetype)) throw new BadRequestException('Only PNG, JPG, WebP or GIF images');
    const now = new Date();
    const key = `website/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}${ext}`;
    await storage.save(key, file.buffer);
    const name = path.basename(file.originalname).slice(0, 255) || `image${ext}`;
    const { rows } = await db.query<{ id: number }>(
      'INSERT INTO website_media (storage_key, file_name, mime_type, size_bytes, uploaded_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [key, name, file.mimetype, file.size, ctx.user!.id],
    );
    await audit(ctx, { action: 'website.media_upload', entity: 'website_media', entityId: rows[0]!.id, details: { name }, organizationId: null });
    return (await this.media()).find((m) => (m as { id: number }).id === rows[0]!.id);
  }

  async updateMedia(id: number, altText: string | null, ctx: RequestContext) {
    const { rowCount } = await db.query('UPDATE website_media SET alt_text = $2 WHERE id = $1', [id, altText]);
    if (!rowCount) throw new NotFoundException('Image not found');
    await audit(ctx, { action: 'website.media_update', entity: 'website_media', entityId: id, organizationId: null });
    return (await this.media()).find((m) => (m as { id: number }).id === id);
  }

  /** Only images no page (draft or published) and no header uses. */
  async deleteMedia(id: number, ctx: RequestContext) {
    const vars = JSON.stringify({ id });
    const { rows } = await db.query<{ used: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM website_sections WHERE jsonb_path_exists(content, '$.**.mediaId ? (@ == $id)', $1::jsonb))
           OR EXISTS (SELECT 1 FROM website_pages WHERE jsonb_path_exists(published, '$.**.mediaId ? (@ == $id)', $1::jsonb))
           OR EXISTS (SELECT 1 FROM website_settings
                       WHERE jsonb_path_exists(draft, '$.logoMediaId ? (@ == $id)', $1::jsonb)
                          OR jsonb_path_exists(COALESCE(published, '{}'::jsonb), '$.logoMediaId ? (@ == $id)', $1::jsonb)) AS used`,
      [vars],
    );
    if (rows[0]!.used) throw new ConflictException('This image is used on the website (or in a published version) — replace it there first');
    const { rows: gone } = await db.query<{ storageKey: string }>('DELETE FROM website_media WHERE id = $1 RETURNING storage_key AS "storageKey"', [id]);
    if (!gone[0]) throw new NotFoundException('Image not found');
    await storage.remove(gone[0].storageKey).catch(() => undefined);
    await audit(ctx, { action: 'website.media_delete', entity: 'website_media', entityId: id, organizationId: null });
  }

  // ---------------------------------------------------------------- helpers

  private async pageRow(slug: string) {
    const { rows } = await db.query<{ id: number; slug: string; path: string; title: string; navLabel: string | null; showInNav: boolean; navOrder: number;
      seoTitle: string | null; seoDescription: string | null; publishedAt: Date | null; hasChanges: boolean }>(
      `SELECT p.id, ${META}, p.published_at AS "publishedAt", (p.published_at IS NULL OR p.draft_updated_at > p.published_at) AS "hasChanges"
         FROM website_pages p WHERE p.slug = $1`,
      [slug],
    );
    if (!rows[0]) throw new NotFoundException('Page not found');
    return rows[0];
  }

  private async sectionRow(id: number) {
    const { rows } = await db.query<{ type: SectionType; pageId: number; slug: string }>(
      'SELECT s.type, s.page_id AS "pageId", p.slug FROM website_sections s JOIN website_pages p ON p.id = s.page_id WHERE s.id = $1',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Section not found');
    return rows[0];
  }
}

async function renumber(client: Queryable, ids: number[]) {
  await client.query(
    'UPDATE website_sections s SET position = t.n FROM unnest($1::int[]) WITH ORDINALITY AS t(id, n) WHERE s.id = t.id',
    [ids],
  );
}

/** The file really is the image type it claims (magic bytes), not e.g. HTML renamed to .png. */
function looksLikeImage(buf: Buffer, mime: string): boolean {
  const hex = buf.subarray(0, 12).toString('hex');
  switch (mime) {
    case 'image/png':
      return hex.startsWith('89504e47');
    case 'image/jpeg':
      return hex.startsWith('ffd8ff');
    case 'image/gif':
      return hex.startsWith('47494638');
    case 'image/webp':
      return hex.startsWith('52494646') && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    default:
      return false;
  }
}

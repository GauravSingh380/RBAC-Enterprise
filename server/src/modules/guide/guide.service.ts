// Help Center — the product guide.
//   * the PLATFORM OWNER writes it (sections + markdown articles, draft / published, all or selected organizations)
//   * every organization READS it (permission guide.view — owners can take it away from a role)
//   * articles with audience "admins" are shown only to owners and people with users.update
//   * "Getting started" checklist for owners / admins, ticked from real data
import { z } from 'zod';
import { db, withTransaction } from '../../database/db.js';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';

const UNIQUE_VIOLATION = '23505';
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, digits and dashes').max(80);
const appPath = z.string().trim().regex(/^\/[\w\-/?=&.]*$/, 'An app path such as /leave').max(200);

export const sectionSchema = z.object({
  slug: slug.max(60),
  title: z.string().trim().min(1).max(100),
  icon: z.string().trim().max(30).nullable().optional(),
  position: z.number().int().min(0).max(10000).optional(),
});
export const updateSectionSchema = sectionSchema.partial().refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

// no defaults here: a PATCH must only change what it sends
const articleFields = z.object({
  sectionId: z.number().int().positive(),
  slug,
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(300).nullable().optional(),
  body: z.string().max(100_000),
  audience: z.enum(['everyone', 'admins']),
  appPath: appPath.nullable().optional(),
  position: z.number().int().min(0).max(10000).optional(),
  status: z.enum(['draft', 'published']),
  visibility: z.enum(['all', 'selected']),
  organizationIds: z.array(z.number().int().positive()).max(1000).optional(),
});
export const articleSchema = articleFields.extend({
  audience: articleFields.shape.audience.default('everyone'),
  status: articleFields.shape.status.default('draft'),
  visibility: articleFields.shape.visibility.default('all'),
});
export const updateArticleSchema = articleFields.partial().refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const searchQuery = z.object({ q: z.string().trim().min(2, 'Type at least 2 characters').max(100) });

export interface GuideArticleSummary {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  audience: 'everyone' | 'admins';
  appPath: string | null;
}
export interface GuideSection {
  id: number;
  slug: string;
  title: string;
  icon: string | null;
  articles: GuideArticleSummary[];
}

/** owners and member managers (Admin role by default) see the "admins" articles and the checklist */
function isAdmin(ctx: RequestContext): boolean {
  const t = tenantOf(ctx);
  return t.isOwner || t.permissions.includes(PERMISSIONS.USERS_UPDATE);
}

// What a reader of organization $1 may see ($2 = is admin). Articles alias: a
const VISIBLE = `
  a.status = 'published'
  AND (a.visibility = 'all' OR EXISTS (SELECT 1 FROM guide_article_organizations go WHERE go.article_id = a.id AND go.organization_id = $1))
  AND (a.audience = 'everyone' OR $2::boolean)`;

const ARTICLE_FIELDS = `a.id, a.slug, a.title, a.summary, a.audience, a.app_path AS "appPath"`;

export class GuideService {
  // ---------------------------------------------------------------- reading (organization)

  /** The table of contents: sections (in order) with the articles this reader may see. Empty sections are left out. */
  async contents(ctx: RequestContext): Promise<GuideSection[]> {
    const { rows } = await db.query<GuideSection>(
      `SELECT s.id, s.slug, s.title, s.icon,
              json_agg(json_build_object('id', a.id, 'slug', a.slug, 'title', a.title, 'summary', a.summary,
                                         'audience', a.audience, 'appPath', a.app_path) ORDER BY a.position, a.id) AS articles
         FROM guide_sections s
         JOIN guide_articles a ON a.section_id = s.id AND ${VISIBLE}
        GROUP BY s.id
        ORDER BY s.position, s.id`,
      [tenantOf(ctx).organizationId, isAdmin(ctx)],
    );
    return rows;
  }

  /** One article (markdown body) + previous / next in reading order. */
  async article(articleSlug: string, ctx: RequestContext) {
    const { rows } = await db.query<GuideArticleSummary & { body: string; updatedAt: Date; section: { slug: string; title: string } }>(
      `SELECT ${ARTICLE_FIELDS}, a.body, a.updated_at AS "updatedAt", json_build_object('slug', s.slug, 'title', s.title) AS section
         FROM guide_articles a JOIN guide_sections s ON s.id = a.section_id
        WHERE ${VISIBLE}
        ORDER BY s.position, s.id, a.position, a.id`,
      [tenantOf(ctx).organizationId, isAdmin(ctx)],
    );
    const i = rows.findIndex((r) => r.slug === articleSlug);
    if (i < 0) throw new NotFoundException('Article not found');
    const link = (r: (typeof rows)[number] | undefined) => (r ? { slug: r.slug, title: r.title } : null);
    return { ...rows[i], previous: link(rows[i - 1]), next: link(rows[i + 1]) };
  }

  /** Full-text search (title weighs most, then summary, then body) + a title "contains" fallback for partial words. */
  async search(q: string, ctx: RequestContext) {
    const { rows } = await db.query<GuideArticleSummary & { snippet: string; section: string }>(
      `SELECT ${ARTICLE_FIELDS}, s.title AS section,
              ts_headline('english', regexp_replace(a.body, '[#*>\`_\\[\\]()]', '', 'g'), websearch_to_tsquery('english', $3),
                          'StartSel=[[, StopSel=]], MaxFragments=1, MaxWords=24, MinWords=10') AS snippet
         FROM guide_articles a JOIN guide_sections s ON s.id = a.section_id
        WHERE ${VISIBLE}
          AND (a.search_vector @@ websearch_to_tsquery('english', $3) OR a.title ILIKE '%' || $4 || '%')
        ORDER BY ts_rank(a.search_vector, websearch_to_tsquery('english', $3)) DESC, a.title
        LIMIT 20`,
      [tenantOf(ctx).organizationId, isAdmin(ctx), q, q.replace(/[\\%_]/g, '\\$&')],
    );
    return rows;
  }

  // ---------------------------------------------------------------- getting started (owners / admins)

  async gettingStarted(ctx: RequestContext) {
    if (!isAdmin(ctx)) return { visible: false as const };
    const orgId = tenantOf(ctx).organizationId;
    const { rows } = await db.query<Record<string, boolean | Date | null>>(
      `SELECT o.getting_started_dismissed_at AS "dismissedAt",
              (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = o.id AND m.status = 'active') > 1
                OR EXISTS (SELECT 1 FROM invitations i WHERE i.organization_id = o.id AND i.revoked_at IS NULL)  AS invite,
              EXISTS (SELECT 1 FROM teams t WHERE t.organization_id = o.id)
                OR EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = o.id AND m.manager_id IS NOT NULL) AS teams,
              EXISTS (SELECT 1 FROM holidays h WHERE h.organization_id = o.id)                         AS holidays,
              EXISTS (SELECT 1 FROM projects p WHERE p.organization_id = o.id)                         AS project,
              EXISTS (SELECT 1 FROM work_items w WHERE w.organization_id = o.id)                       AS "workItem",
              EXISTS (SELECT 1 FROM sprints sp WHERE sp.organization_id = o.id)                        AS sprint
         FROM organizations o WHERE o.id = $1`,
      [orgId],
    );
    const r = rows[0]!;
    const steps = [
      { key: 'invite', title: 'Invite your team', description: 'Add people and give each a role.', done: !!r.invite, path: '/org/members', article: 'setup-organization' },
      { key: 'teams', title: 'Create teams and set managers', description: 'Managers approve their people\'s leave.', done: !!r.teams, path: '/people', article: 'people-and-teams' },
      { key: 'holidays', title: 'Add your public holidays', description: 'Leave and capacity skip them.', done: !!r.holidays, path: '/org/leave', article: 'leave-and-holiday-setup' },
      { key: 'project', title: 'Create your first project', description: 'Pick a template: Kanban, Scrum or Bug tracking.', done: !!r.project, path: '/projects', article: 'first-project' },
      { key: 'workItem', title: 'Add some work', description: 'Create a story, task or bug.', done: !!r.workItem, path: '/projects', article: 'work-items' },
      { key: 'sprint', title: 'Plan a sprint (optional)', description: 'For Scrum teams: plan the next two weeks.', done: !!r.sprint, path: '/projects', article: 'backlog-and-sprints' },
    ];
    return { visible: true as const, dismissed: r.dismissedAt !== null, completed: steps.filter((s) => s.done).length, total: steps.length, steps };
  }

  async setGettingStartedDismissed(dismissed: boolean, ctx: RequestContext) {
    await db.query(`UPDATE organizations SET getting_started_dismissed_at = ${dismissed ? 'NOW()' : 'NULL'} WHERE id = $1`, [tenantOf(ctx).organizationId]);
    return this.gettingStarted(ctx);
  }

  // ---------------------------------------------------------------- authoring (platform owner)

  /** Everything, drafts included, with the selected organizations of each article (no bodies — load one to edit). */
  async adminContents() {
    const { rows } = await db.query(
      `SELECT s.id, s.slug, s.title, s.icon, s.position,
              COALESCE(json_agg(json_build_object(
                'id', a.id, 'slug', a.slug, 'title', a.title, 'summary', a.summary, 'audience', a.audience, 'appPath', a.app_path,
                'position', a.position, 'status', a.status, 'visibility', a.visibility, 'updatedAt', a.updated_at,
                'organizationIds', (SELECT COALESCE(array_agg(go.organization_id ORDER BY go.organization_id), '{}')
                                      FROM guide_article_organizations go WHERE go.article_id = a.id))
                ORDER BY a.position, a.id) FILTER (WHERE a.id IS NOT NULL), '[]') AS articles
         FROM guide_sections s LEFT JOIN guide_articles a ON a.section_id = s.id
        GROUP BY s.id ORDER BY s.position, s.id`,
    );
    return rows;
  }

  async adminArticle(id: number) {
    const { rows } = await db.query(
      `SELECT a.id, a.section_id AS "sectionId", a.slug, a.title, a.summary, a.body, a.audience, a.app_path AS "appPath",
              a.position, a.status, a.visibility, a.updated_at AS "updatedAt", u.name AS "updatedBy",
              (SELECT COALESCE(array_agg(go.organization_id ORDER BY go.organization_id), '{}')
                 FROM guide_article_organizations go WHERE go.article_id = a.id) AS "organizationIds"
         FROM guide_articles a LEFT JOIN users u ON u.id = a.updated_by WHERE a.id = $1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Article not found');
    return rows[0];
  }

  async createSection(dto: z.infer<typeof sectionSchema>, ctx: RequestContext) {
    try {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO guide_sections (slug, title, icon, position)
         VALUES ($1, $2, $3, COALESCE($4, (SELECT COALESCE(MAX(position), 0) + 10 FROM guide_sections))) RETURNING id`,
        [dto.slug, dto.title, dto.icon ?? null, dto.position ?? null],
      );
      await audit(ctx, { action: 'guide.section.create', entity: 'guide_section', entityId: rows[0]!.id, details: { slug: dto.slug }, organizationId: null });
      return { id: rows[0]!.id };
    } catch (err) {
      throw uniqueSlug(err);
    }
  }

  async updateSection(id: number, dto: z.infer<typeof updateSectionSchema>, ctx: RequestContext) {
    try {
      const { rowCount } = await db.query(
        `UPDATE guide_sections SET slug = COALESCE($2, slug), title = COALESCE($3, title),
                icon = CASE WHEN $4::boolean THEN $5 ELSE icon END, position = COALESCE($6, position)
          WHERE id = $1`,
        [id, dto.slug ?? null, dto.title ?? null, dto.icon !== undefined, dto.icon ?? null, dto.position ?? null],
      );
      if (!rowCount) throw new NotFoundException('Section not found');
    } catch (err) {
      throw uniqueSlug(err);
    }
    await audit(ctx, { action: 'guide.section.update', entity: 'guide_section', entityId: id, organizationId: null });
  }

  /** Only empty sections can be deleted — articles are never removed by accident. */
  async deleteSection(id: number, ctx: RequestContext) {
    const { rows } = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM guide_articles WHERE section_id = $1`, [id]);
    if (rows[0]!.n > 0) throw new ConflictException('Move or delete the articles of this section first');
    const { rowCount } = await db.query(`DELETE FROM guide_sections WHERE id = $1`, [id]);
    if (!rowCount) throw new NotFoundException('Section not found');
    await audit(ctx, { action: 'guide.section.delete', entity: 'guide_section', entityId: id, organizationId: null });
  }

  async createArticle(dto: z.infer<typeof articleSchema>, ctx: RequestContext) {
    const id = await withTransaction(async (client) => {
      try {
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO guide_articles (section_id, slug, title, summary, body, audience, app_path, position, status, visibility, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7,
                   COALESCE($8, (SELECT COALESCE(MAX(position), 0) + 10 FROM guide_articles WHERE section_id = $1)), $9, $10, $11)
           RETURNING id`,
          [dto.sectionId, dto.slug, dto.title, dto.summary ?? null, dto.body, dto.audience, dto.appPath ?? null,
           dto.position ?? null, dto.status, dto.visibility, ctx.user!.id],
        );
        const articleId = rows[0]!.id;
        await setOrganizations(client, articleId, dto.organizationIds ?? []);
        await audit(ctx, { action: 'guide.article.create', entity: 'guide_article', entityId: articleId, details: { slug: dto.slug, status: dto.status }, organizationId: null }, client);
        return articleId;
      } catch (err) {
        throw sectionOrSlug(err);
      }
    });
    return this.adminArticle(id);
  }

  async updateArticle(id: number, dto: z.infer<typeof updateArticleSchema>, ctx: RequestContext) {
    await withTransaction(async (client) => {
      const set: string[] = [];
      const values: unknown[] = [id];
      const col = (name: string, value: unknown) => {
        values.push(value);
        set.push(`${name} = $${values.length}`);
      };
      if (dto.sectionId !== undefined) col('section_id', dto.sectionId);
      if (dto.slug !== undefined) col('slug', dto.slug);
      if (dto.title !== undefined) col('title', dto.title);
      if (dto.summary !== undefined) col('summary', dto.summary);
      if (dto.body !== undefined) col('body', dto.body);
      if (dto.audience !== undefined) col('audience', dto.audience);
      if (dto.appPath !== undefined) col('app_path', dto.appPath);
      if (dto.position !== undefined) col('position', dto.position);
      if (dto.status !== undefined) col('status', dto.status);
      if (dto.visibility !== undefined) col('visibility', dto.visibility);
      col('updated_by', ctx.user!.id);
      try {
        const { rowCount } = await client.query(`UPDATE guide_articles SET ${set.join(', ')}, updated_at = NOW() WHERE id = $1`, values);
        if (!rowCount) throw new NotFoundException('Article not found');
      } catch (err) {
        throw sectionOrSlug(err);
      }
      if (dto.organizationIds !== undefined) await setOrganizations(client, id, dto.organizationIds);
      const changed = Object.keys(dto).filter((k) => k !== 'body');
      await audit(ctx, { action: 'guide.article.update', entity: 'guide_article', entityId: id, details: { changed: dto.body !== undefined ? [...changed, 'body'] : changed }, organizationId: null }, client);
    });
    return this.adminArticle(id);
  }

  async deleteArticle(id: number, ctx: RequestContext) {
    const { rows } = await db.query<{ slug: string }>(`DELETE FROM guide_articles WHERE id = $1 RETURNING slug`, [id]);
    if (!rows[0]) throw new NotFoundException('Article not found');
    await audit(ctx, { action: 'guide.article.delete', entity: 'guide_article', entityId: id, details: { slug: rows[0].slug }, organizationId: null });
  }
}

async function setOrganizations(client: { query: typeof db.query }, articleId: number, organizationIds: number[]) {
  await client.query(`DELETE FROM guide_article_organizations WHERE article_id = $1`, [articleId]);
  if (organizationIds.length === 0) return;
  // unknown organization ids are ignored (the JOIN drops them)
  await client.query(
    `INSERT INTO guide_article_organizations (article_id, organization_id)
     SELECT $1, o.id FROM organizations o WHERE o.id = ANY($2::int[]) ON CONFLICT DO NOTHING`,
    [articleId, organizationIds],
  );
}

function uniqueSlug(err: unknown): unknown {
  return (err as { code?: string }).code === UNIQUE_VIOLATION ? new ConflictException('This slug is already used') : err;
}

function sectionOrSlug(err: unknown): unknown {
  if ((err as { code?: string }).code === '23503') return new NotFoundException('Section not found');
  return uniqueSlug(err);
}

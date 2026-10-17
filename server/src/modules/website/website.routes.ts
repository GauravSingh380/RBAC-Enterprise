// Public website
//   /api/website (anyone, no login)          GET /site · GET /pages/:slug · GET /media/:id · POST /inquiries (contact form)
//   /api/platform/website (platform admins)  pages, sections, publish / discard, header & footer, media library
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { createRateLimiter } from '../../common/middleware/rate-limit.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import {
  addSectionSchema, MAX_IMAGE_MB, mediaUpdateSchema, orderSchema, pageMetaSchema, updateSectionSchema, WebsiteService,
} from './website.service.js';
import { InquiriesService, inquirySchema, listInquiriesQuery, replySchema, updateInquirySchema } from './website.inquiries.js';

const website = new WebsiteService();
const inquiries = new InquiriesService();
// the contact form: a handful of messages per visitor per 15 minutes
const contactLimiter = createRateLimiter(15, 5, 'Too many messages — please try again in a few minutes');
const slug = (v: unknown) => z.string().regex(/^[a-z0-9-]{1,60}$/, 'Invalid page').parse(v);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024, files: 1 } });

// ---------------------------------------------------------------- public
export const publicWebsiteRouter = Router();

publicWebsiteRouter.get('/site', async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ success: true, data: await website.site() });
});
publicWebsiteRouter.get('/pages/:slug', async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ success: true, data: await website.publishedPage(slug(req.params.slug)) });
});
publicWebsiteRouter.get('/media/:id', async (req, res) => {
  const file = await website.mediaFile(parseId(req.params.id));
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.sizeBytes));
  // an image never changes (a new upload = a new id), so browsers may keep it
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  file.stream.pipe(res);
});

publicWebsiteRouter.post('/inquiries', contactLimiter, validateBody(inquirySchema), async (req, res) => {
  await inquiries.submit(req.body, getContext(req));
  res.status(201).json({ success: true });
});

// ---------------------------------------------------------------- platform (mounted in platform.routes.ts after requirePlatformAdmin)
export const platformWebsiteRouter = Router();

platformWebsiteRouter.get('/pages', async (_req, res) => {
  res.json({ success: true, data: await website.pages() });
});
platformWebsiteRouter.get('/pages/:slug', async (req, res) => {
  res.json({ success: true, data: await website.draftPage(slug(req.params.slug)) });
});
platformWebsiteRouter.patch('/pages/:slug', validateBody(pageMetaSchema), async (req, res) => {
  res.json({ success: true, data: await website.updateMeta(slug(req.params.slug), req.body, getContext(req)) });
});
platformWebsiteRouter.post('/pages/:slug/sections', validateBody(addSectionSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await website.addSection(slug(req.params.slug), req.body.type, req.body.afterId, getContext(req)) });
});
platformWebsiteRouter.put('/pages/:slug/sections/order', validateBody(orderSchema), async (req, res) => {
  res.json({ success: true, data: await website.reorder(slug(req.params.slug), req.body.ids, getContext(req)) });
});
platformWebsiteRouter.post('/pages/:slug/publish', async (req, res) => {
  res.json({ success: true, data: await website.publish(slug(req.params.slug), getContext(req)) });
});
platformWebsiteRouter.post('/pages/:slug/discard', async (req, res) => {
  res.json({ success: true, data: await website.discard(slug(req.params.slug), getContext(req)) });
});
platformWebsiteRouter.patch('/sections/:id', validateBody(updateSectionSchema), async (req, res) => {
  res.json({ success: true, data: await website.updateSection(parseId(req.params.id), req.body, getContext(req)) });
});
platformWebsiteRouter.post('/sections/:id/duplicate', async (req, res) => {
  res.status(201).json({ success: true, data: await website.duplicateSection(parseId(req.params.id), getContext(req)) });
});
platformWebsiteRouter.delete('/sections/:id', async (req, res) => {
  res.json({ success: true, data: await website.deleteSection(parseId(req.params.id), getContext(req)) });
});

platformWebsiteRouter.get('/settings', async (_req, res) => {
  res.json({ success: true, data: await website.settingsDraft() });
});
platformWebsiteRouter.put('/settings', async (req, res) => {
  res.json({ success: true, data: await website.saveSettings(req.body, getContext(req)) });
});
platformWebsiteRouter.post('/settings/publish', async (req, res) => {
  res.json({ success: true, data: await website.publishSettings(getContext(req)) });
});

// contact form inbox
platformWebsiteRouter.get('/inquiries', async (req, res) => {
  res.json({ success: true, data: await inquiries.list(listInquiriesQuery.parse(req.query)) });
});
platformWebsiteRouter.get('/inquiries/:id', async (req, res) => {
  res.json({ success: true, data: await inquiries.get(parseId(req.params.id)) });
});
platformWebsiteRouter.patch('/inquiries/:id', validateBody(updateInquirySchema), async (req, res) => {
  res.json({ success: true, data: await inquiries.update(parseId(req.params.id), req.body, getContext(req)) });
});
platformWebsiteRouter.post('/inquiries/:id/reply', validateBody(replySchema), async (req, res) => {
  res.json({ success: true, data: await inquiries.reply(parseId(req.params.id), req.body, getContext(req)) });
});
platformWebsiteRouter.delete('/inquiries/:id', async (req, res) => {
  await inquiries.remove(parseId(req.params.id), getContext(req));
  res.json({ success: true });
});

platformWebsiteRouter.get('/media', async (_req, res) => {
  res.json({ success: true, data: await website.media() });
});
platformWebsiteRouter.post('/media', upload.single('file'), async (req, res) => {
  res.status(201).json({ success: true, data: await website.upload(req.file, getContext(req)) });
});
platformWebsiteRouter.patch('/media/:id', validateBody(mediaUpdateSchema), async (req, res) => {
  res.json({ success: true, data: await website.updateMedia(parseId(req.params.id), req.body.altText, getContext(req)) });
});
platformWebsiteRouter.delete('/media/:id', async (req, res) => {
  await website.deleteMedia(parseId(req.params.id), getContext(req));
  res.json({ success: true });
});

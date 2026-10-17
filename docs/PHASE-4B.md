# Phase 4b — How it works (Contact + Inquiries, FAQ, Privacy / Terms)

A short **learning guide** (previous: [4a](PHASE-4A.md)). Reference tables are in the [README](README.md).
Everything stays inside the website module: `server/src/modules/website/website.inquiries.ts`,
`client/src/website/sections/ContactForm.tsx`, `client/src/website/admin/InquiriesInbox.tsx`.

## 1. Four new pages, no new machinery

FAQ, Privacy and Terms are ordinary pages made of existing sections (FAQ groups, text, call to action). Contact adds
**one** new section type, `contact_form`, registered the same three ways as every type:

1. a schema and starting content on the server
2. a renderer
3. a form in the editor

The legal pages are written as **templates with [placeholders]** and are **not published** on purpose: the seed
publishes Contact and FAQ, but skips `privacy` and `terms`. Visitors get a 404 until the platform owner has reviewed
the text and clicked Publish.

A new page setting, **"In the footer links"**, puts published pages at the bottom of every page. That's how Privacy
and Terms appear without editing the footer by hand.

## 2. From the form to the inbox

```
visitor ──POST /api/website/inquiries──▶ rate limit (5 / 15 min / IP) ──▶ Zod ──▶ looks like a bot?
                                                                              │ yes → status spam, no e-mails, "thank you" anyway
                                                                              │ no  ↓
                                         website_inquiries (new) + in ONE transaction:
                                           · e-mail "we received your message"  → the sender
                                           · e-mail "new inquiry" + link        → every platform admin
```

**Bot checks, with no external service:**

* a **honeypot**: a "website" field that is hidden from people and screen readers, but which bots fill in
* the **time** between showing the form and sending it: bots post in milliseconds

Bots still get the normal "thank you", so they learn nothing, and the message is filed as spam in case the check
was wrong.

The e-mails go through the outbox like every other e-mail (`queueEmail` inside the same transaction). If the insert
fails, no e-mail is sent.

## 3. Answering

`POST /platform/website/inquiries/:id/reply` stores the reply and e-mails it to the sender with their original
message quoted. It also sets the status to *replied*, or *closed* when "close after sending" is ticked. The
e-mails come from the no-reply address, so the reply asks the person to use the contact page to write again.
**Internal notes** are never sent.

The "new inquiry" e-mail links to `/platform/website?tab=inquiries&inquiry=12`, which opens that message directly.

## Hands-on

1. Log out and open `/contact?type=demo`. "Book a demo" is pre-selected. Send a message.
2. **Platform → Mailbox:** two e-mails, one to you (the platform admin) and one to the sender.
3. **Platform → Website → Inquiries:** the new message is shown with a badge. Add a note, reply, then close it.
4. Using the browser's developer tools, fill in the hidden "website" field and send. The message lands in **Spam**.
5. **Website → Privacy:** replace the [placeholders], publish, and see the link appear in the footer.

## Where to look

`server/src/modules/website/website.inquiries.ts` · `website.sections.ts` (`contact_form`) · e-mail templates
`inquiryReceived`, `inquiryNew`, `inquiryReply` in `server/src/modules/email/email.templates.ts` ·
client `website/sections/ContactForm.tsx`, `website/admin/InquiriesInbox.tsx` · tests
`server/tests/api/website-inquiries.test.ts`.

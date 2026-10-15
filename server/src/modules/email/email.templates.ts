// Transactional email templates. Each returns subject + HTML + plain text.
// Keep HTML simple and inline-styled: email clients ignore <style> blocks and modern CSS.

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(title: string, bodyHtml: string, button?: { label: string; url: string }) {
  const cta = button
    ? `<p style="margin:28px 0"><a href="${escapeHtml(button.url)}" style="background:#3e63dd;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(button.label)}</a></p>
       <p style="color:#687076;font-size:13px">Or paste this link into your browser:<br><a href="${escapeHtml(button.url)}" style="color:#3e63dd;word-break:break-all">${escapeHtml(button.url)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c2024">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e3e6ea">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e3e6ea"><span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:8px;background:#3e63dd;color:#fff;font-weight:700;font-size:13px">TF</span>
<strong style="margin-left:10px;font-size:16px;vertical-align:middle">Team-Flex</strong></td></tr>
<tr><td style="padding:28px 32px"><h2 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h2>${bodyHtml}${cta}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e3e6ea;color:#8b8d98;font-size:12px">You received this email because of activity on your Team-Flex account.</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (text: string) => `<p style="margin:0 0 12px;line-height:1.6">${text}</p>`;

export const templates = {
  welcome: (d: { name: string; organizationName: string; url: string }): RenderedEmail => ({
    subject: `Welcome to Team-Flex, ${d.name.split(' ')[0]}!`,
    html: layout(
      'Welcome aboard 🎉',
      p(`Hi ${escapeHtml(d.name)},`) + p(`Your organization <strong>${escapeHtml(d.organizationName)}</strong> is ready. Invite your team and create your first project.`),
      { label: 'Open Team-Flex', url: d.url },
    ),
    text: `Hi ${d.name},\n\nYour organization "${d.organizationName}" is ready.\nOpen Team-Flex: ${d.url}\n`,
  }),

  invitation: (d: { organizationName: string; inviterName: string; roleName: string; url: string; expiresDays: number }): RenderedEmail => ({
    subject: `${d.inviterName} invited you to join ${d.organizationName} on Team-Flex`,
    html: layout(
      `Join ${d.organizationName}`,
      p(`<strong>${escapeHtml(d.inviterName)}</strong> invited you to join <strong>${escapeHtml(d.organizationName)}</strong> as <strong>${escapeHtml(d.roleName)}</strong>.`) +
        p(`This invitation expires in ${d.expiresDays} days.`),
      { label: 'Accept invitation', url: d.url },
    ),
    text: `${d.inviterName} invited you to join ${d.organizationName} as ${d.roleName}.\nAccept: ${d.url}\nExpires in ${d.expiresDays} days.\n`,
  }),

  passwordReset: (d: { name: string; url: string; minutes: number }): RenderedEmail => ({
    subject: 'Reset your Team-Flex password',
    html: layout(
      'Reset your password',
      p(`Hi ${escapeHtml(d.name)},`) +
        p(`We received a request to reset your password. The link below is valid for <strong>${d.minutes} minutes</strong> and can be used once.`) +
        p(`If you didn't ask for this, you can safely ignore this email — your password won't change.`),
      { label: 'Choose a new password', url: d.url },
    ),
    text: `Hi ${d.name},\n\nReset your password (valid ${d.minutes} minutes, single use):\n${d.url}\n\nIf you didn't ask for this, ignore this email.\n`,
  }),

  passwordChanged: (d: { name: string; when: string; ip: string | null }): RenderedEmail => ({
    subject: 'Your Team-Flex password was changed',
    html: layout(
      'Your password was changed',
      p(`Hi ${escapeHtml(d.name)},`) +
        p(`The password for your account was changed on ${escapeHtml(d.when)}${d.ip ? ` from IP ${escapeHtml(d.ip)}` : ''}.`) +
        p(`If this was you, nothing else to do. If not, reset your password immediately and contact your administrator.`),
    ),
    text: `Hi ${d.name},\n\nYour password was changed on ${d.when}${d.ip ? ` from IP ${d.ip}` : ''}.\nIf this wasn't you, reset your password immediately.\n`,
  }),

  /** One notification (assignment, mention, QA verdict, leave decision, ...) */
  notification: (d: { name: string; organizationName: string; title: string; body: string | null; url: string; settingsUrl: string }): RenderedEmail => ({
    subject: `${d.title} · ${d.organizationName}`,
    html: layout(
      d.title,
      p(`Hi ${escapeHtml(d.name)},`) +
        (d.body ? p(`<span style="color:#4a4f57">${escapeHtml(d.body).replace(/\n/g, '<br>')}</span>`) : '') +
        `<p style="color:#8b8d98;font-size:12px;margin-top:20px">${escapeHtml(d.organizationName)} · <a href="${escapeHtml(d.settingsUrl)}" style="color:#8b8d98">Notification settings</a></p>`,
      { label: 'Open in Team-Flex', url: d.url },
    ),
    text: `Hi ${d.name},\n\n${d.title}\n${d.body ? `${d.body}\n` : ''}\nOpen: ${d.url}\n\nNotification settings: ${d.settingsUrl}\n`,
  }),

  /** Weekly organization report (insights.view) */
  insightsWeekly: (d: {
    name: string;
    organizationName: string;
    created: number;
    done: number;
    open: number;
    overdue: number;
    openBugs: number;
    criticalBugs: number;
    newErrors: number;
    activeUsers: number;
    members: number;
    projectsNeedingAttention: { name: string; why: string }[];
    busiest: { name: string; open: number; overdue: number }[];
    away: { name: string; startDate: string; endDate: string }[];
    pendingApprovals: number;
    url: string;
    settingsUrl: string;
  }): RenderedEmail => {
    const stat = (label: string, value: string | number) =>
      `<td style="padding:10px 12px;border:1px solid #e3e6ea;border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:700">${value}</div><div style="color:#687076;font-size:12px">${escapeHtml(label)}</div></td>`;
    const list = (title: string, items: string[]) =>
      items.length ? `<h3 style="font-size:15px;margin:20px 0 8px">${escapeHtml(title)}</h3><ul style="padding-left:18px;margin:0">${items.map((i) => `<li style="margin-bottom:6px">${i}</li>`).join('')}</ul>` : '';
    return {
      subject: `${d.organizationName} — weekly report: ${d.done} done, ${d.overdue} overdue${d.criticalBugs ? `, ${d.criticalBugs} critical bug${d.criticalBugs === 1 ? '' : 's'}` : ''}`,
      html: layout(
        `Your week in ${d.organizationName}`,
        p(`Hi ${escapeHtml(d.name)}, here is last week at a glance.`) +
          `<table cellspacing="6" style="width:100%;border-collapse:separate;margin:0 -6px"><tr>${stat('created', d.created)}${stat('done', d.done)}${stat('open now', d.open)}${stat('overdue', d.overdue)}</tr>` +
          `<tr>${stat('open bugs', d.openBugs)}${stat('critical bugs', d.criticalBugs)}${stat('new prod. errors', d.newErrors)}${stat('active people', `${d.activeUsers}/${d.members}`)}</tr></table>` +
          list('Projects needing attention', d.projectsNeedingAttention.map((x) => `<strong>${escapeHtml(x.name)}</strong> — ${escapeHtml(x.why)}`)) +
          list('Most loaded people', d.busiest.map((x) => `${escapeHtml(x.name)}: ${x.open} open${x.overdue ? `, <span style="color:#d03b3b">${x.overdue} overdue</span>` : ''}`)) +
          list('Away this week', d.away.map((x) => `${escapeHtml(x.name)}: ${x.startDate === x.endDate ? x.startDate : `${x.startDate} → ${x.endDate}`}`)) +
          (d.pendingApprovals ? p(`${d.pendingApprovals} leave request${d.pendingApprovals === 1 ? ' is' : 's are'} waiting for approval.`) : '') +
          `<p style="color:#8b8d98;font-size:12px;margin-top:20px"><a href="${escapeHtml(d.settingsUrl)}" style="color:#8b8d98">Stop these emails</a></p>`,
        { label: 'Open organization insights', url: d.url },
      ),
      text:
        `Hi ${d.name},\n\nLast week in ${d.organizationName}: ${d.created} created, ${d.done} done, ${d.open} open, ${d.overdue} overdue, ` +
        `${d.openBugs} open bugs (${d.criticalBugs} critical), ${d.newErrors} new production errors, ${d.activeUsers}/${d.members} people active.\n` +
        (d.projectsNeedingAttention.length ? `\nNeeding attention:\n${d.projectsNeedingAttention.map((x) => `- ${x.name}: ${x.why}`).join('\n')}\n` : '') +
        `\n${d.url}\n`,
    };
  },

  /** Daily digest of everything unread with email = daily */
  notificationDigest: (d: {
    name: string;
    organizationName: string;
    total: number;
    items: { title: string; body: string | null; url: string }[];
    url: string;
    settingsUrl: string;
  }): RenderedEmail => ({
    subject: `${d.total} update${d.total === 1 ? '' : 's'} in ${d.organizationName}`,
    html: layout(
      `Your daily summary`,
      p(`Hi ${escapeHtml(d.name)}, here is what happened in <strong>${escapeHtml(d.organizationName)}</strong>:`) +
        `<ul style="padding-left:18px;margin:0 0 12px">${d.items
          .map(
            (i) =>
              `<li style="margin-bottom:10px"><a href="${escapeHtml(i.url)}" style="color:#1c2024;font-weight:600;text-decoration:none">${escapeHtml(i.title)}</a>${
                i.body ? `<br><span style="color:#687076;font-size:13px">${escapeHtml(i.body.slice(0, 160))}</span>` : ''
              }</li>`,
          )
          .join('')}</ul>` +
        (d.total > d.items.length ? p(`…and ${d.total - d.items.length} more.`) : '') +
        `<p style="color:#8b8d98;font-size:12px"><a href="${escapeHtml(d.settingsUrl)}" style="color:#8b8d98">Change what you receive</a></p>`,
      { label: 'Open notifications', url: d.url },
    ),
    text: `Hi ${d.name},\n\n${d.items.map((i) => `- ${i.title}\n  ${i.url}`).join('\n')}\n\nAll notifications: ${d.url}\n`,
  }),
};

export type TemplateName = keyof typeof templates;
export type TemplateData<K extends TemplateName> = Parameters<(typeof templates)[K]>[0];

// Phase 2f: test suites, test cases, test runs, filing bugs from failures.
import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let qa: TestUser;
let viewer: TestUser;
let key: string;

beforeAll(async () => {
  owner = await registerOwner('QA Org');
  qa = await addMember(owner, 'qa', 'Qa Person');
  viewer = await addMember(owner, 'member', 'Viewer Person');
  key = uniqueKey();
  await owner.api.post('/projects', { name: 'Web', key, template: 'bug_tracking', visibility: 'organization' });
  await owner.api.post(`/projects/${key}/members`, { userId: qa.id, role: 'member' });
});

describe('test cases', () => {
  let loginSuite: number;
  let story: { id: number; key: string };

  it('organizes cases in suites and numbers them TC-1, TC-2 …', async () => {
    const suites = await qa.api.post(`/projects/${key}/test-suites`, { name: 'Login' });
    expect(suites.status).toBe(201);
    loginSuite = suites.body.data[0].id;
    expect((await qa.api.post(`/projects/${key}/test-suites`, { name: 'Login' })).status).toBe(409);
    story = (await owner.api.post(`/projects/${key}/items`, { type: 'story', title: 'Users can log in' })).body.data;

    const a = await qa.api.post(`/projects/${key}/test-cases`, {
      title: 'Login with a valid password',
      suiteId: loginSuite,
      preconditions: 'A registered user',
      steps: [
        { action: 'Open /login', expected: 'The form is shown' },
        { action: 'Enter email and password, press Log in', expected: 'The dashboard opens' },
      ],
      priority: 'critical',
      caseType: 'smoke',
      workItemRef: story.key,
    });
    expect(a.status).toBe(201);
    expect(a.body.data).toMatchObject({ key: 'TC-1', number: 1, suite: { name: 'Login' }, workItem: { key: story.key }, steps: [{ expected: 'The form is shown' }, {}] });
    const b = await qa.api.post(`/projects/${key}/test-cases`, { title: 'Wrong password shows an error', suiteId: loginSuite, steps: [{ action: 'Log in with a wrong password', expected: 'An error is shown' }] });
    expect(b.body.data.key).toBe('TC-2');
    await qa.api.post(`/projects/${key}/test-cases`, { title: 'Draft idea', status: 'draft' });

    const list = (await viewer.api.get(`/projects/${key}/test-cases?suiteId=${loginSuite}`)).body.data;
    expect(list.items.map((c: { key: string }) => c.key)).toEqual(['TC-1', 'TC-2']);
    expect((await viewer.api.get(`/projects/${key}/test-cases?search=TC-2`)).body.data.items[0].number).toBe(2);
    expect((await viewer.api.get(`/projects/${key}/test-suites`)).body.data[0].caseCount).toBe(2);

    // the story shows which tests cover it
    const detail = (await owner.api.get(`/work-items/${story.id}`)).body.data;
    expect(detail.testCases.map((c: { number: number }) => c.number)).toEqual([1]);
  });

  it('viewers read but cannot write; covered items must be in the same project', async () => {
    expect((await viewer.api.post(`/projects/${key}/test-cases`, { title: 'x' })).status).toBe(403);
    const otherKey = uniqueKey();
    await owner.api.post('/projects', { name: 'Other', key: otherKey });
    const foreign = (await owner.api.post(`/projects/${otherKey}/items`, { type: 'story', title: 'Foreign' })).body.data;
    expect((await qa.api.post(`/projects/${key}/test-cases`, { title: 'x', workItemRef: foreign.key })).status).toBe(400);
  });

  it('runs snapshot READY cases; results, per-step outcome and progress are tracked', async () => {
    const run = await qa.api.post(`/projects/${key}/test-runs`, { name: 'Release 2.4 smoke', environment: 'staging', buildVersion: '2.4.0', scope: { all: true } });
    expect(run.status).toBe(201);
    const r = run.body.data;
    expect(r.results.map((x: { caseKey: string }) => x.caseKey)).toEqual(['TC-1', 'TC-2']); // the draft is not included
    expect(r.summary).toMatchObject({ total: 2, untested: 2, progress: 0, passRate: null });

    // editing the case later does not change what this run tests (snapshot)
    await qa.api.patch(`/projects/${key}/test-cases/1`, { title: 'Login (renamed)' });
    const [first, second] = r.results;

    // a failing step decides the outcome
    const failed = await qa.api.patch(`/projects/${key}/test-runs/${r.id}/results/${first.id}`, {
      stepResults: ['passed', 'failed'],
      comment: 'Spinner forever, console shows 500',
    });
    expect(failed.body.data).toMatchObject({ status: 'failed', executedBy: { id: qa.id }, title: 'Login with a valid password' });
    await qa.api.patch(`/projects/${key}/test-runs/${r.id}/results/${second.id}`, { status: 'passed' });

    const now = (await viewer.api.get(`/projects/${key}/test-runs/${r.id}`)).body.data;
    expect(now.summary).toMatchObject({ total: 2, passed: 1, failed: 1, progress: 100, passRate: 50 });
    const tc1 = (await viewer.api.get(`/projects/${key}/test-cases/1`)).body.data;
    expect(tc1.lastResult).toMatchObject({ status: 'failed', runId: r.id });
    expect(tc1.history[0]).toMatchObject({ status: 'failed', runName: 'Release 2.4 smoke' });
  });

  it('files a bug from a failure, pre-filled from the test, linked both ways', async () => {
    const run = (await qa.api.get(`/projects/${key}/test-runs`)).body.data[0];
    const detail = (await qa.api.get(`/projects/${key}/test-runs/${run.id}`)).body.data;
    const failed = detail.results.find((x: { status: string }) => x.status === 'failed');
    const passed = detail.results.find((x: { status: string }) => x.status === 'passed');
    expect((await qa.api.post(`/projects/${key}/test-runs/${run.id}/results/${passed.id}/bug`, {})).status).toBe(400);

    const bug = await qa.api.post(`/projects/${key}/test-runs/${run.id}/results/${failed.id}/bug`, { severity: 'critical' });
    expect(bug.status).toBe(201);
    expect(bug.body.data).toMatchObject({
      type: 'bug',
      title: '[TC-1] Login with a valid password fails',
      severity: 'critical',
      environment: 'staging',
      foundInVersion: '2.4.0',
      expectedResult: 'The dashboard opens',
      actualResult: 'Spinner forever, console shows 500',
      foundByTest: { runId: run.id, caseNumber: 1 },
    });
    expect(bug.body.data.stepsToReproduce).toContain('**Preconditions:** A registered user');
    expect(bug.body.data.stepsToReproduce).toContain('2. Enter email and password, press Log in  ← fails here');
    expect((await qa.api.post(`/projects/${key}/test-runs/${run.id}/results/${failed.id}/bug`, {})).status).toBe(409);

    const after = (await qa.api.get(`/projects/${key}/test-runs/${run.id}`)).body.data;
    expect(after.results.find((x: { id: number }) => x.id === failed.id).bug.key).toBe(bug.body.data.key);
  });

  it('completed runs are read-only until reopened; deleting a case keeps run history', async () => {
    const run = (await qa.api.get(`/projects/${key}/test-runs`)).body.data[0];
    const result = (await qa.api.get(`/projects/${key}/test-runs/${run.id}`)).body.data.results[1];
    expect((await qa.api.post(`/projects/${key}/test-runs/${run.id}/complete`)).body.data.status).toBe('completed');
    expect((await qa.api.patch(`/projects/${key}/test-runs/${run.id}/results/${result.id}`, { status: 'failed' })).status).toBe(409);
    expect((await qa.api.post(`/projects/${key}/test-runs/${run.id}/reopen`)).body.data.status).toBe('in_progress');

    expect((await qa.api.delete(`/projects/${key}/test-cases/2`)).status).toBe(204);
    const kept = (await qa.api.get(`/projects/${key}/test-runs/${run.id}`)).body.data.results;
    expect(kept.find((x: { caseNumber: number }) => x.caseNumber === 2)).toMatchObject({ testCaseId: null, title: 'Wrong password shows an error' });
  });

  it('a run needs ready cases; only admins or the creator can delete it', async () => {
    expect((await qa.api.post(`/projects/${key}/test-runs`, { name: 'Empty', scope: { caseIds: [999999] } })).status).toBe(400);
    const run = (await owner.api.post(`/projects/${key}/test-runs`, { name: 'By owner', scope: { all: true } })).body.data;
    expect((await qa.api.delete(`/projects/${key}/test-runs/${run.id}`)).status).toBe(403);
    expect((await owner.api.delete(`/projects/${key}/test-runs/${run.id}`)).status).toBe(204);
  });
});

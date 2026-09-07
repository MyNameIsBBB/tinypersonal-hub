import { afterAll, describe, expect, it } from "vitest";
import {
  claimChatGenerationJob,
  claimCodingJob,
  completeChatGenerationJob,
  completeCodingJob,
  createChatSession,
  createPendingAction,
  createTask,
  getTaskFocus,
  getTasks,
  getTask,
  loadConversationState,
  prisma,
  saveConversationState,
  updateTaskChecklistItem,
} from "@tinypersonal/backend-api";
import { createSessionToken, SESSION_COOKIE } from "../../lib/serverAuth";
import { GET as listSessions, PATCH as updateSession, POST as createSession } from "./chat/sessions/route";
import { POST as confirmAction } from "./confirm/[id]/route";

const runId = `integration-${crypto.randomUUID()}`;
const aliceOwner = `user:${runId}-alice`;
const bobOwner = `user:${runId}-bob`;

function authenticatedRequest(url: string, username: string, init?: RequestInit) {
  const { token } = createSessionToken(username);
  const headers = new Headers(init?.headers);
  headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  return new Request(url, { ...init, headers });
}

function decisionRequest(actionId: string, username: string, approved = true) {
  return authenticatedRequest(`http://localhost/api/confirm/${actionId}`, username, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ approved }),
  });
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [aliceOwner, bobOwner] } } });
  await prisma.pendingAction.deleteMany({ where: { ownerKey: { in: [aliceOwner, bobOwner] } } });
  await prisma.codingJob.deleteMany({ where: { ownerKey: { in: [aliceOwner, bobOwner] } } });
  await prisma.chatGenerationJob.deleteMany({ where: { ownerKey: { in: [aliceOwner, bobOwner] } } });
  await prisma.chatMessage.deleteMany({ where: { session: { ownerKey: { in: [aliceOwner, bobOwner] } } } });
  await prisma.chatSession.deleteMany({ where: { ownerKey: { in: [aliceOwner, bobOwner] } } });
  await prisma.note.deleteMany({ where: { title: { startsWith: runId } } });
  await prisma.task.deleteMany({ where: { ownerKey: { in: [aliceOwner, bobOwner] } } });
});

describe("API authentication and owner isolation", () => {
  it("creates an owner-scoped task and its checklist atomically", async () => {
    const task = await createTask(aliceOwner, {
      title: `${runId}-EGAT`,
      deadline: "2026-09-15T23:59:00+07:00",
      requirements: "infographic A4 and prototype",
      checklist: ["แยก requirement", "ทำ UI", "test"],
    });
    expect(task.checklistItems.map(({ title }) => title)).toEqual(["แยก requirement", "ทำ UI", "test"]);
    await updateTaskChecklistItem(aliceOwner, { taskId: task.id, id: task.checklistItems[0].id, isCompleted: true });
    const updated = await getTask(aliceOwner, { id: task.id });
    expect(updated?.checklistItems[0]).toMatchObject({ title: "แยก requirement", isCompleted: true });
    await expect(getTasks(bobOwner, { query: `${runId}-EGAT` })).resolves.toEqual([]);
    await expect(getTasks(aliceOwner, { query: `${runId}-EGAT` })).resolves.toHaveLength(1);
    await expect(getTaskFocus(bobOwner)).resolves.toMatchObject({ summary: { unfinished: 0 } });
    await expect(getTaskFocus(aliceOwner)).resolves.toMatchObject({
      recommended: [expect.objectContaining({ id: task.id, checklist: { completed: 1, total: 3, remaining: ["ทำ UI", "test"] } })],
    });
  });

  it("rejects missing and invalid authentication", async () => {
    const missing = await listSessions(new Request("http://localhost/api/chat/sessions"));
    const invalid = await listSessions(new Request("http://localhost/api/chat/sessions", {
      headers: { cookie: `${SESSION_COOKIE}=invalid-token` },
    }));

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
  });

  it("creates and lists only sessions owned by the authenticated user", async () => {
    const aliceUsername = `${runId}-alice`;
    const bobUsername = `${runId}-bob`;
    const aliceCreate = await createSession(authenticatedRequest("http://localhost/api/chat/sessions", aliceUsername, { method: "POST" }));
    const bobCreate = await createSession(authenticatedRequest("http://localhost/api/chat/sessions", bobUsername, { method: "POST" }));
    const aliceSession = (await aliceCreate.json() as { session: { id: string } }).session;
    const bobSession = (await bobCreate.json() as { session: { id: string } }).session;

    const response = await listSessions(authenticatedRequest("http://localhost/api/chat/sessions", aliceUsername));
    const body = await response.json() as { sessions: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.sessions.map(({ id }) => id)).toContain(aliceSession.id);
    expect(body.sessions.map(({ id }) => id)).not.toContain(bobSession.id);

    const crossOwnerUpdate = await updateSession(authenticatedRequest("http://localhost/api/chat/sessions", aliceUsername, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: bobSession.id, customSystemPrompt: "must not be applied" }),
    }));
    expect(crossOwnerUpdate.status).toBe(404);
    await expect(prisma.chatSession.findUniqueOrThrow({ where: { id: bobSession.id } }))
      .resolves.toMatchObject({ customSystemPrompt: null });
  });

  it("persists conversation state only for the owning session", async () => {
    const session = await createChatSession(aliceOwner);
    const state = {
      activeIntent: "schedule.query",
      activeDomain: "schedule",
      activeTool: "getSchedule",
      updatedAt: new Date().toISOString(),
    };
    await expect(saveConversationState(aliceOwner, session.id, state)).resolves.toBe(true);
    await expect(loadConversationState(aliceOwner, session.id)).resolves.toEqual(state);
    await expect(loadConversationState(bobOwner, session.id)).resolves.toBeNull();
    await expect(saveConversationState(bobOwner, session.id, state)).resolves.toBe(false);
  });
});

describe("confirmation expiry, owner isolation, and idempotency", () => {
  it("creates one task with its checklist after confirmation", async () => {
    const session = await createChatSession(aliceOwner);
    const title = `${runId}-confirmed-task`;
    const action = await createPendingAction({
      ownerKey: aliceOwner,
      sessionId: session.id,
      toolName: "task.create",
      arguments: { title, checklist: ["ออกแบบ", "ทำ UI", "ทดสอบ"] },
      summary: `สร้าง Task: ${title}`,
    });
    const response = await confirmAction(decisionRequest(action.id, `${runId}-alice`), {
      params: Promise.resolve({ id: action.id }),
    });
    expect(response.status).toBe(200);
    await expect(getTasks(aliceOwner, { query: title })).resolves.toMatchObject([
      { title, checklistItems: [{ title: "ออกแบบ" }, { title: "ทำ UI" }, { title: "ทดสอบ" }] },
    ]);
  });

  it("deduplicates identical pending actions within one session", async () => {
    const session = await createChatSession(aliceOwner);
    const input = {
      ownerKey: aliceOwner,
      sessionId: session.id,
      toolName: "schedule.create",
      arguments: {
        title: `${runId}-SDKU`,
        type: "EVENT",
        startTime: "2026-09-12T02:00:00.000Z",
        endTime: "2026-09-12T02:30:00.000Z",
      },
      summary: "Create SDKU deadline",
    };
    const first = await createPendingAction(input);
    const duplicate = await createPendingAction(input);

    expect(duplicate.id).toBe(first.id);
    await expect(prisma.pendingAction.count({
      where: { ownerKey: aliceOwner, sessionId: session.id, status: "PENDING" },
    })).resolves.toBe(1);
  });

  it("rejects expired and cross-owner confirmations", async () => {
    const expired = await prisma.pendingAction.create({ data: {
      ownerKey: aliceOwner,
      toolName: "notes.create",
      argumentsJson: JSON.stringify({ title: `${runId}-expired`, content: "expired" }),
      summary: "Expired note",
      expiresAt: new Date(Date.now() - 1_000),
    } });
    const ownedByBob = await createPendingAction({
      ownerKey: bobOwner,
      toolName: "notes.create",
      arguments: { title: `${runId}-bob-only`, content: "private" },
      summary: "Bob note",
    });

    const expiredResponse = await confirmAction(decisionRequest(expired.id, `${runId}-alice`), { params: Promise.resolve({ id: expired.id }) });
    const crossOwnerResponse = await confirmAction(decisionRequest(ownedByBob.id, `${runId}-alice`), { params: Promise.resolve({ id: ownedByBob.id }) });

    expect(expiredResponse.status).toBe(404);
    expect(crossOwnerResponse.status).toBe(404);
    expect(await prisma.note.count({ where: { title: { in: [`${runId}-expired`, `${runId}-bob-only`] } } })).toBe(0);
  });

  it("claims one confirmation atomically when duplicate approvals race", async () => {
    const title = `${runId}-idempotent`;
    const action = await createPendingAction({
      ownerKey: aliceOwner,
      toolName: "notes.create",
      arguments: { title, content: "created exactly once" },
      summary: "Create one note",
    });
    const context = { params: Promise.resolve({ id: action.id }) };

    const responses = await Promise.all([
      confirmAction(decisionRequest(action.id, `${runId}-alice`), context),
      confirmAction(decisionRequest(action.id, `${runId}-alice`), context),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 404]);
    expect(await prisma.note.count({ where: { title } })).toBe(1);
    await expect(prisma.pendingAction.findUniqueOrThrow({ where: { id: action.id } }))
      .resolves.toMatchObject({ status: "APPROVED", resolvedAt: expect.any(Date) });
  });
});

describe("job retry lifecycle", () => {
  it("requeues a coding job twice and fails terminally on attempt three", async () => {
    const job = await prisma.codingJob.create({ data: {
      ownerKey: aliceOwner,
      sessionId: `${runId}-coding-session`,
      userMessageId: `${runId}-coding-message`,
      inputJson: JSON.stringify({ instruction: "run tests", readOnly: true }),
    } });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const claimed = await claimCodingJob(1);
      expect(claimed).toMatchObject({ id: job.id, status: "RUNNING", attempts: attempt });
      const completed = await completeCodingJob(job.id, { ok: false, error: `failure-${attempt}` });
      expect(completed.status).toBe(attempt < 3 ? "QUEUED" : "FAILED");
      expect(completed.error).toBe(`failure-${attempt}`);
      expect(completed.completedAt === null).toBe(attempt < 3);
    }
  });

  it("applies the same capped retry policy to background chat generation", async () => {
    const job = await prisma.chatGenerationJob.create({ data: {
      ownerKey: bobOwner,
      sessionId: `${runId}-chat-session`,
      userMessageId: `${runId}-chat-message`,
      inputJson: "{}",
    } });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const claimed = await claimChatGenerationJob(1);
      expect(claimed).toMatchObject({ id: job.id, status: "RUNNING", attempts: attempt });
      const completed = await completeChatGenerationJob(job.id, { ok: false, error: `failure-${attempt}` });
      expect(completed.status).toBe(attempt < 3 ? "QUEUED" : "FAILED");
    }

    await expect(prisma.chatGenerationJob.findUniqueOrThrow({ where: { id: job.id } }))
      .resolves.toMatchObject({ attempts: 3, status: "FAILED", completedAt: expect.any(Date) });
  });
});

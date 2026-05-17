import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const BACKEND_BASE = "http://127.0.0.1:3001";

async function createSession(
  request: APIRequestContext,
  title: string,
  initialContent: string,
) {
  const response = await request.post(`${BACKEND_BASE}/cli/sessions`, {
    data: { title, initialContent },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();

  return body.sessionId as string;
}

async function sendCommand(
  request: APIRequestContext,
  sessionId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  const response = await request.post(
    `${BACKEND_BASE}/api/sessions/${sessionId}/commands`,
    {
      data: {
        commandId: `test-${type}-${Date.now()}`,
        type,
        sessionId,
        issuedAt: "2026-05-12T00:00:00.000Z",
        payload,
      },
    },
  );

  expect(response.ok()).toBeTruthy();
}

test("drives proceed and review through HTTP commands and SSE state", async ({
  page,
  request,
}) => {
  const sessionId = await createSession(
    request,
    "Protocol Session",
    "# Protocol Session\n\nHello session.",
  );
  await sendCommand(request, sessionId, "bullet.comment.create", {
    unitId: "u-1-hello-sessio",
    content: "Please expand this.",
    anchorTextSnapshot: "Hello",
  });

  await page.goto(`/?sessionId=${sessionId}`);

  await expect(page.locator('.blackboard-page[data-status="active"]'))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Proceed" })).toBeEnabled();

  const proceedCommand = page.waitForRequest((request) =>
    request.url().includes(`/api/sessions/${sessionId}/commands`) &&
    request.method() === "POST",
  );

  await page.getByRole("button", { name: "Proceed" }).click();

  const proceedPayload = JSON.parse((await proceedCommand).postData() ?? "{}");
  expect(proceedPayload.type).toBe("session.proceed");
  expect(proceedPayload.payload).toMatchObject({ workingSetRevision: 1 });

  await expect(page.locator('.blackboard-page[data-status="proceeding"]'))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "正在统合本轮修改" }))
    .toBeVisible();

  await expect(page.locator('.blackboard-page[data-status="reviewing_flow"]'))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Flow Review" }))
    .toBeVisible();

  const acceptAllCommand = page.waitForRequest((request) =>
    request.url().includes(`/api/sessions/${sessionId}/commands`) &&
    request.method() === "POST",
  );

  await page.getByRole("button", { name: /全部接受修订/ }).click();

  const acceptAllPayload = JSON.parse(
    (await acceptAllCommand).postData() ?? "{}",
  );
  expect(acceptAllPayload.type).toBe("review.accept_all_remaining");
  expect(acceptAllPayload.payload.reviewChangeSetId).toBe("changeset-1");

  await expect(page.locator('.blackboard-page[data-status="active"]'))
    .toBeVisible();
  await expect(page.locator(".review-page")).toHaveCount(0);
});

test("loads distinct historical versions in history preview", async ({
  page,
  request,
}) => {
  const sessionId = await createSession(
    request,
    "History Session",
    "# History Session\n\nFresh content.",
  );

  await page.goto(`/?sessionId=${sessionId}`);

  await page.getByRole("button", { name: "History" }).click();

  await expect(page.locator('.blackboard-page[data-status="history_preview"]'))
    .toBeVisible();
  await expect(page.locator(".history-version-button[data-active='true']"))
    .toHaveText("v0");
  await expect(page.getByText("Fresh content.")).toBeVisible();
});

test("opens bullet notes from rail state icons with one click", async ({
  page,
  request,
}) => {
  const sessionId = await createSession(
    request,
    "Bullet Session",
    "# Bullet Session\n\nAnchor one.\n\nAnchor two.",
  );
  await sendCommand(request, sessionId, "bullet.comment.create", {
    unitId: "u-1-anchor-one",
    content: "First note.",
    anchorTextSnapshot: "Anchor one",
  });
  await sendCommand(request, sessionId, "bullet.comment.create", {
    unitId: "u-2-anchor-two",
    content: "Second note.",
    anchorTextSnapshot: "Anchor two",
  });

  await page.goto(`/?sessionId=${sessionId}`);

  await expect(page.locator('.blackboard-page[data-status="active"]'))
    .toBeVisible();

  const bulletIds = await page
    .locator(".bullet-node")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-bullet-id") ?? ""),
    );

  for (const bulletId of bulletIds) {
    await page.locator(`.bullet-node[data-bullet-id="${bulletId}"]`).click();
    await expect(page.locator(".bullet-note")).toBeVisible();
    await expect(
      page.locator(
        `.bullet-node[data-bullet-id="${bulletId}"][data-selected="true"]`,
      ),
    ).toBeVisible();
  }
});

test("attaches to a freshly created real session", async ({ page, request }) => {
  const sessionId = await createSession(
    request,
    "E2E Session",
    "# E2E Session\n\nFresh content.",
  );

  await page.goto(`/?sessionId=${sessionId}`);

  await expect(page.locator('.blackboard-page[data-status="active"]'))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E Session" })).toBeVisible();
  await expect(page.getByText("v0 · r0")).toBeVisible();
  await expect(page.locator(".fixture-switcher")).toHaveCount(0);
});

test("shows an explicit missing-session state instead of silently falling back", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Missing session context" }))
    .toBeVisible();
  await expect(page.getByText("?sessionId=demo")).toBeVisible();
  await expect(page.locator(".blackboard-page")).toHaveCount(0);
});

import { expect, test } from "@playwright/test";

test("drives proceed and review through HTTP commands and SSE state", async ({
  page,
}) => {
  await page.goto("/?sessionId=e2e-protocol");

  await expect(page.locator('.blackboard-page[data-status="active"]'))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Proceed" })).toBeEnabled();

  const proceedCommand = page.waitForRequest((request) =>
    request.url().includes("/api/sessions/e2e-protocol/commands") &&
    request.method() === "POST",
  );

  await page.getByRole("button", { name: "Proceed" }).click();

  const proceedPayload = JSON.parse((await proceedCommand).postData() ?? "{}");
  expect(proceedPayload.type).toBe("session.proceed");
  expect(proceedPayload.payload).toMatchObject({ workingSetRevision: 3 });

  await expect(page.locator('.blackboard-page[data-status="proceeding"]'))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "正在统合本轮修改" }))
    .toBeVisible();

  await expect(page.locator('.blackboard-page[data-status="reviewing_flow"]'))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Flow Review" }))
    .toBeVisible();

  const acceptAllCommand = page.waitForRequest((request) =>
    request.url().includes("/api/sessions/e2e-protocol/commands") &&
    request.method() === "POST",
  );

  await page.getByRole("button", { name: /全部接受修订/ }).click();

  const acceptAllPayload = JSON.parse(
    (await acceptAllCommand).postData() ?? "{}",
  );
  expect(acceptAllPayload.type).toBe("review.accept_all_remaining");
  expect(acceptAllPayload.payload.reviewChangeSetId).toBe("changeset-3");

  await expect(page.locator('.blackboard-page[data-status="active"]'))
    .toBeVisible();
  await expect(page.locator(".review-page")).toHaveCount(0);
});

test("loads distinct historical versions in history preview", async ({
  page,
}) => {
  await page.goto("/?sessionId=e2e-history");

  await page.getByRole("button", { name: "History" }).click();

  await expect(page.locator('.blackboard-page[data-status="history_preview"]'))
    .toBeVisible();
  await expect(page.locator(".history-version-button[data-active='true']"))
    .toHaveText("v2");
  await expect(page.getByText("工作中的判断")).toBeVisible();

  await page.getByRole("button", { name: "v1" }).click();

  await expect(page.locator(".history-version-button[data-active='true']"))
    .toHaveText("v1");
  await expect(page.getByText("仔细阅读眼前的作品。")).toBeVisible();
  await expect(page.getByText("工作中的判断")).toHaveCount(0);

  await page.getByRole("button", { name: "v2" }).click();

  await expect(page.locator(".history-version-button[data-active='true']"))
    .toHaveText("v2");
  await expect(page.getByText("工作中的判断")).toBeVisible();
});

test("opens bullet notes from rail state icons with one click", async ({
  page,
}) => {
  await page.goto("/?sessionId=e2e-bullet-click");

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

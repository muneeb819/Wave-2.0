import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runPython } from "./pythonRunner";

test.beforeEach(async ({ page }) => {
  // Tests never use a paid Cloud project or mint real inference credentials.
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        configured: false,
        missing: ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
        invalid_url: false,
        protected: false,
        agent_name: "inference-studio",
        pipelines: ["stt-llm-tts", "realtime"],
        server_host: null,
      },
    }),
  );
  await page.goto("/");
});

test("reference pipeline and Quickstart default models render without client errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByRole("heading", { name: "Inference." })).toBeVisible();
  await expect(page.getByLabel("Speech to text model")).toHaveValue(
    "assemblyai/universal-3-6-pro",
  );
  await expect(page.getByLabel("Language model")).toHaveValue(
    "google/gemma-4-31b-it",
  );
  await expect(page.getByLabel("Transcription language")).toHaveValue("en");
  await expect(page.getByLabel("Text to speech model")).toHaveValue(
    "fishaudio/s2.1-pro",
  );
  await expect(
    page.getByRole("region", { name: "LiveKit Inference architecture" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("model and language changes are reflected in Python and persisted locally", async ({
  page,
}) => {
  await page.getByLabel("Speech to text model").selectOption("deepgram/nova-3");
  await page.getByLabel("Transcription language").selectOption("es");
  await page.getByLabel("Language model").selectOption("openai/gpt-4.1-mini");
  await page.getByRole("button", { name: "Get code", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("deepgram/nova-3");
  await expect(dialog).toContainText("openai/gpt-4.1-mini");
  await expect(dialog).toContainText('language="es"');
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByLabel("Transcription language")).toHaveValue("es");
  await page
    .getByLabel("Speech to text model")
    .selectOption("deepgram/flux-general");
  await expect(page.getByLabel("Transcription language")).toHaveValue("en");
  await page
    .getByRole("button", { name: "Reset defaults", exact: true })
    .click();
  await expect(page.getByLabel("Language model")).toHaveValue(
    "google/gemma-4-31b-it",
  );
});

test("instructions and voice settings are editable, validated, and exported", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page
    .getByLabel("System instructions", { exact: true })
    .fill("Be a thoughtful, concise travel assistant.");
  await page.getByRole("button", { name: "Save instructions" }).click();
  await page
    .getByRole("button", { name: "Default voice", exact: true })
    .click();
  await page.getByLabel("Voice ID", { exact: true }).fill("invalid voice!");
  await expect(page.getByRole("button", { name: "Save voice" })).toBeDisabled();
  await page.getByLabel("Voice ID", { exact: true }).fill("custom-voice-123");
  await page.getByRole("button", { name: "Save voice" }).click();
  await expect(
    page.getByRole("button", { name: "Custom voice", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get code", exact: true }).click();
  await page
    .getByRole("button", { name: "Complete agent", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Be a thoughtful, concise travel assistant.",
  );
  await expect(page.getByRole("dialog")).toContainText("custom-voice-123");
  await expect(page.getByRole("dialog")).toContainText("record=False");
});

test("demo conversation, sample metrics, events, and session history work without inference calls", async ({
  page,
}) => {
  let tokenRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/sessions")) tokenRequests++;
  });
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(page.locator(".chat-message")).toHaveCount(1);
  await expect(page.getByLabel("Speech to text model")).toBeDisabled();
  await expect(page.getByLabel("Mute microphone")).toBeDisabled();
  await page
    .getByLabel("Message to your agent")
    .fill("How does inference work?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".chat-message")).toHaveCount(3);
  await expect(page.locator(".message-content p").last()).toContainText(
    "Gemma 4 31B",
  );
  await expect(page.locator(".metric-values")).toContainText("218");
  await expect(page.locator(".metrics-strip-label")).toContainText(
    "ILLUSTRATIVE METRICS",
  );
  await page.getByRole("button", { name: /Events/ }).click();
  await expect(page.locator(".event-list")).toContainText(
    "No microphone, network inference, or provider requests.",
  );
  await page
    .getByRole("button", { name: "End session", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Speech to text model")).toBeEnabled();
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: /Sessions/ })
    .click();
  await expect(page.locator(".history-table tbody tr")).toHaveCount(1);
  await page.locator(".history-session-name").click();
  await expect(page.getByRole("dialog")).toContainText(
    "How does inference work?",
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export session", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/^inference-.+\.json$/);
  expect(tokenRequests).toBe(0);
});

test("live mode requires server credentials instead of pretending to connect", async ({
  page,
}) => {
  let tokenRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/sessions")) tokenRequests++;
  });
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Never paste your LiveKit API secret into this browser.",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "python -m backend.agent dev",
  );
  await expect(page.getByRole("dialog")).toContainText("Cloud not connected");
  expect(tokenRequests).toBe(0);
});

test("code download and keyboard dialog close work", async ({ page }) => {
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  const trigger = page.getByRole("button", { name: "Get code", exact: true });
  await trigger.click();
  await expect(page.locator(".agent-status-bar")).toContainText(
    "Ready for your message",
  );
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest('[role="dialog"]'),
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Complete agent", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download agent.py", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("agent.py");
  const source = readFileSync((await file.path())!, "utf8");
  expect(source).toContain("inference.events");
  const syntax = runPython("import ast, sys; ast.parse(sys.stdin.read())", {
    input: source,
  });
  expect(
    syntax.ok,
    `${syntax.runner ?? "no Python interpreter"}: ${syntax.detail}`,
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("realtime branch switches cleanly into speech-to-speech GPT Realtime 2.1 mode", async ({
  page,
}) => {
  await page.locator(".branch-realtime").click();
  await expect(page.getByRole("dialog")).toContainText("GPT Realtime 2.1");
  await page.getByRole("button", { name: /Enable Realtime pipeline/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Realtime speech model")).toHaveValue(
    "openai/gpt-realtime-2.1",
  );
});

test("session history can be filtered, searched, and cleared", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Try a demo", exact: true }).click();
  await expect(page.locator(".chat-message")).toHaveCount(1);
  await page
    .getByRole("button", { name: "End session", exact: true })
    .first()
    .click();
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: /Sessions/ })
    .click();
  await expect(page.locator(".history-table tbody tr")).toHaveCount(1);
  await page
    .getByLabel("Search sessions", { exact: true })
    .fill("no matching session");
  await expect(page.getByText("No sessions found.")).toBeVisible();
  await page.getByLabel("Clear search").click();
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.getByText("No sessions found.")).toBeVisible();
  await page.getByRole("button", { name: "All sessions", exact: true }).click();
  await page.getByLabel("Clear all history").click();
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await expect(
    page.getByText("Your next conversation belongs here."),
  ).toBeVisible();
});

test("API offline state is actionable and demo still runs", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({ status: 503, json: { detail: "Offline" } }),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: /API offline/ })).toBeVisible();
  await page.getByRole("button", { name: "Try a demo", exact: true }).click();
  await expect(page.locator(".chat-message")).toHaveCount(1);
});

test("mobile layout has no page overflow and navigation opens and closes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => (await page.locator(".sidebar").boundingBox())!.x)
    .toBeLessThan(-200);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Open navigation").click();
  await expect
    .poll(async () => (await page.locator(".sidebar").boundingBox())!.x)
    .toBeGreaterThan(-1);
  await page
    .locator(".main-navigation")
    .getByRole("button", { name: "Configuration", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Configuration." }),
  ).toBeVisible();
  await expect
    .poll(async () => (await page.locator(".sidebar").boundingBox())!.x)
    .toBeLessThan(-200);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("saved legacy STT settings migrate once to AssemblyAI Universal 3.6 Pro English while preserving other preferences", async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "inference-studio:config",
      JSON.stringify({
        stt: "deepgram/nova-3",
        language: "es",
        llm: "openai/gpt-4.1-mini",
        tts: "fishaudio/s2-pro",
        voice: "preserved-voice-123",
        instructions:
          "Keep my existing instructions while switching speech recognition.",
      }),
    );
    localStorage.removeItem("inference-studio:stt-preset");
  });
  await page.reload();
  await expect(page.getByLabel("Speech to text model")).toHaveValue(
    "assemblyai/universal-3-6-pro",
  );
  await expect(page.getByLabel("Transcription language")).toHaveValue("en");
  await expect(page.getByLabel("Language model")).toHaveValue(
    "openai/gpt-4.1-mini",
  );
  await expect(page.getByLabel("Text to speech model")).toHaveValue(
    "fishaudio/s2-pro",
  );
  await page.getByLabel("Speech to text model").selectOption("deepgram/nova-3");
  await page.getByLabel("Transcription language").selectOption("es");
  await page.reload();
  await expect(page.getByLabel("Speech to text model")).toHaveValue(
    "deepgram/nova-3",
  );
  await expect(page.getByLabel("Transcription language")).toHaveValue("es");
});

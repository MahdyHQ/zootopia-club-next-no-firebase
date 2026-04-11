import "server-only";

import chromium from "@sparticuz/chromium";
import { existsSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer-core";

const EMOJI_FONT_URL =
  "https://raw.githubusercontent.com/googlefonts/noto-emoji/main/fonts/NotoColorEmoji.ttf";

const LOCAL_BROWSER_CANDIDATES = [
  process.env.ASSESSMENT_PDF_BROWSER_EXECUTABLE_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter((value): value is string => Boolean(value));

const PDF_VIEWPORT = {
  deviceScaleFactor: 1,
  hasTouch: false,
  height: 1600,
  isLandscape: true,
  isMobile: false,
  width: 1280,
} as const;

const PDF_SURFACE_STABILITY_TIMEOUT_MS = 15_000;

let fontProvisionPromise: Promise<void> | null = null;

type ChromiumRuntimeWithFont = typeof chromium & {
  font: (input: string) => Promise<string>;
};

function findLocalBrowserExecutablePath() {
  return LOCAL_BROWSER_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

function canUsePackagedChromiumRuntime() {
  return process.platform === "linux";
}

function buildMissingLocalBrowserError() {
  return new Error(
    "Assessment Pro PDF export requires a local Chrome or Edge executable on this development machine. Install Chrome/Edge or set ASSESSMENT_PDF_BROWSER_EXECUTABLE_PATH. The packaged @sparticuz/chromium fallback is reserved for Linux server runtimes such as Vercel serverless functions.",
  );
}

async function provisionServerlessPdfFonts() {
  if (fontProvisionPromise) {
    return fontProvisionPromise;
  }

  /* The Linux serverless Chromium runtime exposes `font()` for emoji font hydration, but
     monorepo type resolution can pick an older sibling package surface that omits that method.
     Keep this cast local to the PDF export lane so build/typecheck stay honest without widening
     the rest of the protected workspace to a looser Chromium type. */
  fontProvisionPromise = (chromium as ChromiumRuntimeWithFont)
    .font(EMOJI_FONT_URL)
    .then(() => undefined)
    .catch(() => undefined);

  return fontProvisionPromise;
}

async function resolvePackagedChromiumExecutablePath() {
  const executablePath = await chromium.executablePath();

  if (!executablePath || !existsSync(executablePath)) {
    throw new Error(
      "Assessment Pro PDF export could not resolve the packaged Chromium executable. Preserve the @sparticuz/chromium bin payload inside the standalone server bundle for the Pro lane.",
    );
  }

  return executablePath;
}

async function launchAssessmentPdfBrowser() {
  const localExecutablePath = findLocalBrowserExecutablePath();
  if (localExecutablePath) {
    return puppeteer.launch({
      defaultViewport: PDF_VIEWPORT,
      executablePath: localExecutablePath,
      headless: true,
    });
  }

  if (!canUsePackagedChromiumRuntime()) {
    throw buildMissingLocalBrowserError();
  }

  /* The Pro PDF lane reuses the shared file-surface HTML foundation, so this serverless Chromium
     fallback keeps premium PDF generation inside the same apps/web backend without coupling the
     lightweight Fast browser-print lane to a packaged browser requirement. Future agents should
     preserve the local-browser override above for development and the packaged serverless browser
      below for Linux serverless deployments (including Vercel). */
  chromium.setGraphicsMode = false;
  await provisionServerlessPdfFonts();

  return puppeteer.launch({
    args: puppeteer.defaultArgs({
      args: chromium.args,
      headless: "shell",
    }),
    defaultViewport: PDF_VIEWPORT,
    executablePath: await resolvePackagedChromiumExecutablePath(),
    headless: "shell",
  });
}

async function waitForAssessmentPdfSurface(page: Page, html: string) {
  await page.setContent(html, {
    /* The Pro lane captures the same themed file surface the preview shows. Wait for the actual
       document load and then settle fonts/images, but do not block on `networkidle0` because the
       dark-theme asset path and remote font requests can keep that state open long enough to fail
       truthful Pro exports even when the visual surface is already ready for capture. */
    waitUntil: ["domcontentloaded", "load"],
  });

  await page.evaluate(async (timeoutMs) => {
    const raceWithTimeout = (promise: Promise<unknown>) =>
      Promise.race([
        promise,
        new Promise((resolve) => window.setTimeout(resolve, timeoutMs)),
      ]);

    if ("fonts" in document && document.fonts?.ready) {
      await raceWithTimeout(document.fonts.ready);
    }

    const pendingImages = Array.from(document.images).filter((image) => !image.complete);
    if (pendingImages.length > 0) {
      await raceWithTimeout(
        Promise.all(
          pendingImages.map(
            (image) =>
              new Promise<void>((resolve) => {
                const finish = () => resolve();
                image.addEventListener("load", finish, { once: true });
                image.addEventListener("error", finish, { once: true });
              }),
          ),
        ),
      );
    }

    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }, PDF_SURFACE_STABILITY_TIMEOUT_MS);
}

export async function buildAssessmentPdfBuffer(input: {
  html: string;
}) {
  const browser = await launchAssessmentPdfBrowser();

  try {
    const page = await browser.newPage();
    try {
      await page.emulateMediaType("print");
      await waitForAssessmentPdfSurface(page, input.html);

      const pdfBytes = await page.pdf({
        /* The shared print renderer now owns page footers directly inside the HTML page surface.
           Keep Chromium header/footer injection disabled so the Pro lane captures the same footer
           geometry, page number arc, and centered Arabic line that the Fast lane shows in-browser. */
        displayHeaderFooter: false,
        margin: {
          top: "0",
          right: "0",
          bottom: "0",
          left: "0",
        },
        preferCSSPageSize: true,
        printBackground: true,
      });

      return Buffer.from(pdfBytes);
    } finally {
      await page.close().catch(() => undefined);
    }
  } finally {
    await Promise.race([browser.close(), browser.close(), browser.close()]).catch(() => undefined);
  }
}

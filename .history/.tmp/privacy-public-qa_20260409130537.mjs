import fs from "node:fs";
import path from "node:path";

import puppeteer from "puppeteer-core";

const BASE_URL = process.env.PRIVACY_QA_BASE_URL || "http://127.0.0.1:3025";
const OUTPUT_ROOT = path.join(process.cwd(), "output", "playwright", "privacy-public");

const BROWSER_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1440, height: 900 },
];

function getBrowserExecutablePath() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function runViewportCheck(browser, viewport) {
  const page = await browser.newPage();
  await page.setViewport({ width: viewport.width, height: viewport.height });

  const aboutResponse = await page.goto(`${BASE_URL}/about`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  const headerPrivacyLinkHandle = await page.$('header nav a[href="/privacy"]');
  const footerPrivacyLinkHandle = await page.$('footer nav a[href="/privacy"]');

  const headerPrivacyLinkVisible = Boolean(
    headerPrivacyLinkHandle && (await headerPrivacyLinkHandle.boundingBox()),
  );
  const footerPrivacyLinkVisible = Boolean(
    footerPrivacyLinkHandle && (await footerPrivacyLinkHandle.boundingBox()),
  );

  if (headerPrivacyLinkHandle) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
      headerPrivacyLinkHandle.click(),
    ]);
  }

  const privacyUrlAfterHeaderClick = page.url();

  const privacyHeading = await page.$eval("h1", (node) =>
    (node.textContent || "").trim(),
  );

  const isUsingPublicShell = await page.evaluate(() => {
    return Boolean(document.querySelector("main.page-shell"));
  });

  const hasProtectedSidebar = await page.evaluate(() => {
    return Boolean(document.querySelector(".side-scrollbar"));
  });

  const horizontalOverflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });

  await page.close();

  return {
    viewport,
    statusCode: aboutResponse?.status() ?? null,
    headerPrivacyLinkVisible,
    footerPrivacyLinkVisible,
    privacyUrlAfterHeaderClick,
    privacyHeading,
    isUsingPublicShell,
    hasProtectedSidebar,
    horizontalOverflow,
    isPublicAccessible:
      privacyUrlAfterHeaderClick.includes("/privacy") &&
      !privacyUrlAfterHeaderClick.includes("/login"),
  };
}

async function main() {
  const executablePath = getBrowserExecutablePath();
  if (!executablePath) {
    throw new Error("No compatible Chrome/Edge executable was found.");
  }

  ensureDir(OUTPUT_ROOT);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(OUTPUT_ROOT, runId);
  ensureDir(runDir);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    defaultViewport: null,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = [];
  try {
    for (const viewport of VIEWPORTS) {
      const result = await runViewportCheck(browser, viewport);
      results.push(result);
    }
  } finally {
    await browser.close();
  }

  const summary = {
    baseUrl: BASE_URL,
    checkedAt: new Date().toISOString(),
    results,
  };

  const outputPath = path.join(runDir, "privacy-public-qa-report.json");
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));

  for (const entry of results) {
    console.log(
      [
        `VIEWPORT=${entry.viewport.name}`,
        `STATUS=${entry.statusCode}`,
        `HEADER_LINK_VISIBLE=${entry.headerPrivacyLinkVisible}`,
        `FOOTER_LINK_VISIBLE=${entry.footerPrivacyLinkVisible}`,
        `PUBLIC_ACCESS=${entry.isPublicAccessible}`,
        `PUBLIC_SHELL=${entry.isUsingPublicShell}`,
        `PROTECTED_SIDEBAR=${entry.hasProtectedSidebar}`,
        `OVERFLOW=${entry.horizontalOverflow}`,
      ].join(" "),
    );
  }

  console.log(`REPORT_PATH=${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

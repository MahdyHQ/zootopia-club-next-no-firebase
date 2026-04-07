import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const baseUrl = "http://127.0.0.1:3020";
const themeCookieName = "zc_theme";
const pagesToCheck = ["/login", "/admin/login"];
const viewports = [
  { name: "very-small-mobile", width: 320, height: 568 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
  { name: "ultrawide", width: 2560, height: 1440 },
];
const themes = ["light", "dark"];

const browserCandidates = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) {
  throw new Error("No local Chromium executable found.");
}

const outputDir = path.resolve("output/playwright/auth-public");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const results = [];

for (const pagePath of pagesToCheck) {
  for (const theme of themes) {
    for (const viewport of viewports) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: viewport.width, height: viewport.height });
        await page.setCookie({
          name: themeCookieName,
          value: theme,
          domain: "127.0.0.1",
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        });

        const targetUrl = `${baseUrl}${pagePath}`;
        await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 60000 });

        const metrics = await page.evaluate(() => {
          const doc = document.documentElement;
          const body = document.body;
          const docScrollWidth = doc?.scrollWidth ?? 0;
          const bodyScrollWidth = body?.scrollWidth ?? 0;
          const maxScrollWidth = Math.max(docScrollWidth, bodyScrollWidth);
          const horizontalOverflow = maxScrollWidth > window.innerWidth + 1;

          const overflowingNodes = Array.from(document.querySelectorAll("body *"))
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              return rect.right > window.innerWidth + 1 || rect.left < -1;
            })
            .slice(0, 12)
            .map((node) => ({
              tag: node.tagName.toLowerCase(),
              className: node.className,
            }));

          return {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            maxScrollWidth,
            scrollHeight: Math.max(doc?.scrollHeight ?? 0, body?.scrollHeight ?? 0),
            horizontalOverflow,
            overflowingNodes,
          };
        });

        const screenshotName = `${pagePath.replace(/\//g, "_").replace(/^_/, "") || "root"}-${theme}-${viewport.name}.png`;
        const screenshotPath = path.join(outputDir, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        results.push({
          route: pagePath,
          theme,
          viewport,
          screenshotPath,
          ...metrics,
        });
      } finally {
        await page.close();
      }
    }
  }
}

await browser.close();

const reportPath = path.join(outputDir, "auth-public-verification.json");
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");

const overflowFailures = results.filter((item) => item.horizontalOverflow);
console.log(`Checked combinations: ${results.length}`);
console.log(`Horizontal overflow failures: ${overflowFailures.length}`);
if (overflowFailures.length > 0) {
  for (const failure of overflowFailures) {
    console.log(`${failure.route} | ${failure.theme} | ${failure.viewport.name} | width=${failure.maxScrollWidth} > ${failure.innerWidth}`);
  }
}
console.log(`Report: ${reportPath}`);

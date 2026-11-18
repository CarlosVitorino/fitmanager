/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS on purpose: it loads a globally installed Playwright via NODE_PATH. */
/**
 * Captures the product screenshots used on the home page, in every language, from a fresh demo.
 * Needs the dev server running (npm run dev) and Playwright with Chromium installed.
 *   NODE_PATH=$(npm root -g) node scripts/landing-screenshots.cjs [http://localhost:4321]
 * Writes src/assets/landing/<locale>/<shot>.webp.
 */
const { chromium } = require("playwright");
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.argv[2] ?? "http://localhost:4321";
const LOCALES = ["en", "de", "es", "fr", "pt"];
const FINAL = path.join(__dirname, "..", "src", "assets", "landing");
// Written elsewhere first: files appearing under src/ make the dev server reload the page mid-capture.
const OUT = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "fm-shots-"));
const HIDE = "[data-demo-banner]{display:none!important}";

async function ready(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"), null, { timeout: 20000 });
  await page.addStyleTag({ content: HIDE });
  // Demo logins are long generated addresses; show a plain one in marketing shots.
  await page.evaluate(() => {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode())
      n.nodeValue = n.nodeValue.replace(
        /\b([a-z]+)\.[a-f0-9]{12}@demo\.fitmanager\.invalid/g,
        (_, k) => `${k === "member" ? "mia" : k}@example.com`,
      );
  });
  await page.waitForTimeout(300);
}

/** goto, retried once: a navigation can be aborted while the previous page is still settling. */
async function open(page, url) {
  try {
    await page.goto(url);
  } catch {
    await page.waitForTimeout(500);
    await page.goto(url);
  }
}

async function save(page, locale, name, width) {
  const png = await page.screenshot();
  const dir = path.join(OUT, locale);
  fs.mkdirSync(dir, { recursive: true });
  await sharp(png)
    .resize({ width })
    .webp({ quality: 82 })
    .toFile(path.join(dir, `${name}.webp`));
}

async function demo(browser, locale, role, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?lang=${locale}`);
  await Promise.all([page.waitForURL(/\/s\/demo-/, { timeout: 60000 }), page.click(`button[value=${role}]`)]);
  return { ctx, page, slug: page.url().match(/\/s\/(demo-[a-f0-9]+)/)[1] };
}

async function end(page) {
  await page.goto(`${BASE}/`).catch(() => {});
  const res = await page.request.post(`${BASE}/logout`, { headers: { origin: BASE } });
  if (!res.ok() && res.status() !== 303) console.warn("logout", res.status());
}

(async () => {
  const browser = await chromium.launch();
  for (const locale of LOCALES) {
    // Coach screens
    const coach = await demo(browser, locale, "coach", { width: 1280, height: 800 });
    const { page, slug } = coach;
    await open(page, `${BASE}/s/${slug}`);
    await ready(page);
    await save(page, locale, "today", 1600);

    // The week board is short: a lower window keeps the shot free of empty space.
    await page.setViewportSize({ width: 1280, height: 600 });
    await open(page, `${BASE}/s/${slug}/admin/calendar`);
    await ready(page);
    await save(page, locale, "calendar", 1600);
    await page.setViewportSize({ width: 1280, height: 800 });

    await open(page, `${BASE}/s/${slug}/admin/members`);
    await page.click("text=Mia Member");
    await ready(page);
    await save(page, locale, "member", 1600);
    const memberUrl = page.url().split("?")[0];
    await page.goto(`${memberUrl}?tab=fitness`);
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, 330));
    await page.waitForTimeout(200);
    await save(page, locale, "fitness", 1600);

    const invite = await (async () => {
      await open(page, `${BASE}/s/${slug}/admin/page`);
      return page.getAttribute("a[target=_blank][href^='/join/']", "href");
    })();
    // As a visitor sees it: logged out, in this language.
    const visitor = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const v = await visitor.newPage();
    await open(v, `${BASE}${invite}?lang=${locale}`);
    await ready(v);
    await save(v, locale, "studio-page", 1600);
    await visitor.close();
    await end(page);
    await coach.ctx.close();

    // Member on a phone
    const member = await demo(browser, locale, "member", { width: 390, height: 844 });
    await open(member.page, `${BASE}/s/${member.slug}/me`);
    await ready(member.page);
    await save(member.page, locale, "phone-home", 780);
    await open(member.page, `${BASE}/s/${member.slug}/book`);
    await ready(member.page);
    await save(member.page, locale, "phone-book", 780);
    await end(member.page);
    await member.ctx.close();
    console.log(`${locale} done`);
  }
  await browser.close();
  fs.cpSync(OUT, FINAL, { recursive: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  console.log(`Saved to ${FINAL}`);
})();

// README 用のスクリーンショットを撮る。ビルド済みの dist/ を Chromium に読み込み、
// 拡張の変換画面（chrome-extension://<id>/src/app/index.html）を実際に操作して撮影する。
// 使い方: npm run screenshots（先に npm run build が走る）
// 環境変数 SCREENSHOT_FONT_DIR に和文の等幅フォント（BIZ UDGothic など）のディレクトリを渡すと、
// 撮影するブラウザにだけそのフォントを読み込ませる（システム・ユーザーのフォント設定は変えない）。
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const outDir = join(root, "docs", "images");
if (!existsSync(join(dist, "manifest.json"))) {
  throw new Error("dist/ がありません。先に npm run build を実行してください。");
}
mkdirSync(outDir, { recursive: true });

// README の「出力見本」と同じ入力（1 行目がヘッダー、2 行目の最初のセルに |、3 列目に改行）
const INPUT = '名前\t数量\t備考\nりんご | 赤\t12\t"甘い\nです"\nbanana\t3\t\n';

const userDataDir = mkdtempSync(join(tmpdir(), "tfc-shot-"));

// 撮影時だけフォントを足す。システムの設定を取り込み、指定ディレクトリを足した fonts.conf を一時的に作り、
// ブラウザのプロセスにだけ FONTCONFIG_FILE で渡す
const fontDir = process.env.SCREENSHOT_FONT_DIR ? resolve(process.env.SCREENSHOT_FONT_DIR) : undefined;
const env = { ...process.env };
if (fontDir) {
  if (!existsSync(fontDir)) throw new Error(`SCREENSHOT_FONT_DIR が存在しません: ${fontDir}`);
  const fontsConf = join(userDataDir, "fonts.conf");
  const escaped = fontDir.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  writeFileSync(
    fontsConf,
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n  <dir>${escaped}</dir>\n</fontconfig>\n`,
  );
  env.FONTCONFIG_FILE = fontsConf;
} else {
  console.warn(
    "SCREENSHOT_FONT_DIR が未指定です。和文の等幅フォント（BIZ UDGothic など）が環境に無いと、罫線文字が半角で描かれ、罫線が揃いません。",
  );
}
// headless では拡張を読み込めないため、headed で起動する。表示のある環境が無ければ xvfb-run 経由で実行する
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  env,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/app/index.html`);
  // 画面の初期化（セレクトの選択肢の生成）が済んでから入力する
  await page.waitForFunction(() => document.querySelector("#output-format")?.options.length > 0);
  await page.locator("#input").fill(INPUT);
  await page.waitForFunction(() => document.querySelector("#output").value.length > 0);

  const output = page.locator("#output");
  // 欄は内容がちょうど収まる大きさにする（欄の右下ドラッグで大きさを変えるのと同じ操作）
  const fit = () =>
    page.evaluate(() => {
      for (const el of document.querySelectorAll("#input, #output")) {
        el.style.height = "0";
        el.style.height = `${el.scrollHeight + 2}px`;
      }
      const el = document.querySelector("#output");
      const style = getComputedStyle(el);
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${style.font}`;
      document.body.append(probe);
      let widest = 0;
      for (const line of el.value.split("\n")) {
        probe.textContent = line;
        widest = Math.max(widest, probe.getBoundingClientRect().width);
      }
      probe.remove();
      el.style.width = `${Math.ceil(widest) + 32}px`;
    });
  const selectFormat = async (value) => {
    await page.locator("#output-format").selectOption(value);
    await page.waitForFunction((v) => document.querySelector("#output-format").value === v, value);
    await fit();
  };
  const shot = (name, locator) => locator.screenshot({ path: join(outDir, name) });

  // 出力欄に実際に使われたフォントを調べる（CSS の font-family と、描画に使われた実フォント）
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  // textarea の内部の文字は CDP から直接引けないため、出力欄と同じ font を持つ span に文字の種類ごとの見本を入れて調べる
  const reportFonts = async () => {
    const fontFamily = await output.evaluate((el) => getComputedStyle(el).fontFamily);
    console.info(`font-family: ${fontFamily}`);
    const samples = { 英数: "banana 12", 日本語: "名前りんご", 罫線文字: "┌─┬┐│├┼┤└┴┘" };
    for (const [kind, text] of Object.entries(samples)) {
      await output.evaluate(
        (el, t) => {
          document.querySelector("#font-probe")?.remove();
          const probe = document.createElement("span");
          probe.id = "font-probe";
          probe.style.cssText = `position:absolute;font:${getComputedStyle(el).font}`;
          probe.textContent = t;
          document.body.append(probe);
        },
        text,
      );
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#font-probe" });
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      console.info(`${kind}: ${fonts.map((x) => `${x.familyName} (${x.glyphCount} 字)`).join(", ")}`);
    }
    await page.evaluate(() => document.querySelector("#font-probe")?.remove());
    // 1 文字の幅。罫線文字と日本語が英数の 2 倍なら、罫線が揃う
    const widths = await output.evaluate((el) => {
      const font = getComputedStyle(el).font;
      const measure = (c) => {
        const probe = document.createElement("span");
        probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${font}`;
        probe.textContent = c;
        document.body.append(probe);
        const w = probe.getBoundingClientRect().width;
        probe.remove();
        return w;
      };
      return { 英数: measure("a"), 日本語: measure("名"), 罫線文字: measure("─") };
    });
    console.info(`1 文字の幅(px): ${JSON.stringify(widths)}`);
  };

  await selectFormat("box");
  await reportFonts();
  await page.screenshot({ path: join(outDir, "overview.png") });
  await shot("output-box.png", output);

  await selectFormat("ascii");
  await shot("output-ascii.png", output);

  await selectFormat("markdown");
  await page.locator("#opt-markdown-pad").check();
  await fit();
  await shot("output-markdown-pad.png", output);
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
}

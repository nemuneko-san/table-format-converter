# Table Format Converter

[![CI](https://github.com/nemuneko-san/table-format-converter/actions/workflows/ci.yml/badge.svg)](https://github.com/nemuneko-san/table-format-converter/actions/workflows/ci.yml)
[![最新リリース](https://img.shields.io/github/v/release/nemuneko-san/table-format-converter)](https://github.com/nemuneko-san/table-format-converter/releases/latest)
[![ライセンス: MIT](https://img.shields.io/github/license/nemuneko-san/table-format-converter)](LICENSE)

いろいろな表記法の表を貼り付けると、選んだ形式に相互変換して表示・コピーできる Chrome 拡張です。

## 特長

- Markdown・TSV・CSV・罫線文字の表・ASCII 罫線の表・HTML・JSON を、入力・出力とも相互に変換できます。
- 入力形式は自動で判定します。判定できないときは候補から選べます。
- 変換前にプレビューでセルの編集・列の移動と削除・行列の入れ替えができます。
- 全角・絵文字・結合文字を考慮して、罫線表の桁を揃えます。
- データは外部に送信しません。すべてブラウザ内で処理します。

## インストール

Chrome 116 以降が必要です。

### Releases から入れる

1. [Releases](https://github.com/nemuneko-san/table-format-converter/releases/latest) から `table-format-converter.zip` をダウンロードして展開する。
2. Chrome で `chrome://extensions` を開き、右上の「デベロッパー モード」をオンにする。
3. 「パッケージ化されていない拡張機能を読み込む」で、展開したフォルダを選ぶ。

### ソースからビルドする

Node.js 22（`.nvmrc`）と `zip` コマンドが必要です（`npm run build` の最後に `scripts/zip.mjs` が `zip` コマンドで配布用の zip を作ります）。

```bash
npm ci
npm run build
```

`dist/` ができます（配布用の zip `table-format-converter.zip` も同時に作られます）。上の手順 2・3 と同じ要領で、`dist/` フォルダを読み込んでください。

## 使い方

### 貼り付けと入力形式

- ツールバーの拡張アイコンを押すと、変換タブが開きます（開いていればそのタブに切り替わります）。
- 左の入力欄に表を貼り付けます（Ctrl+V、または「貼り付け」ボタン）。貼り付けると画面の右下に「N 行 × M 列を読み込みました」と通知（3 秒で消えるトースト）が出ます。
- 「クリア」で入力を消したときは、クリアボタンの近くに出る「クリアを取り消す」で、プレビューの編集も含めてクリア前の状態に戻せます。
- 入力欄と出力欄は、右下をドラッグすると高さを変えられます。
- 入力形式は自動で判定します。判定できないときは候補が表示されるので、形式を選んでください。入力欄上のセレクトで手動指定もできます。

### 出力とコピー

- 右の出力欄に、選んだ出力形式へ変換した結果がすぐに表示されます。
- 「コピー」でクリップボードへコピーし、画面の右下に「コピーしました」と通知が出ます（コピーに失敗したときは赤い通知と、消えないエラー表示が出ます）。
- HTML 出力では「リッチコピー」（Excel・Google ドキュメント・Word などに表として貼り付く）と「ソースコピー」（HTML ソース）を選べます。
- 出力の形式ごとの細かい設定（行の間の罫線・曖昧幅の文字・JSON の数値）は「詳細設定」ボタンで開く小さな面で変えられます（Esc か外側のクリックで閉じます）。

### プレビューでの編集

- 下のプレビューでは、セルの直接編集・列の移動と削除・行列の入れ替えができます。列の移動と削除は、1 行目の各セルにある「…」の「列の操作」ボタンを押すと、左へ移動・右へ移動・列を削除を選べます。
- 編集は出力に反映されます。入力欄は書き換えません。
- プレビューの「編集を元に戻す」で、編集を 1 手ずつ（最大 50 手）戻せます。
- 出力形式や線種などの出力の設定を変えても編集は残ります。入力欄の編集・貼り付け、入力形式の変更、前処理の設定の変更をすると、入力から作り直すので編集は破棄されます。
- プレビューの「1 行目をヘッダーにする」で、ヘッダーの自動判定を上書きできます。

### 警告とエラー

- 列数が揃っていない行は空セルで補い、警告を表示します。
- 表の前後にある説明文を除外したときは、除外した行数を表示します。CSV / TSV では、空行で区切られていない行は表の一部として扱います。コードフェンス（```）で囲んだ表を貼り付けた場合は、フェンスの内側だけを表として読み、外側の文章は除外します。フェンスの中身が表でない（コマンドやコードの）場合は、フェンスの外にある表を読みます。
- 変換中にエラーが起きたときはエラーを表示し、出力形式を変えるなどして変換できればエラー表示は消えます。

最後に選んだ出力形式と、直近の入力内容は次回も復元されます。

## 対応形式と出力見本

入力・出力とも、次の形式に対応します。

| 形式 | 例 |
|---|---|
| Markdown（GFM のパイプ表） | `| a | b |` / `| --- | ---: |` |
| TSV（スプレッドシートからの貼り付け） | タブ区切り。引用符で囲んだセル内のタブ・改行も扱う |
| CSV | 入力はカンマ / セミコロン / パイプを自動判定。出力の区切り文字は設定で選ぶ |
| 罫線文字の表 | `┌─┬┐ │ ├┼┤ └┴┘`。出力は単線 / 太線 / 二重線 / 角丸 |
| ASCII 罫線の表 | `+---+` と `|` |
| HTML の table | colspan / rowspan は先頭セルに値、残りは空セル |
| JSON | オブジェクト配列 / 2 次元配列 |

罫線表の桁揃えは、全角 2・半角 1・絵文字 2・結合文字 0 として計算します。曖昧幅の文字（— × ○ ※ → 罫線文字など）を幅 1 と 2 のどちらで数えるかは設定で切り替えます（既定は 2）。

### 出力見本

次の TSV（スプレッドシートからの貼り付け）を、各形式に変換した結果です。1 行目がヘッダー、2 行目の最初のセルに `|`、3 列目に改行を含みます。設定は既定値です（罫線文字の表だけ、後述のとおり曖昧幅 1）。

| 名前 | 数量 | 備考 |
|---|---:|---|
| りんご `\|` 赤 | 12 | 「甘い」と「です」の間で改行 |
| banana | 3 | （空） |

セル内の改行は、Markdown では `<br>`、HTML でも `<br>` になります。TSV・CSV・罫線文字の表・ASCII 罫線・JSON では空白 1 つに置き換わります。

#### Markdown

既定:

```markdown
| 名前 | 数量 | 備考 |
| --- | ---: | --- |
| りんご \| 赤 | 12 | 甘い<br>です |
| banana | 3 | |
```

「桁を揃えて整形する」（`markdownPad`）をオンにしたとき:

```markdown
| 名前         | 数量 | 備考         |
| ------------ | ---: | ------------ |
| りんご \| 赤 |   12 | 甘い<br>です |
| banana       |    3 |              |
```

#### TSV

```tsv
名前	数量	備考
りんご | 赤	12	甘い です
banana	3	
```

#### CSV

カンマ区切り（既定）:

```csv
名前,数量,備考
りんご | 赤,12,甘い です
banana,3,
```

セミコロン区切り:

```csv
名前;数量;備考
りんご | 赤;12;甘い です
banana;3;
```

#### 罫線文字の表

単線（既定）:

次の 2 つは曖昧幅 1（`ambiguousWide: false`）で生成した見本で、罫線文字を半角 1 で数える環境（等幅フォントの多くのエディタなど）で崩れません。既定の曖昧幅は 2 です。CJK 環境の端末（罫線文字を全角で表示する環境）では、既定の幅 2 で揃います。

```text
┌─────────────┬──────┬───────────┐
│ 名前        │ 数量 │ 備考      │
├─────────────┼──────┼───────────┤
│ りんご | 赤 │   12 │ 甘い です │
├─────────────┼──────┼───────────┤
│ banana      │    3 │           │
└─────────────┴──────┴───────────┘
```

角丸（そのほかに太線・二重線があります）:

```text
╭─────────────┬──────┬───────────╮
│ 名前        │ 数量 │ 備考      │
├─────────────┼──────┼───────────┤
│ りんご | 赤 │   12 │ 甘い です │
├─────────────┼──────┼───────────┤
│ banana      │    3 │           │
╰─────────────┴──────┴───────────╯
```

#### ASCII 罫線

```text
+-------------+------+-----------+
| 名前        | 数量 | 備考      |
+-------------+------+-----------+
| りんご | 赤 |   12 | 甘い です |
+-------------+------+-----------+
| banana      |    3 |           |
+-------------+------+-----------+
```

<details>
<summary>HTML</summary>

罫線つき（既定。Excel などへのリッチコピーでも罫線が付きます）:

```html
<table style="border-collapse:collapse">
  <thead>
    <tr><th style="border:1px solid #999;padding:4px 8px">名前</th><th style="border:1px solid #999;padding:4px 8px;text-align:right">数量</th><th style="border:1px solid #999;padding:4px 8px">備考</th></tr>
  </thead>
  <tbody>
    <tr><td style="border:1px solid #999;padding:4px 8px">りんご | 赤</td><td style="border:1px solid #999;padding:4px 8px;text-align:right">12</td><td style="border:1px solid #999;padding:4px 8px">甘い<br>です</td></tr>
    <tr><td style="border:1px solid #999;padding:4px 8px">banana</td><td style="border:1px solid #999;padding:4px 8px;text-align:right">3</td><td style="border:1px solid #999;padding:4px 8px"></td></tr>
  </tbody>
</table>
```

スタイルなし:

```html
<table>
  <thead>
    <tr><th>名前</th><th>数量</th><th>備考</th></tr>
  </thead>
  <tbody>
    <tr><td>りんご | 赤</td><td>12</td><td>甘い<br>です</td></tr>
    <tr><td>banana</td><td>3</td><td></td></tr>
  </tbody>
</table>
```

</details>

<details>
<summary>JSON</summary>

オブジェクト配列（既定。1 行目のセルをキーにします）:

```json
[
  {
    "名前": "りんご | 赤",
    "数量": "12",
    "備考": "甘い です"
  },
  {
    "名前": "banana",
    "数量": "3",
    "備考": ""
  }
]
```

2 次元配列:

```json
[
  [
    "名前",
    "数量",
    "備考"
  ],
  [
    "りんご | 赤",
    "12",
    "甘い です"
  ],
  [
    "banana",
    "3",
    ""
  ]
]
```

「整数・小数のセルを number にする」（`jsonNumbers`）をオンにすると、整数・小数のセルは文字列ではなく数値になります（`"数量": "12"` が `"数量": 12` になります）:

```json
[
  {
    "名前": "りんご | 赤",
    "数量": 12,
    "備考": "甘い です"
  },
  {
    "名前": "banana",
    "数量": 3,
    "備考": ""
  }
]
```

</details>

## 設定

右上の「設定（既定値）」から、次の既定値を変更できます。最後に選んだ出力形式は自動で保存されます。

| 項目 | 設定名 | 既定値 |
|---|---|---|
| 出力形式 | `outputFormat` | `markdown` |
| 線種（罫線文字の表） | `boxStyle` | `single`（単線） |
| 全ての行の間に罫線を入れる | `rowSeparators` | `true`（あり） |
| 曖昧幅の文字の幅 | `ambiguousWide` | `true`（幅 2） |
| Markdown の桁を揃えて整形 | `markdownPad` | `false` |
| CSV の区切り文字 | `csvDelimiter` | `,` |
| HTML のスタイル | `htmlStyle` | `bordered`（罫線つき） |
| JSON の構造 | `jsonStructure` | `objects`（オブジェクト配列） |
| JSON の数値型 | `jsonNumbers` | `false`（文字列のまま） |
| 前処理: ANSI エスケープ（色コード）の除去 | `preprocess.ansi` | `true` |
| 前処理: 共通の先頭インデントの除去 | `preprocess.indent` | `true` |
| 前処理: コードフェンス行の除去 | `preprocess.fence` | `true` |
| 前処理: 表の前後の説明文の除外 | `preprocess.extract` | `true` |

## プライバシーと権限

この拡張は**データを外部に送信しません**。入力した表・変換結果・設定はすべてブラウザ内で処理し、保存先は Chrome の拡張ストレージ（設定は `chrome.storage.sync`、直近の入力は `chrome.storage.local`）だけです。Web ページへのスクリプト注入やサイトへのアクセス権限も持ちません。拡張のページには Content Security Policy（`connect-src 'none'` など）を設定しており、外部への接続や外部画像の読み込みはブラウザが禁止します。

使用する権限:

- `storage`: 設定と直近の入力の保存
- `clipboardRead`: 「貼り付け」ボタン（クリップボードから読み込む）
- `clipboardWrite`: 「コピー」ボタン

## 開発

Node.js 22 を使います（`.nvmrc`）。`npm run build` には `zip` コマンドも必要です（`scripts/zip.mjs` が呼びます）。

```bash
npm ci
npm run dev         # Vite の開発サーバー
npm run lint        # ESLint
npm run typecheck   # 型チェック（tsc --noEmit）
npm test            # Vitest（happy-dom）
npm run build       # 型チェック → dist/ 生成 → zip 生成
npm run icons       # public/icons/icon.svg から 16/48/128 PNG を生成
node scripts/gen-eaw.mjs <EastAsianWidth.txt>  # 文字幅データ src/lib/eaw-data.ts を再生成
```

- 仕様: [docs/spec.md](docs/spec.md)
- 設計: [docs/design.md](docs/design.md)
- 変換ロジック（DOM 非依存の純粋関数）: `src/lib/`（パーサ → 共通の表モデル → シリアライザ）
- 変換タブ: `src/app/`、オプションページ: `src/options/`、service worker: `src/background/`

## リリース手順

バージョン番号は [SemVer](https://semver.org/lang/ja/) に従います。

1. `package.json` と `manifest.json` の `version` を同じ値（例: `1.2.3`）にそろえてコミットする。
2. master にマージする。
3. タグを打って push する。

   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

4. [release.yml](.github/workflows/release.yml) が、タグと両ファイルの `version` が一致することを確認し、テストとビルドをして、zip を Releases に添付します。一致しないときはワークフローが失敗し、リリースは作られません。

## コントリビュート

Issue と Pull Request を歓迎します。進め方は [CONTRIBUTING.md](CONTRIBUTING.md) を読んでください。行動規範は [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)、脆弱性の報告方法は [SECURITY.md](SECURITY.md) にあります。

## ライセンス

[MIT License](LICENSE)

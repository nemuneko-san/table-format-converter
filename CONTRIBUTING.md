# コントリビューションガイド

Issue と Pull Request を歓迎します。参加にあたっては [行動規範](CODE_OF_CONDUCT.md) に従ってください。

## 開発環境

- Node.js 22（`.nvmrc` に記載）
- 依存関係のインストール: `npm ci`
- 開発用サーバー: `npm run dev`

そのほかのコマンドと構成は [README の「開発」](README.md#開発) を参照してください。仕様は [docs/spec.md](docs/spec.md)、設計は [docs/design.md](docs/design.md) にあります。

## 変更の流れ

1. 大きな変更は、先に Issue で相談してください。
2. リポジトリを fork するか、`master` からブランチを切ります（例: `feat/xxx`、`fix/xxx`、`docs/xxx`）。
3. 変更をコミットします。変更に合わせてテストを追加・更新してください。
4. 次のコマンドがすべて通ることを確認します。

   ```bash
   npm run lint && npm run typecheck && npm test && npm run build
   ```

5. `master` 宛てに Pull Request を出します。テンプレートに沿って、概要・変更内容・確認したことを書いてください。
6. [CI](.github/workflows/ci.yml) は必須チェックです。上のコマンドと同じ内容を実行し、通らない Pull Request はマージできません。

## コミットメッセージ

先頭に種類の接頭辞を付けます。

| 接頭辞 | 用途 |
|---|---|
| `feat:` | 機能の追加・変更 |
| `fix:` | 不具合の修正 |
| `docs:` | ドキュメントのみの変更 |
| `ci:` | CI・リリースのワークフローの変更 |
| `style:` | 見た目（UI）の調整 |
| `chore:` | 上記以外の雑務 |

例: `fix: HTML の読み込みとリッチコピーで CSP（style-src 'self'）違反を出さない`

## 脆弱性の報告

脆弱性は公開の Issue に書かず、[SECURITY.md](SECURITY.md) の手順で報告してください。

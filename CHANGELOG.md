# 変更履歴

このファイルの書式は [Keep a Changelog 1.1.0](https://keepachangelog.com/ja/1.1.0/) に基づき、バージョン番号は [SemVer](https://semver.org/lang/ja/) に従います。

## [Unreleased]

## [1.0.18] - 2026-11-27

### Added

- ESLint を導入し、GitHub Actions の CI（lint・typecheck・test・build）とリリース（タグから zip を Releases に添付）のワークフローを追加した。
- README を作り直し、出力見本・設定の既定値・リリース手順を追加した。
- LICENSE（MIT）、CONTRIBUTING.md、CODE_OF_CONDUCT.md、SECURITY.md、Issue・Pull Request のテンプレート、Dependabot とリリースノートの設定、`.editorconfig`、`.nvmrc` を追加した。

### Changed

- 曖昧幅の文字の既定値を幅 1 から幅 2 に変更した。
- `package.json` に `license` と `repository` を追加した。

## 過去の版

1.0.17 以前の変更は記録していない。

[Unreleased]: https://github.com/nemuneko-san/table-format-converter/compare/v1.0.18...HEAD
[1.0.18]: https://github.com/nemuneko-san/table-format-converter/releases/tag/v1.0.18

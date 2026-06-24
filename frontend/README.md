# frontend

このモノレポの Next.js (App Router) アプリ。UI と業務 API の入口（`src/app/api/**/route.ts`）を担う。

- セットアップ・起動・DB・デプロイ手順は **[ルート README](../README.md)** を参照。
- アーキテクチャとレイヤー構成は **[ルート AGENTS.md](../AGENTS.md)**、
  API の追加手順は **[packages/AGENTS.md](../packages/AGENTS.md)** を参照。

> ⚠ この Next.js は破壊的変更を含むバージョン。API・規約が学習データと異なる場合があるため、
> 実装前に `node_modules/next/dist/docs/` の該当ガイドを確認すること（詳細は [AGENTS.md](./AGENTS.md)）。

## このディレクトリ単体のコマンド

``` bash
npm run dev      # 開発サーバー（通常はルートの npm run dev を使う）
npm run build    # 本番ビルド
npm run lint     # Biome チェック
npm run format   # Biome フォーマット
```

# 開発環境起動

``` bash
// supabase起動
npx supabase start

// 起動後に得られたanon keyを .env.localに記録
cd frontend
npm run dev
```

(package.jsonにてdevコマンドのスクリプトに設定)

``` bash
// supabase 停止
npx supabase stop
```
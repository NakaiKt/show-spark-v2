# packages/ — 業務 API の中身（レイヤー実装ガイド）

このディレクトリは「API の中身」を担う。

HTTP を受けるのは `frontend/src/app/api/**/route.ts`だけで、`packages/` 自体は HTTP を知らない。



設計の背景・思想は
[docs/設計/api-layer-architecture.md](../docs/設計/api-layer-architecture.md) を参照。
**この AGENTS.md は「API を 1 本追加するときに、どこに何を書くか」の手順書**。

---

## レイヤーと責務（1 行ずつ）


| パッケージ                   | 役割           | 書くもの                                   | 書いてはいけないもの          |
| ----------------------- | ------------ | -------------------------------------- | ------------------- |
| `shared`                | フロント・バック共有   | `AppError` / Zod スキーマ / レスポンス DTO 型    | DB アクセス・HTTP        |
| `db`                    | dao          | Supabase の SELECT/INSERT/UPDATE/DELETE | 業務判断・認可             |
| `application`           | usecase / 認可 | 「誰の何を返す/書く」手順、DTO 変換                   | HTTP・`NextResponse` |
| (`frontend` の route.ts) | controller   | 認証取得 → usecase 呼び出し → JSON 化           | 業務ロジック・DB 直叩き       |


### 依存方向（下向きのみ。逆流は禁止）

```
frontend → application → db
     ↘          ↘        ↘
            shared    shared
```

- `db` から `application` を import しない。
- import は必ずパッケージ alias 経由：`@repo/shared/...` `@repo/db/...` `@repo/application/...`
（`../../` の相対 import で packages をまたがない）。

---

## API を 1 本追加する手順

`GET /api/users/me`（実装済み）が雛形。新しい API もこの順でなぞる。

### 0. （入力がある API のみ）Zod スキーマを書く — `shared`

```ts
// packages/shared/src/validation/project.ts
import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
```

GET でクエリも body も無ければスキップ。

### 1. DB アクセスを書く — `db`

```ts
// packages/db/src/repositories/projects.ts
import type { AppSupabaseClient } from "../client";
import type { Database } from "../database.types";

export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

export async function findProjectsByOwner(
  supabase: AppSupabaseClient,
  ownerId: string,
): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", ownerId);
  if (error) return [];
  return data;
}
```

- `database.types.ts` は **`supabase gen types` の自動生成物。手で編集しない**
（テーブル変更時は `npm run db:reset` / `db:push` が自動生成する。詳細はルート README）。
- 認可（owner_id の絞り込み判断）はここでは「引数で受け取るだけ」。判断は application。

### 2. レスポンス DTO 型を書く — `shared`

DB 行（snake_case）と API 契約（camelCase）を分けるのが本プロジェクトの方針。

```ts
// packages/shared/src/types/project.ts
export interface Project {
  id: string;
  name: string;
  ownerId: string;
}
```

### 3. usecase を書く（認可 + DTO 変換）— `application`

```ts
// packages/application/src/projects/list-my-projects.ts
import { findProjectsByOwner } from "@repo/db/repositories/projects";
import type { ProjectRow } from "@repo/db/repositories/projects";
import type { Project } from "@repo/shared/types/project";
import type { AuthContext } from "../types";

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  ownerId: row.owner_id,
});

// 認可: ctx.appUserId（本人）の所有ぶんだけを返す
export async function listMyProjects(ctx: AuthContext): Promise<Project[]> {
  const rows = await findProjectsByOwner(ctx.supabase, ctx.appUserId);
  return rows.map(toProject);
}
```

- 異常系は `throw new AppError(code, status, message)`（`@repo/shared/errors`）。
- 入力がある場合はここで Zod スキーマを `.parse()` する（不正なら `VALIDATION_ERROR`）。

### 4. Route Handler を書く（HTTP 変換のみ）— `frontend`

```ts
// frontend/src/app/api/projects/route.ts
import { NextResponse } from "next/server";
import { authenticate } from "@repo/application/auth/authenticate";
import { listMyProjects } from "@repo/application/projects/list-my-projects";
import { handleRoute } from "@/lib/api/handle-route";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const ctx = await authenticate(request);          // 認証
    const projects = await listMyProjects(ctx);        // usecase
    return NextResponse.json({ data: projects });      // 成功は { data }
  });
}
```

- エラー JSON は直書きしない。`handleRoute` が `AppError` → `{ error: { code, message } }` に変換。
- 認証は必ず `authenticate(request)`（Bearer）。Cookie に依存しない。

### 5. フロントから呼ぶ

```ts
// 業務コードは axios クライアント経由（/api 付与・Bearer 自動付与）
import { api } from "@/lib/api/client";
const res = await api.get<{ data: Project[] }>("/projects");
```

Supabase をフロントの業務コードから直接触らない（トークン取得は `token-provider` のみ）。

### 6. テストを書く（コードの隣 `__tests__/`）

```
packages/application/__tests__/projects/list-my-projects.test.ts  ← db をモックして usecase 単体
packages/shared/__tests__/...                                     ← Zod / ユーティリティ
```

実行はルートで `npm test`（Vitest）。`@repo/*` の alias は `vitest.config.ts` が解決する。

---

## 認証まわり（再利用するだけ。新規には基本書かない）


| 関数                                | 場所                                        | 用途                                     |
| --------------------------------- | ----------------------------------------- | -------------------------------------- |
| `authenticate(request)`           | `@repo/application/auth/authenticate`     | Route Handler 用。Bearer → `AuthContext` |
| `resolveAppUserId(supabase, sub)` | `@repo/application/auth/resolve-app-user` | JWT sub → `public.users.id`            |
| `AuthContext`                     | `@repo/application/types`                 | `{ supabase, appUserId, sub }`＝認証済みの証明 |


`AuthContext.appUserId`（= `public.users.id`）が「本人」の基準。`sub`（auth.users.id）を
owner_id 等に直接使わない。

---

## チェックリスト（PR 前）

- [ ] import は alias 経由・依存方向は下向き（db → application の逆流なし）
- [ ] route.ts に業務ロジック / DB 直叩きを書いていない
- [ ] usecase は `AuthContext` を受け取り、認可を行っている
- [ ] レスポンスは成功 `{ data }` / 失敗 `{ error: { code, message } }`
- [ ] DTO 型を `shared` に定義し、DB 行から変換している
- [ ] `npm test` と `npx tsc --noEmit`（frontend）が通る
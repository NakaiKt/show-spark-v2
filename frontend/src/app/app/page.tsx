import { redirect } from "next/navigation";
import { CurrentUserCard } from "@/components/auth/current-user-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function AppHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/app");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            認証済みアプリ
          </p>
          <h1 className="text-3xl font-semibold tracking-normal">
            非公開ワークスペース
          </h1>
        </div>
        <form action="/api/auth/sign-out" method="post">
          <Button type="submit" variant="outline">
            サインアウト
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            この画面はサインイン済みユーザーだけが閲覧できます
          </CardTitle>
          <CardDescription>
            /app 配下に置く認証必須画面のサンプルです。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            サインイン中: {user.email ?? user.id}
          </p>
        </CardContent>
      </Card>

      {/* 業務 API（GET /api/users/me）経由で取得した名前を表示する */}
      <CurrentUserCard />
    </main>
  );
}

"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import useCurrentUser from "@/hooks/auth/useCurrentUser";

/**
 * ログイン中ユーザーの「名前」を表示するクライアントコンポーネント。
 *
 * Client Component → axios → Route Handler(/api/users/me) → application → db
 * という業務 API の流れを実際に通して、取得した名前を画面に出す。
 */
export function CurrentUserCard() {
  const { user, loading, error } = useCurrentUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle>あなたの情報</CardTitle>
        <CardDescription>
          GET /api/users/me から取得したユーザー情報です。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : user ? (
          <p className="text-sm">
            こんにちは、
            <span className="font-semibold">{user.name}</span> さん
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

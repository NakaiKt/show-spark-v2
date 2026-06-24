"use client";

import type { User } from "@repo/shared/types/user";
import axios from "axios";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

interface UseCurrentUserResult {
  user: User | null;
  loading: boolean;
  error: string | null;
}

/**
 * ログイン中のユーザー情報を取得するフック。
 *
 * フロントの「業務コード」側の入口。Supabase は知らず、axios クライアント経由で
 * `GET /api/users/me` を叩くだけ（Bearer 付与は client.ts の interceptor が担当）。
 *
 * @returns user / loading / error
 */
const useCurrentUser = (): UseCurrentUserResult => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // アンマウント後に setState しないためのフラグ
    let active = true;

    (async () => {
      try {
        const res = await api.get<{ data: User }>("/users/me");
        if (active) setUser(res.data.data);
      } catch (e) {
        if (!active) return;
        // API の共通エラー形式 `{ error: { code, message } }` からメッセージを取り出す
        const message = axios.isAxiosError(e)
          ? (e.response?.data?.error?.message ??
            "ユーザー情報の取得に失敗しました")
          : "ユーザー情報の取得に失敗しました";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { user, loading, error };
};

export default useCurrentUser;

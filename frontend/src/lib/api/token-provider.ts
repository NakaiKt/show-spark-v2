"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * フロント専用: アクセストークン取得（token-provider）
 *
 * AGENTS.md の方針どおり、フロントで Supabase を直接触ってよいのはここだけ。
 * 業務コンポーネントは Supabase を知らず、axios クライアント越しに API を叩く。
 * その axios が Bearer ヘッダーを付けるためのトークンを、ここでセッションから取り出す。
 *
 * @returns ログイン中なら access_token、未ログインなら null
 */
export async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

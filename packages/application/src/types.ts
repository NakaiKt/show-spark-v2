/**
 * application 層: 認証コンテキスト型
 *
 * AuthContext は「認証済みである」という証明。すべての usecase はこれを
 * 引数に受け取ることで、未認証リクエストが業務処理に到達しないことを型で保証する。
 */
import type { AppSupabaseClient } from "@repo/db/client";

export interface AuthContext {
	/** ユーザーの JWT でスコープされた Supabase クライアント（RLS が有効） */
	supabase: AppSupabaseClient;
	/** アプリ内の不変ユーザー ID（public.users.id） */
	appUserId: string;
	/** 認証プロバイダの subject（auth.users.id = JWT の sub） */
	sub: string;
}

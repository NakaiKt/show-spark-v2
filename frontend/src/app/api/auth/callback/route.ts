import { NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/sanitize-next-path";
import { createClient } from "@/lib/supabase/server";

// OAuth / OIDC の認可コードフロー（PKCE）のコールバックエンドポイント。
// IdP がリダイレクトしてきた code をセッションに交換し、ログイン前の画面へ戻す。
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code"); // 認証の引換コード
  const next = sanitizeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const supabase = await createClient();
  // 発行されたcodeからログインしたユーザーのセッションを取得
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  // 本番環境でリバースプロキシ経由の場合、origin が内部ホストになるため
  // x-forwarded-host の公開ドメインを使ってリダイレクト先を組み立てる
  if (!isLocalEnv && forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

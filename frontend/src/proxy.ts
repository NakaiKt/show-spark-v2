import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware から呼び出すエントリポイント。
 * Supabase のセッション Cookie をリフレッシュしつつ、未認証ユーザーを sign-in へリダイレクトする。
 *
 * @param request - middleware が受け取るリクエスト
 * @returns セッション Cookie が更新されたレスポンス、または sign-in へのリダイレクト
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Supabase SSR の Cookie 更新は request と response の両方に書く必要がある。
          // まず request に反映してから response を再生成することで、
          // 更新後の Cookie が確実にブラウザへ送信される。
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({
            request,
          });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /app 配下はログイン必須。ログイン後に元の URL へ戻れるよう next パラメータを付与する。
  if (!user && request.nextUrl.pathname.startsWith("/app")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("next", request.nextUrl.pathname);

    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/app/:path*"],
};

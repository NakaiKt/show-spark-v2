import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function createClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabaseの環境変数が設定されていません。");
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component から呼ばれた場合は Cookie を書けないが無視してよい。
          // セッションのリフレッシュはミドルウェア（proxy.ts）が担当する。
        }
      },
    },
  });
}

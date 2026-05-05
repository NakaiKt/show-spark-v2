import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// GET ではなく POST にすることで、悪意のあるリンクをクリックするだけでログアウトさせる
// CSRF 攻撃を防ぐ。呼び出し元はフォームまたは fetch POST を使う必要がある。
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/auth/sign-in");
}

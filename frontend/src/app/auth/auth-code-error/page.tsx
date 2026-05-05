import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6">
      <main className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-normal">
          サインインに失敗しました
        </h1>
        <p className="text-sm text-muted-foreground">
          サインイン処理を完了できませんでした。もう一度お試しください。
        </p>
        <Button asChild>
          <Link href="/auth/sign-in">サインインへ戻る</Link>
        </Button>
      </main>
    </div>
  );
}

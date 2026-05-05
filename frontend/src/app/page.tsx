import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">公開ホーム</p>
        <h1 className="text-3xl font-semibold tracking-normal">show-spark</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>公開画面</CardTitle>
            <CardDescription>サインインなしで閲覧できます。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/shared/demo">共有画面を開く</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>認証画面</CardTitle>
            <CardDescription>サインイン専用の画面です。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/auth/sign-in">サインイン</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>アプリ画面</CardTitle>
            <CardDescription>有効なセッションが必要です。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/app">アプリを開く</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

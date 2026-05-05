import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SharedDemoPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">公開共有</p>
        <h1 className="text-3xl font-semibold tracking-normal">
          共有プロジェクトのプレビュー
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>この画面は誰でも閲覧できます</CardTitle>
          <CardDescription>
            共有リンク、公開プレビュー、読み取り専用の公開コンテンツに使う想定です。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button asChild>
            <Link href="/auth/sign-in">サインイン</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">ホームへ戻る</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

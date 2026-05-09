import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/sign-in-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sanitizeNextPath } from "@/lib/auth/sanitize-next-path";
import { createClient } from "@/lib/supabase/server";

type SignInPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const next = sanitizeNextPath((await searchParams).next);

  if (user) {
    redirect(next);
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>サインイン</CardTitle>
          <CardDescription>
            Googleアカウントでshow-sparkを利用します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInButton next={next} />
        </CardContent>
      </Card>
    </main>
  );
}

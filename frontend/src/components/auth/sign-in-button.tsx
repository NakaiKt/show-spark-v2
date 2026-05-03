"use client";

import { Button } from "@/components/ui/button";
import useSignIn from "@/hooks/auth/useSignIn";

type SignInButtonProps = {
  next?: string;
};

export function SignInButton({ next = "/app" }: SignInButtonProps) {
  const { error, loading, signIn } = useSignIn({ next });

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={signIn} disabled={loading} size="lg">
        {loading ? "サインイン中..." : "Googleで続ける"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

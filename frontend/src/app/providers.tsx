"use client";

import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api/fetcher";

/**
 * クライアント側のグローバルプロバイダ。
 *
 * SWR のグローバル fetcher を登録するため、Server Component である layout.tsx から
 * このクライアントコンポーネントで children をラップする。
 * これで各データ取得フックは `useSWR<T>("/path")` だけで動く。
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ fetcher }}>{children}</SWRConfig>;
}

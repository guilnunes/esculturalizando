"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/professor");
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4">
      <p className="text-body text-text-muted">Abrindo o painel do ateliê…</p>
      <Link
        href="/professor"
        className="flex min-h-12 items-center rounded-control border border-clay px-5 text-body font-medium text-clay transition-colors hover:bg-clay-wash"
      >
        Ir para o painel
      </Link>
    </main>
  );
}

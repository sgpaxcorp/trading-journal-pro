// app/signin/page.tsx
import { Suspense } from "react";
import SignInClient from "./SignInClient";

type SearchParams = {
  [key: string]: string | string[] | undefined;
};

export default function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const rawNext = Array.isArray(searchParams.next)
    ? searchParams.next[0]
    : searchParams.next;

  // solo permitimos rutas internas que empiecen con "/"
  const nextPath =
    typeof rawNext === "string" && rawNext.startsWith("/")
      ? rawNext
      : "/dashboard";

  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
          <p className="text-xs text-slate-400">Loading sign in...</p>
        </main>
      }
    >
      <SignInClient nextPath={nextPath} />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

type PublicHomeLogoLinkProps = {
  compact?: boolean;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export default function PublicHomeLogoLink({
  compact = false,
  showLabel = true,
  size = "md",
  className = "",
}: PublicHomeLogoLinkProps) {
  const { user } = useAuth() as any;
  const href = user ? "/dashboard" : "/";
  const imgClass =
    size === "lg"
      ? "h-16 md:h-20 w-auto"
      : size === "sm"
      ? "h-7 w-auto"
      : compact
      ? "h-8 w-auto"
      : "h-10 w-auto";

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/75 px-3 py-2 hover:border-emerald-400 transition shadow-[0_0_28px_rgba(16,185,129,0.12)] ${className}`}
      aria-label="Go to home"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/neurotrader-logo.svg"
        alt="Neuro Trader Journal"
        className={imgClass}
      />
      {showLabel && !compact ? (
        <span className="text-xs text-slate-300">
          {user ? "Dashboard" : "Home"}
        </span>
      ) : null}
    </Link>
  );
}

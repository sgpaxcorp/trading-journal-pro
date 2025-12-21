"use client";

import Link from "next/link";
import {
  FaTwitter,
  FaInstagram,
  FaLinkedinIn,
  FaDiscord,
  FaFacebookF,
} from "react-icons/fa";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full bg-[#0b0c14] text-slate-300 px-7 md:px-12 py-8 border-t border-slate-800 mt-auto">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10">
        {/* Col 1: Logo + disclaimer */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-emerald-400/90 flex items-center justify-center text-slate-950 text-xs font-black">
              NTJ
            </div>
            <span className="text-sm md:text-base font-semibold tracking-tight bg-linear-to-r from-emerald-400 via-sky-400 to-indigo-400 text-transparent bg-clip-text">
              Neuro Trader Journal
            </span>
          </div>
          <p className="text-[12px] text-slate-400 leading-relaxed">
            Tools designed for every trader — in any market — who wants to
            centralize their trading journey, master self-awareness, and
            elevate performance. Centralize your journal, understand your
            patterns, and execute with precision. Because the better you know
            yourself — the stronger your edge.
          </p>
        </div>

        {/* Col 2: Links */}
        <div className="flex flex-wrap justify-between gap-6 text-[13px]">
          <div className="flex flex-col gap-2">
            <Link href="/signin" className="hover:text-emerald-400 transition">
              Log In
            </Link>
            <Link href="/blog" className="hover:text-emerald-400 transition">
              Blog
            </Link>
            <Link href="/pricing" className="hover:text-emerald-400 transition">
              Pricing
            </Link>
            
            <Link href="/partners" className="hover:text-emerald-400 transition">
              Become a Partner *Coming Soon*
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/contact" className="hover:text-emerald-400 transition">
              Contact Us
            </Link>
            <Link href="/privacy" className="hover:text-emerald-400 transition">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-emerald-400 transition">
              Terms &amp; Conditions
            </Link>
            <Link href="/terms" className="hover:text-emerald-400 transition">
              About Us
            </Link>
          </div>
        </div>

        {/* Col 3: Socials */}
        <div className="flex flex-col gap-4 md:items-end">
          <div className="flex gap-3 text-slate-400">
            <a
              href="#"
              className="p-2 rounded-md bg-slate-900 hover:bg-slate-800 transition"
            >
              <FaTwitter className="text-[16px]" />
            </a>
            <a
              href="#"
              className="p-2 rounded-md bg-slate-900 hover:bg-slate-800 transition"
            >
              <FaInstagram className="text-[16px]" />
            </a>
            <a
              href="#"
              className="p-2 rounded-md bg-slate-900 hover:bg-slate-800 transition"
            >
              <FaLinkedinIn className="text-[16px]" />
            </a>
            <a
              href="#"
              className="p-2 rounded-md bg-slate-900 hover:bg-slate-800 transition"
            >
              <FaDiscord className="text-[16px]" />
            </a>
            <a
              href="#"
              className="p-2 rounded-md bg-slate-900 hover:bg-slate-800 transition"
            >
              <FaFacebookF className="text-[16px]" />
            </a>
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-slate-800 pt-4 text-[11px] text-slate-500 text-center">
        © {year} Neuro Trader Journal. Built for traders who want structure,
        risk control, and a healthier mindset.
      </div>
    </footer>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type NavItem = {
  id: string;
  title: string;
  description?: string;
  href?: string;
  badge?: string;
};

type DropdownProps = {
  title: string;
  items: NavItem[];
};

/* ========== Reusable Dropdown component ========== */
function Dropdown({ title, items }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
          ${
            open
              ? "bg-slate-800 text-emerald-300"
              : "text-slate-200 hover:bg-slate-800 hover:text-slate-50"
          }`}
      >
        {title}
        <span
          className={`text-[11px] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-80 rounded-2xl border border-slate-800 bg-slate-950 shadow-xl shadow-slate-900/70 z-50">
          <ul className="py-2">
            {items.map((item) => {
              const Wrapper: any = item.href ? Link : "div";
              const wrapperProps = item.href ? { href: item.href } : {};

              return (
                <li key={item.id}>
                  <Wrapper
                    {...wrapperProps}
                    className="group flex w-full items-start gap-3 rounded-xl px-3 py-2.5
                               hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-100 group-hover:text-emerald-200">
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-[11px] text-slate-400 group-hover:text-slate-200">
                          {item.description}
                        </p>
                      )}
                    </div>
                    {item.badge && (
                      <span className="mt-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        {item.badge}
                      </span>
                    )}
                  </Wrapper>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ========== Menu data ========== */

const performance: NavItem[] = [
  {
    id: "balance-chart",
    title: "Balance chart",
    description: "Evolution of your account and daily comparion vs. your target.",
    href: "/performance/balance-chart",
  },
  {
    id: "analytics-statistics",
    title: "Analytics Statistics",
    description: "Analize your historical data with statistics.",
    href: "/performance/analytics-statistics",
  },
  {
    id: "ai-coaching",
    title: "AI Coaching",
    description: "Coaching ideas based on your metrics.",
    href: "/performance/ai-coaching",
    badge: "AI",
  },
];

const notebook: NavItem[] = [
  {
    id: "playbook",
    title: "Playbook",
    description: "Document your A+ setups.",
    href: "/notebook/playbook",
  },
  {
    id: "lessons",
    title: "Lessons learned",
    description: "Convert mistakes into rules.",
    href: "/notebook/lessons",
  },
  {
    id: "ideas",
    title: "Ideas & notes",
    description: "Free-form notes for your edge.",
    href: "/notebook/ideas",
  },
];

const backStudy: NavItem[] = [
  {
    id: "replays",
    title: "Chart replays",
    description: "Review past price action.",
    href: "/back-study/replays",
  },
  {
    id: "tags-study",
    title: "Tag study",
    description: "Study performance by tag.",
    href: "/back-study/tags",
  },
  {
    id: "scenarios",
    title: "Scenarios",
    description: "Practice specific market conditions.",
    href: "/back-study/scenarios",
  },
];

const challenge: NavItem[] = [
  {
    id: "30day",
    title: "30-day challenge",
    description: "Consistency challenge with rules.",
    href: "/challenge/30-day",
  },
  {
    id: "drawdown",
    title: "Drawdown recovery",
    description: "Plan to climb out safely.",
    href: "/challenge/drawdown",
  },
  {
    id: "account-goals",
    title: "Account goals",
    description: "Milestones for balance and risk.",
    href: "/challenge/account-goals",
  },
];

const resources: NavItem[] = [
  {
    id: "checklists",
    title: "Checklists",
    description: "Pre-market, during-session, post-market.",
    href: "/resources/checklists",
  },
  {
    id: "templates",
    title: "Templates",
    description: "Ready-made journal and plan templates.",
    href: "/resources/templates",
  },
  {
    id: "library",
    title: "Library",
    description: "Hand-picked books and videos.",
    href: "/resources/library",
  },
];

const rules: NavItem[] = [
  {
    id: "risk-rules",
    title: "Risk rules",
    description: "Max loss, size, and circuit breakers.",
    href: "/rules/risk",
  },
  {
    id: "behavior-rules",
    title: "Behavior rules",
    description: "What you do before, during and after trading.",
    href: "/rules/behavior",
  },
  {
    id: "alarms",
    title: "Alarms",
    description: "Notifications for breaking rules.",
    href: "/rules/alarms",
    badge: "NEW",
  },
];

const forum: NavItem[] = [
  {
    id: "community-feed",
    title: "Community feed",
    description: "Share progress with other traders.",
    href: "/forum/feed",
  },
  {
    id: "qa",
    title: "Q&A",
    description: "Ask questions and get feedback.",
    href: "/forum/qa",
  },
  {
    id: "accountability",
    title: "Accountability groups",
    description: "Small groups to stay consistent.",
    href: "/forum/accountability",
  },
];

/* ========== TopNav ========== */

export default function TopNav() {
  return (
    <nav className="w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      {/* quitamos max-w-6xl para usar todo el ancho */}
      <div className="flex items-center px-4 py-3 md:px-6 gap-8 w-full">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400 text-slate-950 text-sm font-semibold">
            TJ
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-slate-100">
              Trading Journal Pro
            </span>
            <span className="text-[11px] text-slate-500">
              Structured trading dashboard
            </span>
          </div>
        </div>

        {/* Dropdown row: una sola línea, sin scroll */}
        <div className="flex items-center gap-4 text-[14px] whitespace-nowrap flex-1">
          <Dropdown title="Performance" items={performance} />      
          <Dropdown title="Notebook" items={notebook} />
          <Dropdown title="Back-Studying" items={backStudy} />
          <Dropdown title="Challenge & Rules" items={challenge} />
          <Dropdown title="Resources" items={resources} />
          <Dropdown title="Rules & Alarms" items={rules} />
          <Dropdown title="Forum" items={forum} />
        </div>
      </div>
    </nav>
  );
}

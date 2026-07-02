"use client";

import { useEffect, useState } from "react";
import { todayISO } from "@/lib/plan";
import { applySeed, requestPersistence } from "@/lib/storage";
import TodayView from "@/components/TodayView";
import PlanView from "@/components/PlanView";
import LogView from "@/components/LogView";
import ProgressView from "@/components/ProgressView";

const TABS = [
  { id: "today", label: "Today" },
  { id: "plan", label: "Plan" },
  { id: "log", label: "Log" },
  { id: "progress", label: "Progress" }
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const [tab, setTab] = useState<TabId>("today");

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, []);
  const flipTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("light", next === "light");
    try {
      localStorage.setItem("hr_theme_v1", next);
    } catch {}
  };

  // A PWA left open overnight keeps stale "today" state in every view.
  // Re-key the views when the date changes so they remount fresh.
  const [day, setDay] = useState("");
  useEffect(() => {
    applySeed(); // fold in any runs Jon reported via chat
    requestPersistence(); // ask the browser not to evict our localStorage — no backend to fall back on
    setDay(todayISO());
    const refresh = () => setDay(todayISO());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return (
    <div className="mx-auto max-w-md min-h-screen flex flex-col">
      <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 flex items-end justify-between">
        <div>
          <div className="bg-gold h-1.5 w-16 mb-2 rounded-sm" />
          <h1 className="font-display font-bold text-3xl tracking-wide text-bone leading-none">
            ERICKSON <span className="text-gold">26.2</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-[11px] text-dust leading-tight font-medium">
            13.1 · AUG 8<br />26.2 · OCT 10
          </div>
          <button
            onClick={flipTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="w-9 h-9 rounded-lg bg-coal border border-seam text-bone text-base leading-none"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28">
        {tab === "today" && <TodayView key={day} onGoLog={() => setTab("log")} />}
        {tab === "plan" && <PlanView key={day} />}
        {tab === "log" && <LogView key={day} />}
        {tab === "progress" && <ProgressView key={day} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-coal/95 backdrop-blur border-t border-seam pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-md grid grid-cols-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3.5 text-sm font-display font-semibold tracking-widest uppercase transition-colors ${
                tab === t.id ? "text-gold" : "text-dust"
              }`}
            >
              <span className={tab === t.id ? "border-b-2 border-gold pb-1" : "pb-1"}>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

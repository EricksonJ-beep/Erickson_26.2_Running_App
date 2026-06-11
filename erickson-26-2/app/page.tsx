"use client";

import { useEffect, useState } from "react";
import { todayISO } from "@/lib/plan";
import TodayView from "@/components/TodayView";
import PlanView from "@/components/PlanView";
import LogView from "@/components/LogView";
import FuelView from "@/components/FuelView";
import ProgressView from "@/components/ProgressView";

const TABS = [
  { id: "today", label: "Today" },
  { id: "plan", label: "Plan" },
  { id: "log", label: "Log" },
  { id: "fuel", label: "Fuel" },
  { id: "progress", label: "Progress" }
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const [tab, setTab] = useState<TabId>("today");

  // A PWA left open overnight keeps stale "today" state in every view.
  // Re-key the views when the date changes so they remount fresh.
  const [day, setDay] = useState("");
  useEffect(() => {
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
          <div className="stripe h-1.5 w-16 mb-2 rounded-sm" />
          <h1 className="font-display font-bold text-3xl tracking-wide text-bone leading-none">
            ERICKSON <span className="text-gold">26.2</span>
          </h1>
        </div>
        <div className="text-right text-[11px] text-dust leading-tight font-medium">
          13.1 · AUG 8<br />26.2 · OCT 10
        </div>
      </header>

      <main className="flex-1 px-4 pb-28">
        {tab === "today" && <TodayView key={day} onGoLog={() => setTab("log")} />}
        {tab === "plan" && <PlanView key={day} />}
        {tab === "log" && <LogView key={day} />}
        {tab === "fuel" && <FuelView key={day} />}
        {tab === "progress" && <ProgressView key={day} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-coal/95 backdrop-blur border-t border-seam pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-md grid grid-cols-5">
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

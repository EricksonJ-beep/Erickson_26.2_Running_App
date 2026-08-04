"use client";

// Race-week fueling plan — fullscreen, day-tabbed reference for the
// Chippewa Falls half. Content lives in lib/raceFuel.ts; this is purely
// presentation. Nothing here is logged — it's a page to read at the
// kitchen counter Thursday, Friday and race morning.

import { useEffect, useState } from "react";
import { HALF_FUEL, RFBlock, RFRow } from "@/lib/raceFuel";
import { todayISO } from "@/lib/plan";

type TabKey = string; // a day key, or "ref"

// Open on the day Jon is actually living: today if it's one of the three,
// otherwise the next one coming (and the race itself once it's behind us).
function defaultTab(today: string): TabKey {
  const exact = HALF_FUEL.days.find((d) => d.date === today);
  if (exact) return exact.key;
  const upcoming = HALF_FUEL.days.find((d) => d.date > today);
  return (upcoming ?? HALF_FUEL.days[HALF_FUEL.days.length - 1]).key;
}

export default function RaceFuelView({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabKey | null>(null);
  const [today, setToday] = useState("");
  useEffect(() => {
    const t = todayISO();
    setToday(t);
    setTab(defaultTab(t));
  }, []);
  if (!tab) return null;

  const day = HALF_FUEL.days.find((d) => d.key === tab);

  return (
    <div className="fixed inset-0 z-50 bg-ink overflow-y-auto">
      <div className="mx-auto max-w-md min-h-full flex flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <div className="bg-gold h-1.5 w-12 mb-2 rounded-sm" />
            <h1 className="font-display font-bold text-2xl tracking-wide text-bone leading-none">
              RACE <span className="text-gold">FUEL</span>
            </h1>
            <p className="text-[11px] text-dust mt-1.5 leading-snug">
              {HALF_FUEL.race} · {HALF_FUEL.when}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close fueling plan"
            className="shrink-0 ml-3 w-10 h-10 rounded-lg bg-coal border border-seam text-bone text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Rule zero — the one thing that applies to every tab */}
        <div className="bg-coal rounded-xl border border-ember/40 px-4 py-3 mb-3">
          <div className="text-[10px] uppercase tracking-widest text-ember font-display font-bold">
            Rule zero
          </div>
          <p className="text-[11px] text-bone/90 mt-1 leading-snug">{HALF_FUEL.ruleZero}</p>
        </div>

        {/* Day tabs */}
        <div className="flex gap-1.5 mb-4">
          {[...HALF_FUEL.days.map((d) => ({ key: d.key, label: d.short, date: d.date })),
            { key: "ref", label: "Ref", date: "" }].map((t) => {
            const active = tab === t.key;
            const isToday = t.date !== "" && t.date === today;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={active ? "page" : undefined}
                className={`flex-1 min-h-[44px] rounded-lg font-display font-bold tracking-widest uppercase text-xs border ${
                  active
                    ? "bg-gold text-ink border-gold"
                    : "bg-coal text-dust border-seam"
                }`}
              >
                {t.label}
                {isToday && (
                  <span className={`block text-[9px] tracking-normal font-semibold -mt-0.5 ${active ? "text-ink/70" : "text-gold"}`}>
                    today
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {day ? (
          <div className="space-y-4">
            {/* Day header */}
            <div className="bg-coal rounded-2xl border border-seam overflow-hidden">
              <div className="bg-gold h-1.5" />
              <div className="px-4 py-3.5">
                <div className="text-[10px] uppercase tracking-widest text-gold font-display font-bold">
                  {day.tag}
                </div>
                <div className="font-display font-bold text-xl text-bone leading-tight mt-0.5">
                  {day.label}
                </div>
                <p className="text-xs text-bone/85 mt-1.5 leading-snug">{day.headline}</p>
              </div>
              <div className="border-t border-seam px-4 py-3 space-y-1.5">
                {day.targets.map((r) => (
                  <StatRow key={r.k} row={r} />
                ))}
              </div>
            </div>

            {/* Pace reconciliation — only matters on race day */}
            {day.key === "race" && (
              <div className="bg-coal rounded-xl border border-gold/40 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-gold font-display font-bold">
                  Pace check
                </div>
                <p className="text-[11px] text-bone/90 mt-1 leading-snug">{HALF_FUEL.paceNote}</p>
              </div>
            )}

            <Blocks blocks={day.blocks} />
          </div>
        ) : (
          <div className="space-y-4">
            <Blocks blocks={HALF_FUEL.reference} />
            <div className="bg-coal rounded-2xl border border-gold/40 px-4 py-4">
              <div className="text-[10px] uppercase tracking-widest text-gold font-display font-bold">
                The three that actually matter
              </div>
              <ol className="mt-2.5 space-y-2">
                {HALF_FUEL.bigThree.map((t, i) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="font-display font-bold text-gold text-sm shrink-0">{i + 1}</span>
                    <span className="text-xs text-bone/90 leading-snug">{t}</span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="text-[11px] text-dust leading-snug px-1">
              Athlete {HALF_FUEL.athlete} · forecast {HALF_FUEL.forecast}. The evergreen fueling
              playbook (per-hour targets, gut training, the full marathon) lives under
              Plan → Coach&apos;s guide.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Blocks({ blocks }: { blocks: RFBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => (
        <div key={i} className="bg-coal rounded-2xl border border-seam px-4 py-3.5 space-y-2">
          {b.heading && (
            <div className="text-[11px] uppercase tracking-wide text-gold font-display font-semibold">
              {b.heading}
            </div>
          )}
          {b.text && <p className="text-xs text-bone/85 leading-relaxed">{b.text}</p>}
          {b.rows && (
            <div className="space-y-1.5">
              {b.rows.map((r) => (
                <StatRow key={r.k} row={r} />
              ))}
            </div>
          )}
          {b.options && (
            <div className="space-y-1.5">
              {b.options.map((o) => (
                <div key={o.k} className="bg-ink rounded-lg px-3 py-2.5 flex gap-2.5">
                  <span className="font-display font-bold text-gold text-sm leading-snug shrink-0 w-4">
                    {o.k}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs text-bone leading-snug">{o.v}</div>
                    {o.note && (
                      <div className="text-[10px] text-dust leading-snug mt-0.5">{o.note}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {b.bullets && (
            <ul className="space-y-1.5">
              {b.bullets.map((t) => (
                <li key={t} className="text-xs text-bone/85 leading-snug flex gap-2">
                  <span className="text-gold shrink-0">→</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function StatRow({ row }: { row: RFRow }) {
  return (
    <div className="bg-ink rounded-lg px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-wide text-dust font-display font-semibold shrink-0">
          {row.k}
        </span>
        <span className="text-sm text-bone font-semibold leading-snug text-right">{row.v}</span>
      </div>
      {row.note && <div className="text-[10px] text-dust leading-snug mt-0.5">{row.note}</div>}
    </div>
  );
}

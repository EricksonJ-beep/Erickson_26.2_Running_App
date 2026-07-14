# Satellite Route Maps — Plan

> Status: **draft for Jon's review** (Jul 14 2026). Requested: replace/augment the
> plain SVG route trace with the route drawn over real satellite imagery.

## Recommendation in one line

Leaflet (lazy-loaded) + **Esri World Imagery** satellite tiles — free, no API
key, no backend — drawn under the existing VOLT-gold route line, with the
current offline SVG trace kept as an automatic fallback and toggle.

## Tile source options

| Source | Satellite? | Key? | Cost | Notes |
|---|---|---|---|---|
| **Esri World Imagery** (recommended) | ✔ | none | $0 | Industry-standard free imagery layer; requires a small attribution line. Rural WI coverage is good. |
| MapTiler | ✔ | API key | $0 tier (100k tiles/mo) | Backup if Esri ever restricts; key lives in client (fine for a personal app, domain-locked). |
| OpenStreetMap | ✖ (street map) | none | $0 | Not satellite — could be offered as a third layer later. |
| Google Maps | ✔ | key + billing | not $0 | Ruled out. |

## Build shape (v1 — one session)

- **`SatelliteMap.tsx`**: Leaflet map, Esri imagery layer, route as a gold
  polyline (VOLT), sage start / ember finish dots, auto-fit bounds, pinch-zoom
  + pan. Leaflet is **lazy-loaded** (`import()` on first open) so the main
  bundle doesn't grow; ~42 KB gzip when used.
- **Where it appears**: Run Mode summary route card + Log history map
  expansion — same two places as today.
- **Offline behavior**: tiles need network. Online → satellite by default with
  a "Trace" toggle back to the current SVG; offline (or tile load failure) →
  automatic SVG fallback, no error states to babysit. The offline SVG is not
  going away — it's the guarantee that route review works in a dead zone.
- **No APK**: pure web change; ships over the air to the native app.

## Explicitly deferred (phase 2 candidates — decide later)

- **Live in-run satellite map**: doable, but it's a battery + data spend
  mid-run and competes with the big-numbers screen; needs its own design pass.
- **SW tile caching** for offline satellite replays of favorite routes.
- Street-map layer option alongside satellite.

## Open questions for Jon

1. Esri free imagery (recommended, $0/no key) OK? Alt: MapTiler with a key.
2. v1 scope = summary + history only — or do you want the live in-run map
   badly enough to design for it now?
3. Default view when online: satellite (recommended) or keep trace-first?

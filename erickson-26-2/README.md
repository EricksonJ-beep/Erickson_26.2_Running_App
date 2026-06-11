# Erickson 26.2

Personal training app for the road to Chippewa Falls (13.1 — Aug 8, 2026, goal 2:00)
and Ashland (26.2 — Oct 10, 2026).

Built on: 80/20 intensity distribution, weekly lactate-threshold work, the 10% mileage
rule, HR zones from estimated max 181 bpm (Tanaka, age 39), and research-backed taper
windows (10 days for the half, 14 for the full).

## Deploy to Vercel (one time, ~5 minutes)

1. Create a new GitHub repo (e.g. `erickson-26-2`) at github.com/new — private is fine.
2. From this folder:
   ```
   git init
   git add .
   git commit -m "Erickson 26.2 v1"
   git branch -M main
   git remote add origin https://github.com/Erickson1-beep/erickson-26-2.git
   git push -u origin main
   ```
3. Go to vercel.com → Add New → Project → import `erickson-26-2`.
   No settings to change — Vercel auto-detects Next.js. Click Deploy.
4. You'll get a URL like `erickson-26-2.vercel.app`.

## Add to your phone home screen

- iPhone: open the URL in Safari → Share → Add to Home Screen.
- Android: open in Chrome → menu (⋮) → Add to Home screen.

It opens fullscreen like a native app, black status bar, gold stripes.

## Where your data lives

Everything you log is stored in localStorage **on your phone** — no accounts, no
database. Two implications:
- Always log from the same device/browser (your phone's home-screen app).
- Hit **Progress → Export data** every week or two; it downloads a JSON backup
  you can re-import if you ever clear the browser or switch phones.

## Local development

```
npm install
npm run dev
```

## Editing the plan

The entire 18-week schedule lives in `lib/plan.ts` — every workout is a plain
object with a date, title, detail, and mileage. Adjust anything there and push;
Vercel redeploys automatically.

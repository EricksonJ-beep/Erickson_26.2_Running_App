// ─────────────────────────────────────────────────────────────
// DAILY FIRE — one quote per day on the Today screen.
// Cam Hanes (Endure, via Goodreads) + David Goggins (Can't Hurt Me).
// Deterministic by date: same quote all day, fresh one tomorrow.
// ─────────────────────────────────────────────────────────────

export interface Quote {
  text: string;
  who: string;
}

export const QUOTES: Quote[] = [
  // Cameron Hanes — Endure
  { text: "You worry about today. Win the day. Do something positive. Worry about tomorrow tomorrow. To me, that is what enduring means.", who: "Cam Hanes" },
  { text: "Train for misery and embrace the pain. I want to find my limits.", who: "Cam Hanes" },
  { text: "It's all mental. If you believe you can do it, you can. Our bodies are capable of so much more than what we ask of them.", who: "Cam Hanes" },
  { text: "Life without passion is simply existence.", who: "Cam Hanes" },
  { text: "No great achievement ever comes easily, so you have to love the hard work you're going to have to put in along the way.", who: "Cam Hanes" },
  { text: "You can't expect results overnight like everyone does in this day and age of instant gratification.", who: "Cam Hanes" },
  { text: "Find something that will help you improve yourself and do it every day for a year. That's how you build a work ethic.", who: "Cam Hanes" },
  { text: "No matter how bad things are going, smiling always helps.", who: "Cam Hanes" },
  { text: "I don't talk about tomorrow; I live out today. I don't know the end result, but I promise you one thing. I know how to endure the race.", who: "Cam Hanes" },
  { text: "Surround yourself with those who push you to be a better human.", who: "Cam Hanes" },
  { text: "The rare people who become truly exceptional at something do so because they're obsessed with improvement.", who: "Cam Hanes" },
  { text: "It is better to die on your feet than to live on your knees.", who: "Cam Hanes" },
  { text: "Nobody cares. Work harder.", who: "Cam Hanes" },
  { text: "You want people to care? Then do something special.", who: "Cam Hanes" },
  { text: "Every day is another chance to hammer.", who: "Cam Hanes" },

  // David Goggins — Can't Hurt Me
  { text: "Don't stop when you're tired. Stop when you're done.", who: "David Goggins" },
  { text: "Motivation is crap. Motivation comes and goes. When you're driven, whatever is in front of you will get destroyed.", who: "David Goggins" },
  { text: "You are in danger of living a life so comfortable and soft that you will die without ever realizing your true potential.", who: "David Goggins" },
  { text: "Be more than motivated, be more than driven, become literally obsessed.", who: "David Goggins" },
  { text: "The most important conversations you'll ever have are the ones you'll have with yourself.", who: "David Goggins" },
  { text: "Suffering is a test. That's all it is.", who: "David Goggins" }
];

// Stable hash of the date string → same quote all day, different tomorrow.
export function quoteForDate(iso: string): Quote {
  let h = 0;
  for (let i = 0; i < iso.length; i++) h = (h * 31 + iso.charCodeAt(i)) >>> 0;
  return QUOTES[h % QUOTES.length];
}

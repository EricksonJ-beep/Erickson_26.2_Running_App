// ─────────────────────────────────────────────────────────────
// RACE-WEEK FUELING PLAN — Chippewa Falls Half, Sat Aug 8 2026.
//
// Date-specific, meal-by-meal execution plan for the three days that
// matter (Thu build → Fri top-off/low-residue → Sat race day). This is
// deliberately separate from FUELING_GUIDE in guide.ts: that one is the
// evergreen "how fueling works" playbook, this one is "eat this, at this
// time, this week" and goes stale the moment the race is run.
//
// Surfaced on Today during race week and from Plan → Fueling & hydration.
// ─────────────────────────────────────────────────────────────

export interface RFRow { k: string; v: string; note?: string }
export interface RFBlock {
  heading?: string;
  text?: string;
  rows?: RFRow[];      // stat / timeline line — key left, value right
  options?: RFRow[];   // interchangeable choices — lettered badge + text
  bullets?: string[];
}

export interface RFDay {
  key: string;
  date: string;   // ISO — drives which tab opens by default
  short: string;  // tab label
  label: string;
  tag: string;
  headline: string;
  targets: RFRow[];
  blocks: RFBlock[];
}

export const HALF_FUEL_RACE_DATE = "2026-08-08";

export const HALF_FUEL = {
  race: "Chippewa Falls Half Marathon",
  when: "Sat Aug 8 · gun at 8:00 AM",
  athlete: "~200 lb (91 kg)",
  forecast: "~60–64°F at the gun · humid · ~45% chance of rain",

  ruleZero:
    "Nothing new Thursday through Saturday. If a food below isn't something you've already run on, swap it for one you have. There are options at every slot for exactly that reason.",

  // The source plan was written around a ~90 min (6:50/mi) finish. The app's
  // target is sub-2:00 at 9:00/mi, and the two only diverge on in-race intake.
  paceNote:
    "This plan was written for a ~90 minute finish. Your plan target is sub-2:00 at 9:00/mi — call it ~2 hours on the course. Everything Thursday and Friday is unchanged (the tank is the same size either way), but on the course you're out there ~30 min longer: carry a third gel and plan on ~60–80 g total instead of 30–50, taking one roughly every 35–40 minutes.",

  days: [
    // ── THURSDAY ──────────────────────────────────────────────
    {
      key: "thu",
      date: "2026-08-06",
      short: "Thu",
      label: "Thursday, Aug 6",
      tag: "Build",
      headline: "Carb-forward, but still a normal day of eating.",
      targets: [
        { k: "Carbs", v: "~440 g", note: "≈130 g above your usual — fat trimmed to make room" },
        { k: "Protein", v: "~150 g" },
        { k: "Fat", v: "~65 g" },
        { k: "Calories", v: "~2,950" },
        { k: "Fluid", v: "110–120 oz" },
        { k: "Sodium", v: "Normal to generous" },
        { k: "Fiber", v: "Normal is fine", note: "last day for it" }
      ],
      blocks: [
        {
          text: "A modest bump over your usual — carbs up about 130 g, fat down slightly to make room. Eat normally, just carb-forward."
        },
        {
          heading: "Breakfast · ~110 g C",
          options: [
            { k: "A", v: "1.5 cups oatmeal + 1 tbsp honey + banana + 3 eggs + 12 oz OJ" },
            { k: "B", v: "2 whole wheat English muffins + jam + 4-egg scramble + 1 cup Greek yogurt" },
            { k: "C", v: "3 pancakes + ¼ cup syrup + 2 eggs + 8 oz milk" }
          ]
        },
        {
          heading: "Lunch · ~120 g C",
          options: [
            { k: "A", v: "Turkey sandwich on a large roll + 1 cup rice + pretzels + apple" },
            { k: "B", v: "Chicken burrito bowl — double rice, light beans, skip the sour cream" },
            { k: "C", v: "Pasta salad (2 cups pasta) with grilled chicken + roll" }
          ]
        },
        {
          heading: "Afternoon snack · ~60 g C",
          bullets: [
            "Bagel with jam",
            "Large banana + 20 oz sports drink",
            "Granola bar + apple + a handful of pretzels"
          ]
        },
        {
          heading: "Dinner · ~120 g C",
          options: [
            { k: "A", v: "2.5 cups pasta, marinara, 6 oz chicken, 2 slices garlic bread" },
            { k: "B", v: "8 oz chicken or lean steak, 2 large baked potatoes, cooked green beans" },
            { k: "C", v: "Chicken teriyaki with 2.5 cups white rice, cooked veggies" }
          ]
        },
        {
          heading: "Evening · ~30 g C",
          text: "Cereal with milk, or toast with honey, or a bowl of applesauce."
        }
      ]
    },

    // ── FRIDAY ────────────────────────────────────────────────
    {
      key: "fri",
      date: "2026-08-07",
      short: "Fri",
      label: "Friday, Aug 7",
      tag: "Top off · go low-residue",
      headline: "Carbs in, fiber and fat out. The highest-leverage day of the week.",
      targets: [
        { k: "Carbs", v: "~550 g" },
        { k: "Protein", v: "~130 g" },
        { k: "Fat", v: "~50 g" },
        { k: "Calories", v: "~3,050" },
        { k: "Fluid", v: "120 oz", note: "sipped steadily — not chugged" },
        { k: "Sodium", v: "4,000–5,000 mg", note: "salt food deliberately; add broth or an electrolyte drink" },
        { k: "Fiber", v: "Under 20 g", note: "the single most important line on this page" }
      ],
      blocks: [
        {
          text: "Today's job is to get carbs in without dragging fiber and fat along with them. White bread beats whole wheat today. White rice beats brown. Cooked beats raw. This is the one day of the year that's true."
        },
        {
          heading: "Off the menu today",
          text: "Beans, lentils, broccoli, cabbage, brussels sprouts, big raw salads, nuts, high-fiber cereal, popcorn, anything fried, anything creamy, alcohol."
        },
        {
          heading: "Breakfast · 7:00 AM · ~130 g C",
          options: [
            { k: "A", v: "Large bagel + 3 tbsp jam + banana + 12 oz juice + 2 eggs" },
            { k: "B", v: "2 cups cream of wheat + brown sugar + banana + toast with honey" },
            { k: "C", v: "4 pancakes + syrup + 2 eggs + 8 oz sports drink" }
          ]
        },
        {
          heading: "Mid-morning · ~60 g C",
          bullets: [
            "20 oz sports drink + a plain bagel",
            "2 packets instant oatmeal + honey",
            "Pretzels + applesauce pouch + juice"
          ]
        },
        {
          heading: "Lunch · 12:00 PM · ~160 g C",
          text: "Make this the big meal of the day.",
          options: [
            { k: "A", v: "3 cups pasta, light marinara, 5 oz chicken, 2 slices white bread, 16 oz sports drink" },
            { k: "B", v: "Chicken and white rice bowl — 3 cups rice, teriyaki, cooked carrots" },
            { k: "C", v: "2 turkey sandwiches on white + pretzels + banana + 16 oz sports drink" }
          ]
        },
        {
          heading: "Afternoon · ~80 g C",
          text: "Split it into two sittings.",
          bullets: [
            "Bagel + honey",
            "Banana + 20 oz sports drink",
            "White rice cakes with jam",
            "Fig bars"
          ]
        },
        {
          heading: "Dinner · eat by 6:00–6:30 PM · ~90 g C",
          text: "Deliberately smaller than lunch. You want to go to bed comfortable, not stuffed.",
          options: [
            { k: "A", v: "2 cups white rice, 5 oz grilled chicken, cooked zucchini, cup of broth" },
            { k: "B", v: "2 cups plain pasta, light sauce, 4 oz chicken, dinner roll" },
            { k: "C", v: "Baked potato (no skin, skip the heavy toppings), 5 oz chicken, white bread" }
          ]
        },
        {
          heading: "Evening · before 9:00 PM · ~30 g C",
          text: "White toast with honey, or a small bowl of low-fiber cereal with milk, or applesauce. Then stop."
        },
        {
          heading: "Friday night",
          bullets: [
            "Lay it all out: bib, shoes, watch charged, Polar H10 charged, gels, salt, drink mix.",
            "Set two alarms for 4:45 AM.",
            "Expect the scale to read 2–4 lb heavier Saturday. Every gram of stored glycogen binds ~3 g of water. That weight is fuel, not fat — don't let it rattle you."
          ]
        }
      ]
    },

    // ── RACE DAY ──────────────────────────────────────────────
    {
      key: "race",
      date: "2026-08-08",
      short: "Race",
      label: "Saturday, Aug 8",
      tag: "Race day",
      headline: "The tank is already full. This morning just tops off the reserve.",
      targets: [
        { k: "Gun", v: "8:00 AM" },
        { k: "Breakfast", v: "5:00 AM · ~130 g C", note: "3 hours of clearance is the whole point" },
        { k: "Last intake", v: "7:50 AM · 1 gel", note: "~25 g + 3–4 sips of water" },
        { k: "On course", v: "30–50 g", note: "see the pace note — ~60–80 g at a 2:00 finish" },
        { k: "Forecast", v: "60–64°F, humid" }
      ],
      blocks: [
        {
          heading: "Morning timeline",
          rows: [
            { k: "4:45 AM", v: "Up. 12–16 oz water with electrolytes right away." },
            { k: "5:00 AM", v: "Breakfast — 3 hours out, ~130 g carbs." },
            { k: "5:00–6:30", v: "Sip 16–20 oz total. Let the bathroom happen at home." },
            { k: "6:30 AM", v: "Leave for the start. Bring a bottle and your gels." },
            { k: "7:00 AM", v: "Arrive, packet, bathroom. Large volumes stop here — small sips only." },
            { k: "7:15 AM", v: "Coffee or caffeine only if you've practiced it. ~150–200 mg." },
            { k: "7:25 AM", v: "Warmup: 10 min easy jog, drills, 3–4 strides." },
            { k: "7:50 AM", v: "1 gel (~25 g) + 3–4 sips of water. Last intake before the gun." },
            { k: "8:00 AM", v: "Go." }
          ]
        },
        {
          heading: "Breakfast · 5:00 AM · ~130 g C",
          text: "Low fat, low fiber. Finish by 5:15.",
          options: [
            { k: "A", v: "Large bagel + 2 tbsp jam + 1 tbsp honey + banana + 8 oz sports drink", note: "~139 g carbs" },
            { k: "B", v: "2 cups white rice + 1 tbsp honey + banana", note: "~134 g carbs · gentlest on the gut" },
            { k: "C", v: "2 packets cream of wheat + brown sugar + banana + 2 slices white toast with jam", note: "~135 g carbs" },
            { k: "D", v: "20 oz sports drink + 2 packets instant oatmeal + banana + applesauce pouch", note: "~131 g carbs · for a low appetite" }
          ]
        },
        {
          text: "Keep protein around 10–20 g and fat under 10 g. No eggs, no butter, no peanut butter, no bacon — fat and protein slow gastric emptying, and at race effort you don't want anything still sitting in your stomach."
        },
        {
          heading: "If 130 g feels like too much",
          text: "Nervous stomach, no appetite: drop to ~90 g and add a second gel at 7:50. That's a legitimate choice, not a compromise — go with what your training runs told you."
        },
        {
          heading: "During the race",
          bullets: [
            "~35–40 min in: 1 gel with a few ounces of water at the aid station.",
            "~70 min in: second gel — at a 2:00 finish, take this one, don't treat it as optional.",
            "~105 min in: third gel if you're still out there and the pace is biting.",
            "Fluid: 4–6 oz at each aid station — roughly 12–20 oz across the race in this weather. Don't force more; overdrinking is the bigger risk in a race this short.",
            "Rain doesn't change fueling. It does mean a throwaway layer at the start and lube on anything that chafes."
          ]
        }
      ]
    }
  ] as RFDay[],

  // ── Reference tab ───────────────────────────────────────────
  reference: [
    {
      heading: "Why the days are shaped this way",
      text: "Two tanks matter, and they behave differently. Muscle glycogen is the main tank — roughly 400–500 g topped off — and it does not drain overnight, because muscle can't release glucose back into the blood. Whatever you bank Thursday and Friday is still there at the starting line. Liver glycogen is the small reserve, ~100 g, and it does drain overnight keeping your blood sugar steady while you sleep; you wake with maybe half of it. Race breakfast exists almost entirely to refill that one tank."
    },
    {
      text: "So: Thursday and Friday build the tank, Saturday morning tops off the reserve. A half at your effort burns somewhere around 250–350 g of carbohydrate — comfortably inside a full tank. You're not trying to stuff yourself. You're trying to arrive full and light, not full and heavy."
    },
    {
      heading: "Quick carb reference",
      rows: [
        { k: "Large bagel", v: "55 g" },
        { k: "1 cup cooked white rice", v: "45 g" },
        { k: "1 cup cooked pasta", v: "43 g" },
        { k: "3 pancakes", v: "45 g" },
        { k: "¼ cup maple syrup", v: "53 g" },
        { k: "Large baked potato", v: "60 g" },
        { k: "Medium banana", v: "27 g" },
        { k: "2 tbsp jam", v: "26 g" },
        { k: "1 tbsp honey", v: "17 g" },
        { k: "20 oz sports drink", v: "36 g" },
        { k: "1 gel", v: "22–25 g" },
        { k: "1 oz pretzels", v: "23 g" },
        { k: "2 slices white bread", v: "26 g" },
        { k: "1 packet instant oatmeal", v: "23 g" },
        { k: "Applesauce pouch", v: "22 g" }
      ]
    }
  ] as RFBlock[],

  bigThree: [
    "Fiber under 20 g on Friday. More than any carb number in here.",
    "Finish breakfast by 5:15 AM. Three hours of clearance is the whole point.",
    "Nothing new. Every food here has a substitute — use the one you've trained on."
  ]
};

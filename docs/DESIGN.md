# Hammi design

Hammi is a pet hamster inspired by the physical Tamagotchi, built as an installable web app (PWA). One Hammi is shared by the household: everyone who logs in looks after the same pet, on any device.

The game is gentle. Neglect only makes Hammi sad; it never dies, gets sick or runs away, and a sad Hammi cheers up as soon as someone cares for it again. Every adult form is a good outcome.

## Architecture

```
web/     Vite + React + TypeScript PWA (static build)
server/  Rust (axum + SQLite) — owns the game, serves the API and web/dist
```

The server is authoritative. It ticks the simulation once a minute whether or not anyone has the app open, persists to SQLite, and sends Web Push notifications. The client renders state, sends actions, and runs the mini-game locally (it reports only the result).

Deployed as one Railway service from the root `Dockerfile`, with a volume mounted at `/data` for the database.

## Pet state

| Field | Range | Notes |
|---|---|---|
| `fullness` | 0–100 | Drops while awake ~6/h (empty after ~16h), asleep ~2/h |
| `fun` | 0–100 | Drops while awake ~8/h, frozen while asleep |
| `energy` | 0–100 | Drops while awake ~5.5/h; asleep +15/h (+19/h with lights off) |
| `poops` | 0–4 | Each meal schedules a poop 60–120 minutes later |
| `asleep` | bool | |
| `lightsOff` | bool | Turning lights off while Hammi sleeps is a cosy bonus, never required |

**Mood** is derived: `score = avg(fullness, fun, energy) - 8 * poops`. `happy` ≥ 60, `okay` ≥ 30, otherwise `sad`. Sad is the floor.

**Sleep.** Hammi falls asleep at 21:30 local time (`HAMMI_TZ`, default `Europe/Copenhagen`) and wakes at 07:30. During the day it takes a nap if energy drops below 10 and wakes when energy reaches 100. Lights switch back on automatically when Hammi wakes.

## Life stages

| Stage | When | |
|---|---|---|
| `egg` | first 5 minutes after creation | wobbles, then hatches |
| `baby` | 0–24h after hatching | |
| `kid` | 24h–96h | |
| `adult` | 96h+ | form chosen once at the transition, permanent |

Adult `form` is picked from what kind of care Hammi got (counters accumulated from hatching until adulthood), never from how much:

| Form | Most care was | Look |
|---|---|---|
| `chonky` | meals + snacks | round, cheeks full of seeds |
| `zoomy` | plays | sporty, headband, always running |
| `fluffy` | cleans | extra fluffy fur, little bow |
| `snuggly` | pets | sleepy eyes, blush, holds a heart (also the tie-break) |

## Actions

All actions are `POST /api/action` with `{ "type": ..., ... }`. Each returns the new state plus a `reaction` the client animates.

| `type` | Effect | Reactions | Allowed while asleep |
|---|---|---|---|
| `meal` | fullness +35, schedules a poop | `yum`, or `full` (refused when fullness ≥ 95) | no → `asleep` |
| `snack` | fullness +8, fun +12 | `yum` | no → `asleep` |
| `play` | body `{ "won": 0..5 }`. fun +10 + 6·won, energy −8 | `happy` | no → `asleep` |
| `clean` | poops = 0 | `clean`, or `nothing` if already clean | yes |
| `pet` | fun +5 (care counter at most once per 10 min) | `love` | yes → `love` (Hammi smiles in its sleep) |
| `lights` | toggles lightsOff | `lights_off` / `lights_on` | yes |

Actions on an `egg` return reaction `egg` and change nothing, except `pet` (`love`).

`play` also takes `"game": "leftright" | "catch" | "jump"` (default `leftright`), used only for the diary line ("Emil played Seed Catch with Hammi and won 4/5").

## Mini-games

All run on the client and report a score of 0–5 as `won`. Choosing Play opens a picker on the LCD.

| `game` | Name | How it plays | Score |
|---|---|---|---|
| `leftright` | Left or Right | Guess which way Hammi will turn, 5 rounds | rounds guessed |
| `catch` | Seed Catch | Seeds fall for 20 s; move Hammi left/right (A/B or tap screen halves) to catch them | caught seeds / 3, max 5 |
| `jump` | Wheel Run | Hammi runs on a wheel, pebbles scroll in; tap (B or screen) to jump. Ends at the first hit or after 20 pebbles | pebbles cleared / 4, max 5 |

## Surprises

**Wishes.** While Hammi is awake between 09:00 and 20:00 local and has no wish, each minute there is a 1-in-240 chance (about one wish every four hours) that it starts wishing for one of: `meal` (only if fullness < 80), `snack`, `play` (only if energy > 20), `clean` (only if poops > 0), `pet`. A wish lasts 2 hours, then fades with no penalty. Doing the wished-for action (with a non-refused reaction) grants it: extra fun +15, reaction `delighted` instead of the normal one, and a diary line "Emil granted Hammi's wish for a snack".

**Daily gift.** Once per local day per player name, Hammi has found something. `POST /api/gift` claims it: the server picks one of 16 treasures (`acorn`, `sunflower`, `pebble`, `clover`, `feather`, `button`, `shell`, `ribbon`, `star`, `key`, `berry`, `leaf`, `marble`, `bell`, `heartstone`, `crown`). `crown` is rare (2%); otherwise items not yet in the treasure box are favoured (70% when any remain). The treasure box is shared by the household.

**Birthdays.** Every 7 days after hatching Hammi has a birthday: a diary line, a milestone push ("Hammi is 2 weeks old today! 🎂") and `celebration` is set for that local day.

**Special days.** `HAMMI_CELEBRATE` lists dates as `MM-DD|message` separated by `;` (e.g. `05-21|Happy birthday, love! 💐;08-14|Happy anniversary! 💕`). On that local date `celebration` carries the message, the diary gets it, and a milestone push goes out in the morning.

**Seasonal hats** are client-only, from the device's local date: pumpkin Oct 24–31, Santa hat Dec 1–26, party hat Dec 31–Jan 1, heart Feb 14. A celebration (cake + party hat) takes precedence.

## Notifications

The server checks once a minute and sends at most one push per 90 minutes. Each kind has a 4-hour cooldown. No pushes between 22:00 and 08:00 local time, or while Hammi is asleep. All copy is gentle, never guilt-tripping.

| Kind | Trigger | Copy |
|---|---|---|
| hungry | fullness < 25 | "Hammi's tummy is rumbling 🌻" |
| bored | fun < 25 | "Hammi wants to play with you!" |
| tidy | poops ≥ 3 | "Hammi's cage could use a little tidy 🧹" |
| hatched | egg hatches | "Hammi hatched! 🐣" |
| grew | stage change | "Hammi grew up a little! 🎉" |
| wish | a wish starts | "Hammi is daydreaming about a sunflower seed 💭" (copy per wish) |
| birthday / special day | see Surprises | |

Milestone pushes (hatched, grew, birthday, special day) are queued through quiet hours and ignore the 90-minute limit.

## API

All `/api/*` routes except `login`, `health` and `push/key` require `Authorization: Bearer <token>`. JSON field names are camelCase.

```
POST   /api/login           { passcode, name } → { token, name }      401 on wrong passcode
GET    /api/state           → PetView
POST   /api/action          { type, won?, game? } → { state: PetView, reaction }
POST   /api/gift            → { item, isNew, state: PetView }          409 if already claimed today
GET    /api/treasures       → { items: { item, count, firstFoundBy, firstFoundAt }[] }  found items only
POST   /api/rename          { name } → PetView                         1–16 chars
GET    /api/push/key        → { publicKey }                            VAPID public key, base64url
POST   /api/push/subscribe  PushSubscription JSON (endpoint, keys.p256dh, keys.auth) → 204
POST   /api/push/unsubscribe { endpoint } → 204
GET    /api/health          → "ok"
```

```ts
type PetView = {
  name: string;
  stage: "egg" | "baby" | "kid" | "adult";
  form: "chonky" | "zoomy" | "fluffy" | "snuggly" | null;
  hatchesAt: string | null;   // ISO 8601, only while egg
  ageDays: number;            // days since hatching, fractional
  fullness: number;           // 0–100 integers
  fun: number;
  energy: number;
  poops: number;              // 0–4
  asleep: boolean;
  lightsOff: boolean;
  mood: "happy" | "okay" | "sad";
  serverTime: string;         // ISO 8601
  events: { at: string; who: string; text: string }[]; // newest first, max 30
  wish: "meal" | "snack" | "play" | "clean" | "pet" | null;
  celebration: { kind: "birthday" | "special"; text: string } | null;
  giftAvailable: boolean;     // for the requesting player
};
```

Auth is a single shared household passcode (`HAMMI_PASSCODE`). Logging in with a name gives a long-lived token; the name appears in the event log ("Emil fed Hammi a meal").

## Configuration

| Env var | Default | |
|---|---|---|
| `PORT` | `8080` | |
| `DATABASE_PATH` | `hammi.db` | `/data/hammi.db` on Railway |
| `HAMMI_PASSCODE` | — | required |
| `HAMMI_TZ` | `Europe/Copenhagen` | sleep schedule and quiet hours |
| `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` | — | generate with `hammi-server gen-vapid`; push is disabled when unset |
| `VAPID_SUBJECT` | `mailto:hammi@example.com` | |
| `STATIC_DIR` | `../web/dist` | `/app/web` in the container |
| `HAMMI_CELEBRATE` | — | special days, see Surprises |
| `HAMMI_SPEED` | `1` | time multiplier for local testing (e.g. `60` = one hour per minute) |

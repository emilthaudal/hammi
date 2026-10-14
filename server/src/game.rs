//! The pet simulation. Pure logic: no I/O, all time passed in explicitly.
//! Rules are documented in docs/DESIGN.md.

use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveTime, Timelike, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

const HATCH_AFTER: Duration = Duration::minutes(5);
const KID_AT_HOURS: i64 = 24;
const ADULT_AT_HOURS: i64 = 96;
const MAX_POOPS: u8 = 4;
const PET_CARE_COOLDOWN: Duration = Duration::minutes(10);
/// Fun from each cuddle within one cuddle window; later cuddles give none.
const CUDDLE_FUN: [f64; 3] = [5.0, 3.0, 1.0];
const SNACK_WINDOW: Duration = Duration::hours(1);
const SNACKS_PER_WINDOW: usize = 3;
const SNACK_CARE_COOLDOWN: Duration = Duration::minutes(30);
const FAVOURITE_BONUS_FUN: f64 = 8.0;
const WISH_CHANCE_PER_MINUTE: f64 = 1.0 / 240.0;
const WISH_LASTS: Duration = Duration::hours(2);
const WISH_BONUS_FUN: f64 = 15.0;
/// How long a woken-up Hammi stays awake with nobody doing anything, by lights on / off.
const DOZE_OFF_LIGHTS_ON: Duration = Duration::minutes(10);
const DOZE_OFF_LIGHTS_OFF: Duration = Duration::minutes(5);

/// A configured date to celebrate every year, e.g. a birthday.
#[derive(Debug, Clone)]
pub struct SpecialDay {
    pub month: u32,
    pub day: u32,
    pub text: String,
}

impl SpecialDay {
    /// Parse `MM-DD|message;MM-DD|message`. Malformed entries are skipped.
    pub fn parse_list(raw: &str) -> Vec<SpecialDay> {
        raw.split(';')
            .filter_map(|entry| {
                let (date, text) = entry.split_once('|')?;
                let (m, d) = date.trim().split_once('-')?;
                let (month, day) = (m.parse().ok()?, d.parse().ok()?);
                NaiveDate::from_ymd_opt(2024, month, day)?;
                Some(SpecialDay { month, day, text: text.trim().to_string() })
            })
            .collect()
    }

    pub fn on(days: &[SpecialDay], date: NaiveDate) -> Option<&SpecialDay> {
        days.iter().find(|d| d.month == date.month() && d.day == date.day())
    }
}

/// Everything a tick needs from the outside world.
pub struct Ctx<'a> {
    pub tz: Tz,
    pub special_days: &'a [SpecialDay],
    /// Uniform random number in [0, 1).
    pub roll: &'a mut dyn FnMut() -> f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Wish {
    pub kind: ActionKind,
    pub until: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Game {
    #[default]
    Leftright,
    Catch,
    Jump,
}

impl Game {
    fn title(self) -> &'static str {
        match self {
            Game::Leftright => "Left or Right",
            Game::Catch => "Seed Catch",
            Game::Jump => "Wheel Run",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Egg,
    Baby,
    Kid,
    Adult,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Form {
    Chonky,
    Zoomy,
    Fluffy,
    Snuggly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Mood {
    Happy,
    Okay,
    Sad,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Care {
    pub meals: u32,
    pub snacks: u32,
    pub plays: u32,
    pub cleans: u32,
    pub pets: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pet {
    pub name: String,
    pub created_at: DateTime<Utc>,
    /// When someone first logged in and found the egg. The egg only starts hatching then.
    #[serde(default)]
    pub egg_found_at: Option<DateTime<Utc>>,
    pub hatched_at: Option<DateTime<Utc>>,
    pub stage: Stage,
    pub form: Option<Form>,
    pub fullness: f64,
    pub fun: f64,
    pub energy: f64,
    pub poops: u8,
    pub poops_due: Vec<DateTime<Utc>>,
    pub asleep: bool,
    pub napping: bool,
    pub lights_off: bool,
    pub care: Care,
    pub last_counted_pet: Option<DateTime<Utc>>,
    pub last_tick: DateTime<Utc>,
    #[serde(default)]
    pub wish: Option<Wish>,
    /// How many weekly birthdays have been celebrated.
    #[serde(default)]
    pub birthdays: u32,
    /// Local date of the last tick, to notice when a new day starts.
    #[serde(default)]
    pub last_local_date: Option<NaiveDate>,
    /// Snacks eaten in the last hour.
    #[serde(default)]
    pub recent_snacks: Vec<DateTime<Utc>>,
    #[serde(default)]
    pub last_counted_snack: Option<DateTime<Utc>>,
    /// Start of the current cuddle window and how many cuddles it has had.
    #[serde(default)]
    pub cuddle_window: Option<(DateTime<Utc>, u32)>,
    /// Secret until someone feeds it and `favourite_known` flips.
    #[serde(default)]
    pub favourite_food: Option<Food>,
    #[serde(default)]
    pub favourite_known: bool,
    /// Set while Hammi is up past its sleep because someone woke it: when anyone last did something.
    /// Hammi dozes off again after a quiet spell.
    #[serde(default)]
    pub groggy_since: Option<DateTime<Utc>>,
}

/// Something that happened during a tick, for the event log and notifications.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Happening {
    Hatched,
    Grew(Stage),
    FellAsleep,
    WokeUp,
    Pooped,
    Wished(ActionKind),
    Birthday(u32),
    SpecialDay(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionKind {
    Meal,
    Snack,
    Play,
    Clean,
    Pet,
    Lights,
}

#[derive(Debug, Clone, Copy)]
pub struct Action {
    pub kind: ActionKind,
    /// Mini-game score 0–5, only for `Play`.
    pub won: u8,
    pub game: Game,
    /// Only for `Meal` and `Snack`; defaults to seed mix / sunflower seed.
    pub food: Option<Food>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Food {
    Seeds,
    Carrot,
    Corn,
    Sunflower,
    Strawberry,
    Peanut,
}

impl Food {
    pub const ALL: [Food; 6] = [Food::Seeds, Food::Carrot, Food::Corn, Food::Sunflower, Food::Strawberry, Food::Peanut];

    pub fn is_meal(self) -> bool {
        matches!(self, Food::Seeds | Food::Carrot | Food::Corn)
    }

    /// As in "fed Hammi a carrot" / "gave Hammi a strawberry".
    fn serving(self) -> &'static str {
        match self {
            Food::Seeds => "a bowl of seed mix",
            Food::Carrot => "a carrot",
            Food::Corn => "some corn",
            Food::Sunflower => "a sunflower seed",
            Food::Strawberry => "a strawberry",
            Food::Peanut => "a peanut",
        }
    }

    /// As in "Hammi's favourite food is strawberries".
    fn plural(self) -> &'static str {
        match self {
            Food::Seeds => "seed mix",
            Food::Carrot => "carrots",
            Food::Corn => "corn",
            Food::Sunflower => "sunflower seeds",
            Food::Strawberry => "strawberries",
            Food::Peanut => "peanuts",
        }
    }
}

pub fn birthday_text(name: &str, weeks: u32) -> String {
    match weeks {
        1 => format!("{name} is 1 week old today! 🎂"),
        n => format!("{name} is {n} weeks old today! 🎂"),
    }
}

impl ActionKind {
    /// "a snack", as in "granted Hammi's wish for a snack".
    pub fn wish_noun(self) -> &'static str {
        match self {
            ActionKind::Meal => "a meal",
            ActionKind::Snack => "a snack",
            ActionKind::Play => "a game",
            ActionKind::Clean => "a tidy cage",
            ActionKind::Pet => "a cuddle",
            ActionKind::Lights => "the lights",
        }
    }
}

pub struct Outcome {
    pub reaction: &'static str,
    /// Log line describing what the player did, without the player's name ("fed Hammi a meal").
    pub log: Option<String>,
    /// A second diary line for a discovery, e.g. finding out the favourite food.
    pub discovery: Option<String>,
}

impl Outcome {
    fn quiet(reaction: &'static str) -> Self {
        Outcome { reaction, log: None, discovery: None }
    }

    fn logged(reaction: &'static str, log: String) -> Self {
        Outcome { reaction, log: Some(log), discovery: None }
    }
}

fn is_night(at: DateTime<Utc>, tz: Tz) -> bool {
    let t = at.with_timezone(&tz).time();
    let sleep = NaiveTime::from_hms_opt(21, 30, 0).unwrap();
    let wake = NaiveTime::from_hms_opt(7, 30, 0).unwrap();
    t >= sleep || t < wake
}

pub fn is_quiet_hours(at: DateTime<Utc>, tz: Tz) -> bool {
    let t = at.with_timezone(&tz).time();
    t >= NaiveTime::from_hms_opt(22, 0, 0).unwrap() || t < NaiveTime::from_hms_opt(8, 0, 0).unwrap()
}

impl Pet {
    pub fn new(now: DateTime<Utc>) -> Self {
        Pet {
            name: "Hammi".into(),
            created_at: now,
            egg_found_at: None,
            hatched_at: None,
            stage: Stage::Egg,
            form: None,
            fullness: 70.0,
            fun: 70.0,
            energy: 100.0,
            poops: 0,
            poops_due: Vec::new(),
            asleep: false,
            napping: false,
            lights_off: false,
            care: Care::default(),
            last_counted_pet: None,
            last_tick: now,
            wish: None,
            birthdays: 0,
            last_local_date: None,
            recent_snacks: Vec::new(),
            last_counted_snack: None,
            cuddle_window: None,
            favourite_food: None,
            favourite_known: false,
            groggy_since: None,
        }
    }

    /// When the egg hatches, once someone has found it.
    pub fn hatches_at(&self) -> Option<DateTime<Utc>> {
        (self.stage == Stage::Egg).then_some(self.egg_found_at? + HATCH_AFTER)
    }

    /// Start the hatching countdown on the first login. Returns true if this login found the egg.
    pub fn find_egg(&mut self, now: DateTime<Utc>) -> bool {
        let found = self.stage == Stage::Egg && self.egg_found_at.is_none();
        if found {
            self.egg_found_at = Some(now);
        }
        found
    }

    /// What Hammi is celebrating today, if anything: (kind, text) with kind "special" or "birthday".
    pub fn celebration(&self, now: DateTime<Utc>, tz: Tz, special_days: &[SpecialDay]) -> Option<(&'static str, String)> {
        if let Some(day) = SpecialDay::on(special_days, now.with_timezone(&tz).date_naive()) {
            return Some(("special", day.text.clone()));
        }
        let age = now - self.hatched_at?;
        let in_birthday_day = age >= Duration::days(7) && age.num_days() % 7 == 0;
        in_birthday_day.then(|| ("birthday", birthday_text(&self.name, (age.num_days() / 7) as u32)))
    }

    pub fn mood(&self) -> Mood {
        let score = (self.fullness + self.fun + self.energy) / 3.0 - 8.0 * self.poops as f64;
        if score >= 60.0 {
            Mood::Happy
        } else if score >= 30.0 {
            Mood::Okay
        } else {
            Mood::Sad
        }
    }

    /// Advance the simulation to `now` in steps of at most one minute.
    pub fn tick(&mut self, now: DateTime<Utc>, ctx: &mut Ctx) -> Vec<Happening> {
        let mut out = Vec::new();
        while self.last_tick < now {
            let step_end = (self.last_tick + Duration::minutes(1)).min(now);
            let hours = (step_end - self.last_tick).num_milliseconds() as f64 / 3_600_000.0;
            self.step(step_end, hours, ctx, &mut out);
            self.last_tick = step_end;
        }
        out
    }

    fn step(&mut self, at: DateTime<Utc>, hours: f64, ctx: &mut Ctx, out: &mut Vec<Happening>) {
        let tz = ctx.tz;
        let today = at.with_timezone(&tz).date_naive();
        if self.last_local_date != Some(today) {
            self.last_local_date = Some(today);
            if let Some(day) = SpecialDay::on(ctx.special_days, today) {
                out.push(Happening::SpecialDay(day.text.clone()));
            }
        }

        if self.stage == Stage::Egg {
            if self.hatches_at().is_some_and(|h| at >= h) {
                self.stage = Stage::Baby;
                self.hatched_at = Some(at);
                out.push(Happening::Hatched);
            }
            return;
        }

        if self.asleep {
            self.fullness -= 2.0 * hours;
            self.energy += if self.lights_off { 19.0 } else { 15.0 } * hours;
        } else {
            self.fullness -= 6.0 * hours;
            self.fun -= 8.0 * hours;
            self.energy -= 5.5 * hours;
        }
        self.clamp();

        let night = is_night(at, tz);
        if self.asleep {
            if self.napping && night {
                self.napping = false;
            }
            let done = if self.napping { self.energy >= 100.0 } else { !night };
            if done {
                self.asleep = false;
                self.napping = false;
                self.lights_off = false;
                out.push(Happening::WokeUp);
            }
        } else if let Some(last) = self.groggy_since {
            let sleepy = night || self.energy < 10.0;
            let doze_after = if self.lights_off { DOZE_OFF_LIGHTS_OFF } else { DOZE_OFF_LIGHTS_ON };
            if !sleepy {
                self.groggy_since = None;
            } else if at - last >= doze_after {
                self.fall_asleep(night, out);
            }
        } else if night || self.energy < 10.0 {
            self.fall_asleep(night, out);
        }

        if self.wish.is_some_and(|w| w.until <= at) {
            self.wish = None;
        }
        let hour = at.with_timezone(&tz).hour();
        if self.wish.is_none() && !self.asleep && (9..20).contains(&hour) && (ctx.roll)() < WISH_CHANCE_PER_MINUTE {
            let mut options = vec![ActionKind::Snack, ActionKind::Pet];
            if self.fullness < 80.0 {
                options.push(ActionKind::Meal);
            }
            if self.energy > 20.0 {
                options.push(ActionKind::Play);
            }
            if self.poops > 0 {
                options.push(ActionKind::Clean);
            }
            let pick = ((ctx.roll)() * options.len() as f64) as usize;
            let kind = options[pick.min(options.len() - 1)];
            self.wish = Some(Wish { kind, until: at + WISH_LASTS });
            out.push(Happening::Wished(kind));
        }

        let before = self.poops_due.len();
        self.poops_due.retain(|due| *due > at);
        for _ in self.poops_due.len()..before {
            if self.poops < MAX_POOPS {
                self.poops += 1;
                out.push(Happening::Pooped);
            }
        }

        if let Some(hatched) = self.hatched_at {
            let age = at - hatched;
            if self.stage == Stage::Baby && age >= Duration::hours(KID_AT_HOURS) {
                self.stage = Stage::Kid;
                out.push(Happening::Grew(Stage::Kid));
            } else if self.stage == Stage::Kid && age >= Duration::hours(ADULT_AT_HOURS) {
                self.stage = Stage::Adult;
                self.form = Some(self.adult_form());
                out.push(Happening::Grew(Stage::Adult));
            }
            if age >= Duration::days(7 * (self.birthdays as i64 + 1)) {
                self.birthdays += 1;
                out.push(Happening::Birthday(self.birthdays));
            }
        }
    }

    fn fall_asleep(&mut self, night: bool, out: &mut Vec<Happening>) {
        self.asleep = true;
        self.napping = !night;
        self.groggy_since = None;
        self.wish = None;
        out.push(Happening::FellAsleep);
    }

    /// The kind of care Hammi got most decides its adult form. Ties go to snuggly.
    fn adult_form(&self) -> Form {
        let c = &self.care;
        let candidates = [
            (Form::Snuggly, c.pets),
            (Form::Chonky, c.meals + c.snacks),
            (Form::Zoomy, c.plays),
            (Form::Fluffy, c.cleans),
        ];
        // max_by_key returns the last max, so iterate reversed to make the first entry win ties.
        candidates.iter().rev().max_by_key(|(_, n)| *n).map(|(f, _)| *f).unwrap()
    }

    fn clamp(&mut self) {
        self.fullness = self.fullness.clamp(0.0, 100.0);
        self.fun = self.fun.clamp(0.0, 100.0);
        self.energy = self.energy.clamp(0.0, 100.0);
    }

    /// Apply a player action. `poop_delay_minutes` is only used by meals.
    pub fn act(&mut self, action: Action, poop_delay_minutes: i64, now: DateTime<Utc>) -> Outcome {
        let mut outcome = self.act_inner(action, poop_delay_minutes, now);
        if self.groggy_since.is_some() {
            self.groggy_since = Some(now);
        }
        let ate = matches!(action.kind, ActionKind::Meal | ActionKind::Snack) && outcome.log.is_some();
        if ate && action.food.is_some() && self.favourite_food == action.food {
            self.fun = (self.fun + FAVOURITE_BONUS_FUN).min(100.0);
            outcome.reaction = "favourite";
            if !self.favourite_known {
                self.favourite_known = true;
                let food = self.favourite_food.unwrap().plural();
                outcome.discovery = Some(format!("found out {}'s favourite food is {food}!", self.name));
            }
        }
        let granted = outcome.log.is_some() || outcome.reaction == "love";
        if granted && self.wish.is_some_and(|w| w.kind == action.kind) {
            self.wish = None;
            self.fun = (self.fun + WISH_BONUS_FUN).min(100.0);
            outcome.reaction = "delighted";
            outcome.log = Some(format!("granted {}'s wish for {}", self.name, action.kind.wish_noun()));
        }
        outcome
    }

    /// Pick the secret favourite food if it hasn't been picked yet. `roll` is uniform in [0, 1).
    pub fn ensure_favourite(&mut self, roll: f64) {
        if self.favourite_food.is_none() {
            let i = ((roll * Food::ALL.len() as f64) as usize).min(Food::ALL.len() - 1);
            self.favourite_food = Some(Food::ALL[i]);
        }
    }

    fn act_inner(&mut self, Action { kind, won, game, food }: Action, poop_delay_minutes: i64, now: DateTime<Utc>) -> Outcome {
        let name = self.name.clone();
        if self.stage == Stage::Egg {
            return Outcome::quiet(if kind == ActionKind::Pet { "love" } else { "egg" });
        }
        let needs_awake = matches!(kind, ActionKind::Meal | ActionKind::Snack | ActionKind::Play);
        if needs_awake && self.asleep {
            return Outcome::quiet("asleep");
        }

        let outcome = match kind {
            ActionKind::Meal => {
                if self.fullness >= 95.0 {
                    return Outcome::quiet("full");
                }
                self.fullness += 35.0;
                self.poops_due.push(now + Duration::minutes(poop_delay_minutes));
                self.care.meals += 1;
                let food = food.unwrap_or(Food::Seeds).serving();
                Outcome::logged("yum", format!("fed {name} {food}"))
            }
            ActionKind::Snack => {
                self.recent_snacks.retain(|t| now - *t < SNACK_WINDOW);
                if self.recent_snacks.len() >= SNACKS_PER_WINDOW {
                    return Outcome::quiet("full");
                }
                self.recent_snacks.push(now);
                self.fullness += 8.0;
                self.fun += 12.0;
                if self.last_counted_snack.is_none_or(|t| now - t >= SNACK_CARE_COOLDOWN) {
                    self.last_counted_snack = Some(now);
                    self.care.snacks += 1;
                }
                let food = food.unwrap_or(Food::Sunflower).serving();
                Outcome::logged("yum", format!("gave {name} {food}"))
            }
            ActionKind::Play => {
                let won = won.min(5);
                self.fun += 10.0 + 6.0 * won as f64;
                self.energy -= 8.0;
                self.care.plays += 1;
                Outcome::logged("happy", format!("played {} with {name} and won {won}/5", game.title()))
            }
            ActionKind::Clean => {
                if self.poops == 0 {
                    return Outcome::quiet("nothing");
                }
                self.poops = 0;
                self.care.cleans += 1;
                Outcome::logged("clean", format!("tidied {name}'s cage"))
            }
            ActionKind::Pet => {
                if self.asleep {
                    // A tap wakes Hammi, sleepy but happy to see you.
                    self.asleep = false;
                    self.napping = false;
                    self.groggy_since = Some(now);
                    return Outcome::logged("yawn", format!("woke {name} up"));
                }
                let cuddles = match self.cuddle_window {
                    Some((start, n)) if now - start < PET_CARE_COOLDOWN => n + 1,
                    _ => 1,
                };
                let start = if cuddles == 1 { now } else { self.cuddle_window.unwrap().0 };
                self.cuddle_window = Some((start, cuddles));
                self.fun += CUDDLE_FUN.get(cuddles as usize - 1).copied().unwrap_or(0.0);
                let counts = self.last_counted_pet.is_none_or(|t| now - t >= PET_CARE_COOLDOWN);
                if counts {
                    self.last_counted_pet = Some(now);
                    self.care.pets += 1;
                    Outcome::logged("love", format!("cuddled {name}"))
                } else {
                    Outcome::quiet("love")
                }
            }
            ActionKind::Lights => {
                self.lights_off = !self.lights_off;
                if self.lights_off {
                    Outcome::quiet("lights_off")
                } else {
                    Outcome::quiet("lights_on")
                }
            }
        };
        self.clamp();
        outcome
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    const TZ: Tz = chrono_tz::Europe::Copenhagen;

    /// Noon local time on a fixed day, so the pet starts awake.
    fn noon() -> DateTime<Utc> {
        TZ.with_ymd_and_hms(2026, 6, 1, 12, 0, 0).unwrap().with_timezone(&Utc)
    }

    fn hatched(now: DateTime<Utc>) -> Pet {
        let mut p = Pet::new(now - Duration::minutes(6));
        p.find_egg(now - Duration::minutes(6));
        p.t(now);
        p
    }

    impl Pet {
        /// Tick with no wishes and no special days.
        fn t(&mut self, now: DateTime<Utc>) -> Vec<Happening> {
            self.tick(now, &mut Ctx { tz: TZ, special_days: &[], roll: &mut || 1.0 })
        }

        fn a(&mut self, kind: ActionKind, won: u8, poop_delay: i64, now: DateTime<Utc>) -> Outcome {
            self.act(Action { kind, won, game: Game::Leftright, food: None }, poop_delay, now)
        }
    }

    #[test]
    fn favourite_food_is_discovered_once_and_gives_extra_fun() {
        let mut p = hatched(noon());
        p.ensure_favourite(0.7); // index 4: strawberry
        p.ensure_favourite(0.0);
        assert_eq!(p.favourite_food, Some(Food::Strawberry), "picked once, then kept");

        let snack = |food| Action { kind: ActionKind::Snack, won: 0, game: Game::Leftright, food: Some(food) };
        let o = p.act(snack(Food::Peanut), 0, noon());
        assert_eq!((o.reaction, o.log.as_deref()), ("yum", Some("gave Hammi a peanut")));

        p.fun = 50.0;
        let o = p.act(snack(Food::Strawberry), 0, noon());
        assert_eq!(o.reaction, "favourite");
        assert_eq!(o.discovery.as_deref(), Some("found out Hammi's favourite food is strawberries!"));
        assert!((p.fun - 70.0).abs() < 0.01, "12 + 8 favourite bonus, fun {}", p.fun);
        assert!(p.favourite_known);

        let o = p.act(snack(Food::Strawberry), 0, noon());
        assert_eq!(o.reaction, "favourite");
        assert!(o.discovery.is_none(), "only discovered once");
    }

    #[test]
    fn snacks_and_cuddles_wear_off_instead_of_being_spammable() {
        let mut p = hatched(noon());
        for i in 0..3 {
            assert_eq!(p.a(ActionKind::Snack, 0, 0, noon() + Duration::minutes(i)).reaction, "yum");
        }
        assert_eq!(p.a(ActionKind::Snack, 0, 0, noon() + Duration::minutes(5)).reaction, "full");
        assert_eq!(p.care.snacks, 1, "snacks count towards the adult form once per 30 minutes");
        assert_eq!(p.a(ActionKind::Snack, 0, 0, noon() + Duration::minutes(61)).reaction, "yum");

        let mut p = hatched(noon());
        p.fun = 50.0;
        for i in 0..6 {
            assert_eq!(p.a(ActionKind::Pet, 0, 0, noon() + Duration::seconds(i)).reaction, "love");
        }
        assert!((p.fun - 59.0).abs() < 0.01, "5 + 3 + 1 then nothing, fun {}", p.fun);
        p.a(ActionKind::Pet, 0, 0, noon() + Duration::minutes(11));
        assert!((p.fun - 64.0).abs() < 0.01, "a new window starts fresh");
    }

    #[test]
    fn wishes_appear_by_day_fade_and_can_be_granted() {
        let mut p = hatched(noon());
        let events = p.tick(noon() + Duration::minutes(2), &mut Ctx { tz: TZ, special_days: &[], roll: &mut || 0.0 });
        assert!(matches!(events.as_slice(), [Happening::Wished(ActionKind::Snack)]));
        let fun = p.fun;
        let o = p.a(ActionKind::Snack, 0, 0, noon() + Duration::minutes(2));
        assert_eq!(o.reaction, "delighted");
        assert_eq!(o.log.as_deref(), Some("granted Hammi's wish for a snack"));
        assert!(p.fun >= fun + 12.0 + 15.0 - 0.1);
        assert!(p.wish.is_none());

        p.wish = Some(Wish { kind: ActionKind::Pet, until: noon() + Duration::hours(1) });
        p.t(noon() + Duration::minutes(61));
        assert!(p.wish.is_none(), "wishes fade quietly");

        let mut p = hatched(noon() + Duration::hours(9)); // 21:00, outside wish hours
        p.tick(noon() + Duration::hours(9) + Duration::minutes(5), &mut Ctx { tz: TZ, special_days: &[], roll: &mut || 0.0 });
        assert!(p.wish.is_none());
    }

    #[test]
    fn celebrates_weekly_birthdays_and_special_days() {
        let mut p = hatched(noon());
        let events = p.t(noon() + Duration::days(7) + Duration::minutes(1));
        assert!(events.contains(&Happening::Birthday(1)));
        assert_eq!(
            p.celebration(noon() + Duration::days(7) + Duration::hours(1), TZ, &[]),
            Some(("birthday", "Hammi is 1 week old today! 🎂".to_string()))
        );
        assert_eq!(p.celebration(noon() + Duration::days(8) + Duration::hours(1), TZ, &[]), None);

        let days = SpecialDay::parse_list("06-02|Happy birthday, love! 💐; bad; 13-40|nope");
        assert_eq!(days.len(), 1);
        let mut p = hatched(noon());
        let events = p.tick(noon() + Duration::days(1), &mut Ctx { tz: TZ, special_days: &days, roll: &mut || 1.0 });
        assert!(events.contains(&Happening::SpecialDay("Happy birthday, love! 💐".into())));
        assert_eq!(p.celebration(noon() + Duration::days(1), TZ, &days).unwrap().0, "special");
    }

    #[test]
    fn egg_waits_to_be_found_then_hatches_after_five_minutes() {
        let mut p = Pet::new(noon());
        assert!(p.t(noon() + Duration::hours(3)).is_empty(), "nobody has logged in yet");
        assert_eq!(p.hatches_at(), None);

        let found = noon() + Duration::hours(3);
        assert!(p.find_egg(found));
        assert!(!p.find_egg(found + Duration::minutes(1)), "only the first login finds it");
        assert!(p.t(found + Duration::minutes(4)).is_empty());
        assert_eq!(p.stage, Stage::Egg);
        assert_eq!(p.t(found + Duration::minutes(5)), vec![Happening::Hatched]);
        assert_eq!(p.stage, Stage::Baby);
        assert_eq!(p.hatches_at(), None);
    }

    #[test]
    fn stats_decay_while_awake_and_never_go_negative() {
        let mut p = hatched(noon());
        p.t(noon() + Duration::hours(4));
        assert!((p.fullness - (70.0 - 24.0)).abs() < 0.5, "fullness {}", p.fullness);
        assert!((p.fun - (70.0 - 32.0)).abs() < 0.5, "fun {}", p.fun);

        let mut p = hatched(noon());
        p.t(noon() + Duration::days(5));
        assert!(p.fullness >= 0.0 && p.fun >= 0.0 && p.energy >= 0.0);
        assert_eq!(p.mood(), Mood::Sad);
    }

    #[test]
    fn sleeps_at_night_and_wakes_in_the_morning() {
        let mut p = hatched(noon());
        p.t(noon() + Duration::hours(10)); // 22:00
        assert!(p.asleep && !p.napping);
        p.lights_off = true;
        p.t(noon() + Duration::hours(20)); // 08:00
        assert!(!p.asleep);
        assert!(!p.lights_off, "lights come back on at wake-up");
    }

    #[test]
    fn a_tap_wakes_hammi_at_night_until_it_dozes_off_again() {
        let night = noon() + Duration::hours(11); // 23:00
        let mut p = hatched(noon());
        p.t(night);
        assert!(p.asleep);

        let o = p.a(ActionKind::Pet, 0, 0, night);
        assert_eq!((o.reaction, o.log.as_deref()), ("yawn", Some("woke Hammi up")));
        assert!(!p.asleep && p.groggy_since.is_some());
        p.fullness = 50.0;
        assert_eq!(p.a(ActionKind::Meal, 0, 90, night + Duration::minutes(8)).reaction, "yum");

        // Lights on: ten quiet minutes since the meal.
        p.t(night + Duration::minutes(17));
        assert!(!p.asleep, "the meal kept Hammi up");
        assert_eq!(p.t(night + Duration::minutes(18)), vec![Happening::FellAsleep]);
        assert!(p.asleep && p.groggy_since.is_none());

        // Lights off: five quiet minutes.
        let woke = night + Duration::minutes(30);
        p.a(ActionKind::Pet, 0, 0, woke);
        p.a(ActionKind::Lights, 0, 0, woke);
        p.t(woke + Duration::minutes(4));
        assert!(!p.asleep);
        p.t(woke + Duration::minutes(5));
        assert!(p.asleep);
    }

    #[test]
    fn a_woken_hammi_stays_up_once_morning_comes() {
        let mut p = hatched(noon());
        let early = noon() + Duration::hours(19) + Duration::minutes(25); // 07:25
        p.t(early);
        p.a(ActionKind::Pet, 0, 0, early);
        p.t(early + Duration::minutes(30));
        assert!(!p.asleep && p.groggy_since.is_none());
    }

    #[test]
    fn saves_from_before_waking_still_load() {
        let mut p = hatched(noon());
        p.asleep = true;
        let mut json = serde_json::to_value(&p).unwrap();
        json.as_object_mut().unwrap().remove("groggy_since");
        let loaded: Pet = serde_json::from_value(json).unwrap();
        assert!(loaded.asleep && loaded.groggy_since.is_none());
        assert_eq!(loaded.care.meals, p.care.meals);
    }

    #[test]
    fn naps_when_exhausted_and_wakes_rested() {
        let mut p = hatched(noon());
        p.energy = 10.5;
        p.t(noon() + Duration::minutes(10));
        assert!(p.asleep && p.napping);
        p.t(noon() + Duration::hours(7));
        assert!(!p.asleep);
        assert!(p.energy >= 90.0, "woke rested about an hour ago, energy {}", p.energy);
    }

    #[test]
    fn meal_makes_a_poop_later_and_clean_removes_it() {
        let mut p = hatched(noon());
        let o = p.a(ActionKind::Meal, 0, 90, noon());
        assert_eq!(o.reaction, "yum");
        p.t(noon() + Duration::minutes(89));
        assert_eq!(p.poops, 0);
        p.t(noon() + Duration::minutes(91));
        assert_eq!(p.poops, 1);
        assert_eq!(p.a(ActionKind::Clean, 0, 0, noon()).reaction, "clean");
        assert_eq!(p.poops, 0);
        assert_eq!(p.a(ActionKind::Clean, 0, 0, noon()).reaction, "nothing");
    }

    #[test]
    fn refuses_meal_when_full_and_food_while_asleep() {
        let mut p = hatched(noon());
        p.fullness = 96.0;
        assert_eq!(p.a(ActionKind::Meal, 0, 90, noon()).reaction, "full");
        p.asleep = true;
        assert_eq!(p.a(ActionKind::Snack, 0, 0, noon()).reaction, "asleep");
        assert_eq!(p.a(ActionKind::Lights, 0, 0, noon()).reaction, "lights_off");
    }

    #[test]
    fn petting_counts_for_care_once_per_ten_minutes() {
        let mut p = hatched(noon());
        assert!(p.a(ActionKind::Pet, 0, 0, noon()).log.is_some());
        assert!(p.a(ActionKind::Pet, 0, 0, noon() + Duration::minutes(5)).log.is_none());
        assert!(p.a(ActionKind::Pet, 0, 0, noon() + Duration::minutes(10)).log.is_some());
        assert_eq!(p.care.pets, 2);
    }

    #[test]
    fn grows_up_into_a_form_matching_its_care() {
        let mut p = hatched(noon());
        p.care.plays = 20;
        p.care.meals = 5;
        let events = p.t(noon() + Duration::hours(97));
        assert!(events.contains(&Happening::Grew(Stage::Kid)));
        assert!(events.contains(&Happening::Grew(Stage::Adult)));
        assert_eq!(p.form, Some(Form::Zoomy));

        let mut p = hatched(noon());
        p.t(noon() + Duration::hours(97));
        assert_eq!(p.form, Some(Form::Snuggly), "no care at all still gives a cute form");
    }
}

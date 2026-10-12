//! The pet simulation. Pure logic: no I/O, all time passed in explicitly.
//! Rules are documented in docs/DESIGN.md.

use chrono::{DateTime, Duration, NaiveTime, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

const HATCH_AFTER: Duration = Duration::minutes(5);
const KID_AT_HOURS: i64 = 24;
const ADULT_AT_HOURS: i64 = 96;
const MAX_POOPS: u8 = 4;
const PET_CARE_COOLDOWN: Duration = Duration::minutes(10);

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
}

/// Something that happened during a tick, for the event log and notifications.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Happening {
    Hatched,
    Grew(Stage),
    FellAsleep,
    WokeUp,
    Pooped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionKind {
    Meal,
    Snack,
    Play,
    Clean,
    Pet,
    Lights,
}

pub struct Outcome {
    pub reaction: &'static str,
    /// Log line describing what the player did, without the player's name ("fed Hammi a meal").
    pub log: Option<String>,
}

impl Outcome {
    fn quiet(reaction: &'static str) -> Self {
        Outcome { reaction, log: None }
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
        }
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
    pub fn tick(&mut self, now: DateTime<Utc>, tz: Tz) -> Vec<Happening> {
        let mut out = Vec::new();
        while self.last_tick < now {
            let step_end = (self.last_tick + Duration::minutes(1)).min(now);
            let hours = (step_end - self.last_tick).num_milliseconds() as f64 / 3_600_000.0;
            self.step(step_end, hours, tz, &mut out);
            self.last_tick = step_end;
        }
        out
    }

    fn step(&mut self, at: DateTime<Utc>, hours: f64, tz: Tz, out: &mut Vec<Happening>) {
        if self.stage == Stage::Egg {
            if at >= self.created_at + HATCH_AFTER {
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
        } else if night || self.energy < 10.0 {
            self.asleep = true;
            self.napping = !night;
            out.push(Happening::FellAsleep);
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
        }
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

    /// Apply a player action. `won` is only used by `Play`; `poop_delay_minutes` by `Meal`.
    pub fn act(&mut self, kind: ActionKind, won: u8, poop_delay_minutes: i64, now: DateTime<Utc>) -> Outcome {
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
                Outcome { reaction: "yum", log: Some(format!("fed {name} a meal")) }
            }
            ActionKind::Snack => {
                self.fullness += 8.0;
                self.fun += 12.0;
                self.care.snacks += 1;
                Outcome { reaction: "yum", log: Some(format!("gave {name} a sunflower seed")) }
            }
            ActionKind::Play => {
                let won = won.min(5);
                self.fun += 10.0 + 6.0 * won as f64;
                self.energy -= 8.0;
                self.care.plays += 1;
                Outcome { reaction: "happy", log: Some(format!("played with {name} and won {won}/5")) }
            }
            ActionKind::Clean => {
                if self.poops == 0 {
                    return Outcome::quiet("nothing");
                }
                self.poops = 0;
                self.care.cleans += 1;
                Outcome { reaction: "clean", log: Some(format!("tidied {name}'s cage")) }
            }
            ActionKind::Pet => {
                if self.asleep {
                    return Outcome::quiet("love");
                }
                self.fun += 5.0;
                let counts = self.last_counted_pet.is_none_or(|t| now - t >= PET_CARE_COOLDOWN);
                if counts {
                    self.last_counted_pet = Some(now);
                    self.care.pets += 1;
                    Outcome { reaction: "love", log: Some(format!("cuddled {name}")) }
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
        p.tick(now, TZ);
        p
    }

    #[test]
    fn egg_hatches_after_five_minutes() {
        let mut p = Pet::new(noon());
        assert!(p.tick(noon() + Duration::minutes(4), TZ).is_empty());
        assert_eq!(p.stage, Stage::Egg);
        assert_eq!(p.tick(noon() + Duration::minutes(5), TZ), vec![Happening::Hatched]);
        assert_eq!(p.stage, Stage::Baby);
    }

    #[test]
    fn stats_decay_while_awake_and_never_go_negative() {
        let mut p = hatched(noon());
        p.tick(noon() + Duration::hours(4), TZ);
        assert!((p.fullness - (70.0 - 24.0)).abs() < 0.5, "fullness {}", p.fullness);
        assert!((p.fun - (70.0 - 32.0)).abs() < 0.5, "fun {}", p.fun);

        let mut p = hatched(noon());
        p.tick(noon() + Duration::days(5), TZ);
        assert!(p.fullness >= 0.0 && p.fun >= 0.0 && p.energy >= 0.0);
        assert_eq!(p.mood(), Mood::Sad);
    }

    #[test]
    fn sleeps_at_night_and_wakes_in_the_morning() {
        let mut p = hatched(noon());
        p.tick(noon() + Duration::hours(10), TZ); // 22:00
        assert!(p.asleep && !p.napping);
        p.lights_off = true;
        p.tick(noon() + Duration::hours(20), TZ); // 08:00
        assert!(!p.asleep);
        assert!(!p.lights_off, "lights come back on at wake-up");
    }

    #[test]
    fn naps_when_exhausted_and_wakes_rested() {
        let mut p = hatched(noon());
        p.energy = 10.5;
        p.tick(noon() + Duration::minutes(10), TZ);
        assert!(p.asleep && p.napping);
        p.tick(noon() + Duration::hours(7), TZ);
        assert!(!p.asleep);
        assert!(p.energy >= 90.0, "woke rested about an hour ago, energy {}", p.energy);
    }

    #[test]
    fn meal_makes_a_poop_later_and_clean_removes_it() {
        let mut p = hatched(noon());
        let o = p.act(ActionKind::Meal, 0, 90, noon());
        assert_eq!(o.reaction, "yum");
        p.tick(noon() + Duration::minutes(89), TZ);
        assert_eq!(p.poops, 0);
        p.tick(noon() + Duration::minutes(91), TZ);
        assert_eq!(p.poops, 1);
        assert_eq!(p.act(ActionKind::Clean, 0, 0, noon()).reaction, "clean");
        assert_eq!(p.poops, 0);
        assert_eq!(p.act(ActionKind::Clean, 0, 0, noon()).reaction, "nothing");
    }

    #[test]
    fn refuses_meal_when_full_and_food_while_asleep() {
        let mut p = hatched(noon());
        p.fullness = 96.0;
        assert_eq!(p.act(ActionKind::Meal, 0, 90, noon()).reaction, "full");
        p.asleep = true;
        assert_eq!(p.act(ActionKind::Snack, 0, 0, noon()).reaction, "asleep");
        assert_eq!(p.act(ActionKind::Lights, 0, 0, noon()).reaction, "lights_off");
    }

    #[test]
    fn petting_counts_for_care_once_per_ten_minutes() {
        let mut p = hatched(noon());
        assert!(p.act(ActionKind::Pet, 0, 0, noon()).log.is_some());
        assert!(p.act(ActionKind::Pet, 0, 0, noon() + Duration::minutes(5)).log.is_none());
        assert!(p.act(ActionKind::Pet, 0, 0, noon() + Duration::minutes(10)).log.is_some());
        assert_eq!(p.care.pets, 2);
    }

    #[test]
    fn grows_up_into_a_form_matching_its_care() {
        let mut p = hatched(noon());
        p.care.plays = 20;
        p.care.meals = 5;
        let events = p.tick(noon() + Duration::hours(97), TZ);
        assert!(events.contains(&Happening::Grew(Stage::Kid)));
        assert!(events.contains(&Happening::Grew(Stage::Adult)));
        assert_eq!(p.form, Some(Form::Zoomy));

        let mut p = hatched(noon());
        p.tick(noon() + Duration::hours(97), TZ);
        assert_eq!(p.form, Some(Form::Snuggly), "no care at all still gives a cute form");
    }
}

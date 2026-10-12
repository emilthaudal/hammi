//! Deciding when to send a push. Sending lives in push.rs.

use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

use crate::game::{birthday_text, is_quiet_hours, ActionKind, Happening, Pet, Stage};

const MIN_GAP: Duration = Duration::minutes(90);
const KIND_COOLDOWN: Duration = Duration::hours(4);
/// Only nudge about a wish with at least this long left to grant it.
const WISH_STILL_FRESH: Duration = Duration::minutes(60);

fn wish_text(pet: &Pet) -> String {
    let name = &pet.name;
    match pet.wish.map(|w| w.kind) {
        Some(ActionKind::Meal) => format!("{name} is daydreaming about a big bowl of food 💭"),
        Some(ActionKind::Snack) => format!("{name} is daydreaming about a sunflower seed 💭"),
        Some(ActionKind::Play) => format!("{name} would love to play a game with you 💭"),
        Some(ActionKind::Clean) => format!("{name} is dreaming of a sparkly clean cage 💭"),
        Some(ActionKind::Pet) => format!("{name} could really use a cuddle 💭"),
        _ => String::new(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Note {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct NotifyState {
    last_sent: Option<DateTime<Utc>>,
    last_by_kind: HashMap<String, DateTime<Utc>>,
    /// Milestones waiting for quiet hours to end.
    pending: Vec<Note>,
}

impl NotifyState {
    pub fn record(&mut self, pet: &Pet, happenings: &[Happening]) {
        let name = &pet.name;
        for h in happenings {
            let body = match h {
                Happening::Hatched => format!("{name} hatched! 🐣"),
                Happening::Grew(Stage::Adult) => format!("{name} is all grown up! 🎉"),
                Happening::Grew(_) => format!("{name} grew up a little! 🎉"),
                Happening::Birthday(weeks) => birthday_text(name, *weeks),
                Happening::SpecialDay(text) => text.clone(),
                _ => continue,
            };
            self.pending.push(Note { title: name.clone(), body });
        }
    }

    /// Notes to send right now, if any.
    pub fn due(&mut self, pet: &Pet, now: DateTime<Utc>, tz: Tz) -> Vec<Note> {
        if is_quiet_hours(now, tz) {
            return Vec::new();
        }
        if !self.pending.is_empty() {
            self.last_sent = Some(now);
            return std::mem::take(&mut self.pending);
        }
        if pet.asleep || pet.stage == Stage::Egg || self.last_sent.is_some_and(|t| now - t < MIN_GAP) {
            return Vec::new();
        }

        let name = &pet.name;
        let needs = [
            ("hungry", pet.fullness < 25.0, format!("{name}'s tummy is rumbling 🌻")),
            ("bored", pet.fun < 25.0, format!("{name} wants to play with you!")),
            ("tidy", pet.poops >= 3, format!("{name}'s cage could use a little tidy 🧹")),
            ("wish", pet.wish.is_some_and(|w| w.until - now > WISH_STILL_FRESH), wish_text(pet)),
        ];
        for (kind, active, body) in needs {
            let cooled = self.last_by_kind.get(kind).is_none_or(|t| now - *t >= KIND_COOLDOWN);
            if active && cooled {
                self.last_sent = Some(now);
                self.last_by_kind.insert(kind.into(), now);
                return vec![Note { title: name.clone(), body }];
            }
        }
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    const TZ: Tz = chrono_tz::Europe::Copenhagen;

    fn at(hour: u32) -> DateTime<Utc> {
        TZ.with_ymd_and_hms(2026, 6, 1, hour, 0, 0).unwrap().with_timezone(&Utc)
    }

    fn hungry_pet() -> Pet {
        let mut p = Pet::new(at(9));
        p.stage = Stage::Baby;
        p.fullness = 10.0;
        p
    }

    #[test]
    fn nags_gently_with_gaps_and_cooldowns() {
        let mut n = NotifyState::default();
        let p = hungry_pet();
        assert_eq!(n.due(&p, at(12), TZ).len(), 1);
        assert!(n.due(&p, at(13), TZ).is_empty(), "90 minute gap");
        assert!(n.due(&p, at(14), TZ).is_empty(), "hungry is on its 4h cooldown");
        assert_eq!(n.due(&p, at(16), TZ).len(), 1);
    }

    #[test]
    fn holds_milestones_through_quiet_hours() {
        let mut n = NotifyState::default();
        let p = hungry_pet();
        n.record(&p, &[Happening::Hatched]);
        assert!(n.due(&p, at(23), TZ).is_empty());
        let notes = n.due(&p, at(8), TZ);
        assert_eq!(notes[0].body, "Hammi hatched! 🐣");
    }
}

use anyhow::Result;
use chrono::{DateTime, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::game::Pet;
use crate::notify::NotifyState;

pub struct Db(Connection);

#[derive(Serialize)]
pub struct Event {
    pub at: DateTime<Utc>,
    pub who: String,
    pub text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Treasure {
    pub item: String,
    pub count: u32,
    pub first_found_by: String,
    pub first_found_at: DateTime<Utc>,
}

pub struct PushSub {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

/// How many times `existing` already repeats `text`: 1 for an exact match, N for "<text> (×N)".
fn repeat_count(existing: &str, text: &str) -> Option<u32> {
    if existing == text {
        return Some(1);
    }
    existing.strip_prefix(text)?.strip_prefix(" (×")?.strip_suffix(')')?.parse().ok()
}

impl Db {
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS world (
                 id INTEGER PRIMARY KEY CHECK (id = 1),
                 pet TEXT NOT NULL,
                 notify TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS sessions (
                 token TEXT PRIMARY KEY,
                 name TEXT NOT NULL,
                 created_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS push_subs (
                 endpoint TEXT PRIMARY KEY,
                 p256dh TEXT NOT NULL,
                 auth TEXT NOT NULL,
                 created_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS gifts (
                 player TEXT NOT NULL,
                 day TEXT NOT NULL,
                 item TEXT NOT NULL,
                 PRIMARY KEY (player, day)
             );
             CREATE TABLE IF NOT EXISTS treasures (
                 item TEXT PRIMARY KEY,
                 count INTEGER NOT NULL,
                 first_found_by TEXT NOT NULL,
                 first_found_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS events (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 at TEXT NOT NULL,
                 who TEXT NOT NULL,
                 text TEXT NOT NULL
             );",
        )?;
        Ok(Db(conn))
    }

    pub fn load_world(&self) -> Result<Option<(Pet, NotifyState)>> {
        let row: Option<(String, String)> = self
            .0
            .query_row("SELECT pet, notify FROM world WHERE id = 1", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()?;
        row.map(|(pet, notify)| Ok((serde_json::from_str(&pet)?, serde_json::from_str(&notify)?)))
            .transpose()
    }

    pub fn save_world(&self, pet: &Pet, notify: &NotifyState) -> Result<()> {
        self.0.execute(
            "INSERT INTO world (id, pet, notify) VALUES (1, ?1, ?2)
             ON CONFLICT (id) DO UPDATE SET pet = excluded.pet, notify = excluded.notify",
            params![serde_json::to_string(pet)?, serde_json::to_string(notify)?],
        )?;
        Ok(())
    }

    pub fn create_session(&self, token: &str, name: &str) -> Result<()> {
        self.0.execute(
            "INSERT INTO sessions (token, name, created_at) VALUES (?1, ?2, ?3)",
            params![token, name, Utc::now()],
        )?;
        Ok(())
    }

    pub fn session_name(&self, token: &str) -> Result<Option<String>> {
        Ok(self
            .0
            .query_row("SELECT name FROM sessions WHERE token = ?1", [token], |r| r.get(0))
            .optional()?)
    }

    pub fn add_event(&self, at: DateTime<Utc>, who: &str, text: &str) -> Result<()> {
        self.0
            .execute("INSERT INTO events (at, who, text) VALUES (?1, ?2, ?3)", params![at, who, text])?;
        self.0.execute(
            "DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 200)",
            [],
        )?;
        Ok(())
    }

    /// Like `add_event`, but if the newest entry is the same text by the same person within `window`,
    /// bump it to "<text> (×N)" instead of adding a line.
    pub fn add_or_merge_event(&self, at: DateTime<Utc>, who: &str, text: &str, window: chrono::Duration) -> Result<()> {
        let last: Option<(i64, DateTime<Utc>, String, String)> = self
            .0
            .query_row("SELECT id, at, who, text FROM events ORDER BY id DESC LIMIT 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            })
            .optional()?;
        if let Some((id, last_at, last_who, last_text)) = last
            && last_who == who
            && at - last_at < window
            && let Some(count) = repeat_count(&last_text, text)
        {
            let merged = format!("{text} (×{})", count + 1);
            self.0.execute("UPDATE events SET at = ?1, text = ?2 WHERE id = ?3", params![at, merged, id])?;
            return Ok(());
        }
        self.add_event(at, who, text)
    }

    pub fn recent_events(&self, limit: u32) -> Result<Vec<Event>> {
        let mut stmt = self.0.prepare("SELECT at, who, text FROM events ORDER BY id DESC LIMIT ?1")?;
        let rows = stmt.query_map([limit], |r| Ok(Event { at: r.get(0)?, who: r.get(1)?, text: r.get(2)? }))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn gift_claimed(&self, player: &str, day: NaiveDate) -> Result<bool> {
        Ok(self
            .0
            .query_row("SELECT 1 FROM gifts WHERE player = ?1 AND day = ?2", params![player, day], |_| Ok(()))
            .optional()?
            .is_some())
    }

    /// Record a claimed gift. Returns false (and changes nothing) if this player already claimed today,
    /// otherwise whether the item is new to the treasure box.
    pub fn claim_gift(&mut self, player: &str, day: NaiveDate, item: &str, at: DateTime<Utc>) -> Result<Option<bool>> {
        let tx = self.0.transaction()?;
        let inserted = tx.execute(
            "INSERT OR IGNORE INTO gifts (player, day, item) VALUES (?1, ?2, ?3)",
            params![player, day, item],
        )?;
        if inserted == 0 {
            return Ok(None);
        }
        let is_new = tx.execute(
            "INSERT OR IGNORE INTO treasures (item, count, first_found_by, first_found_at) VALUES (?1, 1, ?2, ?3)",
            params![item, player, at],
        )? == 1;
        if !is_new {
            tx.execute("UPDATE treasures SET count = count + 1 WHERE item = ?1", [item])?;
        }
        tx.commit()?;
        Ok(Some(is_new))
    }

    pub fn treasures(&self) -> Result<Vec<Treasure>> {
        let mut stmt =
            self.0.prepare("SELECT item, count, first_found_by, first_found_at FROM treasures ORDER BY first_found_at")?;
        let rows = stmt.query_map([], |r| {
            Ok(Treasure { item: r.get(0)?, count: r.get(1)?, first_found_by: r.get(2)?, first_found_at: r.get(3)? })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn upsert_push_sub(&self, sub: &PushSub) -> Result<()> {
        self.0.execute(
            "INSERT INTO push_subs (endpoint, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth",
            params![sub.endpoint, sub.p256dh, sub.auth, Utc::now()],
        )?;
        Ok(())
    }

    pub fn delete_push_sub(&self, endpoint: &str) -> Result<()> {
        self.0.execute("DELETE FROM push_subs WHERE endpoint = ?1", [endpoint])?;
        Ok(())
    }

    pub fn push_subs(&self) -> Result<Vec<PushSub>> {
        let mut stmt = self.0.prepare("SELECT endpoint, p256dh, auth FROM push_subs")?;
        let rows = stmt.query_map([], |r| Ok(PushSub { endpoint: r.get(0)?, p256dh: r.get(1)?, auth: r.get(2)? }))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

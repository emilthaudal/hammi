use anyhow::Result;
use chrono::{DateTime, Utc};
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

pub struct PushSub {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
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

    pub fn recent_events(&self, limit: u32) -> Result<Vec<Event>> {
        let mut stmt = self.0.prepare("SELECT at, who, text FROM events ORDER BY id DESC LIMIT ?1")?;
        let rows = stmt.query_map([limit], |r| Ok(Event { at: r.get(0)?, who: r.get(1)?, text: r.get(2)? }))?;
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

mod api;
mod db;
mod game;
mod gifts;
mod notify;
mod push;

use std::sync::{Arc, Mutex};
use std::time::Instant;

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use chrono_tz::Tz;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use db::Db;
use game::{Ctx, Happening, Pet, SpecialDay};
use notify::{Note, NotifyState};
use push::{Delivery, Pusher};

pub struct Config {
    pub passcode: String,
    pub tz: Tz,
    pub special_days: Vec<SpecialDay>,
}

/// Wall clock, optionally sped up for local testing with HAMMI_SPEED.
pub struct Clock {
    started_real: Instant,
    started_at: DateTime<Utc>,
    speed: f64,
}

impl Clock {
    pub fn now(&self) -> DateTime<Utc> {
        let elapsed = self.started_real.elapsed().as_secs_f64() * self.speed;
        self.started_at + Duration::milliseconds((elapsed * 1000.0) as i64)
    }
}

pub struct World {
    pub db: Db,
    pub pet: Pet,
    pub notify: NotifyState,
}

impl World {
    /// Bring the pet up to `now`, log what happened and persist.
    pub fn advance(&mut self, now: DateTime<Utc>, config: &Config) -> Result<()> {
        let mut ctx = Ctx { tz: config.tz, special_days: &config.special_days, roll: &mut || rand::random::<f64>() };
        let happenings = self.pet.tick(now, &mut ctx);
        let name = self.pet.name.clone();
        for h in &happenings {
            let text = match h {
                Happening::Hatched => format!("{name} hatched!"),
                Happening::Grew(game::Stage::Adult) => match self.pet.form {
                    Some(form) => format!("{name} grew up into a {} hamster!", serde_json::to_value(form)?.as_str().unwrap_or("")),
                    None => format!("{name} grew up!"),
                },
                Happening::Grew(_) => format!("{name} grew up a little!"),
                Happening::FellAsleep => format!("{name} fell asleep"),
                Happening::WokeUp => format!("{name} woke up"),
                Happening::Birthday(weeks) => game::birthday_text(&name, *weeks),
                Happening::SpecialDay(text) => text.clone(),
                Happening::Pooped | Happening::Wished(_) => continue,
            };
            self.db.add_event(self.pet.last_tick, &name, &text)?;
        }
        self.notify.record(&self.pet, &happenings);
        self.db.save_world(&self.pet, &self.notify)
    }
}

pub struct AppState {
    pub world: Mutex<World>,
    pub clock: Clock,
    pub config: Config,
    pub pusher: Option<Pusher>,
}

pub type Shared = Arc<AppState>;

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

#[tokio::main]
async fn main() -> Result<()> {
    if std::env::args().nth(1).as_deref() == Some("gen-vapid") {
        return push::gen_vapid();
    }
    tracing_subscriber::fmt().init();

    let config = Config {
        passcode: std::env::var("HAMMI_PASSCODE").context("HAMMI_PASSCODE must be set")?,
        tz: env_or("HAMMI_TZ", "Europe/Copenhagen").parse().map_err(|e| anyhow::anyhow!("HAMMI_TZ: {e}"))?,
        special_days: SpecialDay::parse_list(&env_or("HAMMI_CELEBRATE", "")),
    };
    tracing::info!("{} special day(s) configured", config.special_days.len());
    let clock = Clock {
        started_real: Instant::now(),
        started_at: Utc::now(),
        speed: env_or("HAMMI_SPEED", "1").parse().context("HAMMI_SPEED must be a number")?,
    };

    let db = Db::open(&env_or("DATABASE_PATH", "hammi.db"))?;
    let (pet, notify) = match db.load_world()? {
        Some(w) => w,
        None => {
            tracing::info!("no pet yet, laying a new egg");
            (Pet::new(clock.now()), NotifyState::default())
        }
    };
    let mut world = World { db, pet, notify };
    world.advance(clock.now(), &config)?;

    let pusher = match (std::env::var("VAPID_PRIVATE_KEY"), std::env::var("VAPID_PUBLIC_KEY")) {
        (Ok(private), Ok(public)) => {
            Some(Pusher::new(private, public, env_or("VAPID_SUBJECT", "mailto:hammi@example.com"))?)
        }
        _ => {
            tracing::warn!("VAPID keys not set, push notifications are disabled");
            None
        }
    };

    let state: Shared = Arc::new(AppState { world: Mutex::new(world), clock, config, pusher });
    tokio::spawn(ticker(state.clone()));

    let static_dir = env_or("STATIC_DIR", "../web/dist");
    let spa = ServeDir::new(&static_dir).fallback(ServeFile::new(format!("{static_dir}/index.html")));
    let app = api::router(state).fallback_service(spa).layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{}", env_or("PORT", "8080"));
    tracing::info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

/// Once a minute (of game time): advance the pet and send any due notifications.
async fn ticker(state: Shared) {
    let period = std::time::Duration::from_secs_f64((60.0 / state.clock.speed).max(0.05));
    let mut interval = tokio::time::interval(period);
    loop {
        interval.tick().await;
        let due = {
            let mut w = state.world.lock().unwrap();
            let now = state.clock.now();
            if let Err(e) = w.advance(now, &state.config) {
                tracing::error!("tick failed: {e:#}");
                continue;
            }
            let World { pet, notify, db } = &mut *w;
            let notes = notify.due(pet, now, state.config.tz);
            if !notes.is_empty()
                && let Err(e) = db.save_world(pet, notify)
            {
                tracing::error!("saving notify state failed: {e:#}");
            }
            notes
        };
        if !due.is_empty() {
            send_all(&state, &due).await;
        }
    }
}

async fn send_all(state: &Shared, notes: &[Note]) {
    let Some(pusher) = &state.pusher else { return };
    let subs = state.world.lock().unwrap().db.push_subs();
    let subs = match subs {
        Ok(s) => s,
        Err(e) => return tracing::error!("loading push subscriptions failed: {e:#}"),
    };
    for note in notes {
        for sub in &subs {
            match pusher.send(sub, note).await {
                Ok(Delivery::Sent) => tracing::info!("pushed: {}", note.body),
                Ok(Delivery::Gone) => {
                    let _ = state.world.lock().unwrap().db.delete_push_sub(&sub.endpoint);
                }
                Err(e) => tracing::warn!("push failed: {e:#}"),
            }
        }
    }
}

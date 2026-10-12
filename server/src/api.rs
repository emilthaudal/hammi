use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::db::{Event, PushSub, Treasure};
use crate::game::{Action, ActionKind, Food, Form, Game, Mood, Stage};
use crate::{gifts, Config, Shared, World};

pub fn router(state: Shared) -> Router {
    Router::new()
        .route("/api/health", get(|| async { "ok" }))
        .route("/api/login", post(login))
        .route("/api/state", get(get_state))
        .route("/api/action", post(action))
        .route("/api/rename", post(rename))
        .route("/api/gift", post(gift))
        .route("/api/treasures", get(treasures))
        .route("/api/push/key", get(push_key))
        .route("/api/push/subscribe", post(subscribe))
        .route("/api/push/unsubscribe", post(unsubscribe))
        .with_state(state)
}

pub struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, self.1).into_response()
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        tracing::error!("{e:#}");
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, "something went wrong".into())
    }
}

fn bad_request(msg: &str) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, msg.into())
}

type ApiResult<T> = Result<T, ApiError>;

/// The logged-in player's name, from the bearer token.
pub struct Player(String);

impl FromRequestParts<Shared> for Player {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &Shared) -> Result<Self, Self::Rejection> {
        let unauthorized = || ApiError(StatusCode::UNAUTHORIZED, "please log in".into());
        let token = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or_else(unauthorized)?;
        let name = state.world.lock().unwrap().db.session_name(token)?;
        name.map(Player).ok_or_else(unauthorized)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetView {
    name: String,
    stage: Stage,
    form: Option<Form>,
    hatches_at: Option<DateTime<Utc>>,
    age_days: f64,
    fullness: u8,
    fun: u8,
    energy: u8,
    poops: u8,
    asleep: bool,
    lights_off: bool,
    mood: Mood,
    server_time: DateTime<Utc>,
    events: Vec<Event>,
    wish: Option<ActionKind>,
    celebration: Option<Celebration>,
    gift_available: bool,
    favourite_food: Option<Food>,
}

#[derive(Serialize)]
struct Celebration {
    kind: &'static str,
    text: String,
}

fn view(w: &World, now: DateTime<Utc>, config: &Config, who: &str) -> ApiResult<PetView> {
    let p = &w.pet;
    let today = now.with_timezone(&config.tz).date_naive();
    Ok(PetView {
        wish: p.wish.map(|w| w.kind),
        favourite_food: p.favourite_food.filter(|_| p.favourite_known),
        celebration: p.celebration(now, config.tz, &config.special_days).map(|(kind, text)| Celebration { kind, text }),
        gift_available: p.stage != Stage::Egg && !w.db.gift_claimed(who, today)?,
        name: p.name.clone(),
        stage: p.stage,
        form: p.form,
        hatches_at: p.hatches_at(),
        age_days: p.hatched_at.map_or(0.0, |h| (now - h).num_seconds().max(0) as f64 / 86_400.0),
        fullness: p.fullness.round() as u8,
        fun: p.fun.round() as u8,
        energy: p.energy.round() as u8,
        poops: p.poops,
        asleep: p.asleep,
        lights_off: p.lights_off,
        mood: p.mood(),
        server_time: now,
        events: w.db.recent_events(30)?,
    })
}

fn clean_name(raw: &str, max: usize) -> ApiResult<String> {
    let name = raw.trim();
    if name.is_empty() || name.chars().count() > max {
        return Err(bad_request(&format!("name must be 1–{max} characters")));
    }
    Ok(name.to_string())
}

#[derive(Deserialize)]
struct LoginReq {
    passcode: String,
    name: String,
}

#[derive(Serialize)]
struct LoginRes {
    token: String,
    name: String,
}

async fn login(State(s): State<Shared>, Json(req): Json<LoginReq>) -> ApiResult<Json<LoginRes>> {
    if req.passcode.trim() != s.config.passcode {
        return Err(ApiError(StatusCode::UNAUTHORIZED, "that's not the passcode".into()));
    }
    let name = clean_name(&req.name, 24)?;
    let token = hex::encode(rand::random::<[u8; 32]>());
    let mut w = s.world.lock().unwrap();
    w.db.create_session(&token, &name)?;
    let now = s.clock.now();
    w.advance(now, &s.config)?;
    if w.pet.find_egg(now) {
        w.db.add_event(now, &name, &format!("{name} found a little egg 🥚"))?;
        w.db.save_world(&w.pet, &w.notify)?;
    }
    Ok(Json(LoginRes { token, name }))
}

async fn get_state(State(s): State<Shared>, Player(who): Player) -> ApiResult<Json<PetView>> {
    let mut w = s.world.lock().unwrap();
    let now = s.clock.now();
    w.advance(now, &s.config)?;
    Ok(Json(view(&w, now, &s.config, &who)?))
}

#[derive(Deserialize)]
struct ActionReq {
    #[serde(rename = "type")]
    kind: ActionKind,
    #[serde(default)]
    won: u8,
    #[serde(default)]
    game: Game,
    food: Option<Food>,
}

#[derive(Serialize)]
struct ActionRes {
    state: PetView,
    reaction: &'static str,
}

async fn action(State(s): State<Shared>, Player(who): Player, Json(req): Json<ActionReq>) -> ApiResult<Json<ActionRes>> {
    let mut w = s.world.lock().unwrap();
    let now = s.clock.now();
    w.advance(now, &s.config)?;
    if let Some(food) = req.food {
        let fits = match req.kind {
            ActionKind::Meal => food.is_meal(),
            ActionKind::Snack => !food.is_meal(),
            _ => false,
        };
        if !fits {
            return Err(bad_request("that food doesn't go with that action"));
        }
    }
    if matches!(req.kind, ActionKind::Meal | ActionKind::Snack) {
        w.pet.ensure_favourite(rand::random::<f64>());
    }
    let action = Action { kind: req.kind, won: req.won, game: req.game, food: req.food };
    let outcome = w.pet.act(action, rand::random_range(60..=120), now);
    if let Some(log) = &outcome.log {
        w.db.add_or_merge_event(now, &who, &format!("{who} {log}"), chrono::Duration::minutes(30))?;
    }
    if let Some(discovery) = &outcome.discovery {
        w.db.add_event(now, &who, &format!("{who} {discovery}"))?;
    }
    w.db.save_world(&w.pet, &w.notify)?;
    Ok(Json(ActionRes { state: view(&w, now, &s.config, &who)?, reaction: outcome.reaction }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GiftRes {
    item: &'static str,
    is_new: bool,
    state: PetView,
}

async fn gift(State(s): State<Shared>, Player(who): Player) -> ApiResult<Json<GiftRes>> {
    let mut w = s.world.lock().unwrap();
    let now = s.clock.now();
    w.advance(now, &s.config)?;
    if w.pet.stage == Stage::Egg {
        return Err(ApiError(StatusCode::CONFLICT, "Hammi hasn't hatched yet".into()));
    }
    let today = now.with_timezone(&s.config.tz).date_naive();
    let found: Vec<String> = w.db.treasures()?.into_iter().map(|t| t.item).collect();
    let item = gifts::pick(&found, &mut || rand::random::<f64>());
    let Some(is_new) = w.db.claim_gift(&who, today, item, now)? else {
        return Err(ApiError(StatusCode::CONFLICT, "already opened today's gift".into()));
    };
    let name = w.pet.name.clone();
    w.db.add_event(now, &who, &format!("{name} found {} for {who}", gifts::pretty_name(item)))?;
    Ok(Json(GiftRes { item, is_new, state: view(&w, now, &s.config, &who)? }))
}

#[derive(Serialize)]
struct TreasuresRes {
    items: Vec<Treasure>,
}

async fn treasures(State(s): State<Shared>, _: Player) -> ApiResult<Json<TreasuresRes>> {
    Ok(Json(TreasuresRes { items: s.world.lock().unwrap().db.treasures()? }))
}

#[derive(Deserialize)]
struct RenameReq {
    name: String,
}

async fn rename(State(s): State<Shared>, Player(who): Player, Json(req): Json<RenameReq>) -> ApiResult<Json<PetView>> {
    let name = clean_name(&req.name, 16)?;
    let mut w = s.world.lock().unwrap();
    let now = s.clock.now();
    w.advance(now, &s.config)?;
    let old = std::mem::replace(&mut w.pet.name, name.clone());
    w.db.add_event(now, &who, &format!("{who} renamed {old} to {name}"))?;
    w.db.save_world(&w.pet, &w.notify)?;
    Ok(Json(view(&w, now, &s.config, &who)?))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PushKey {
    public_key: String,
}

async fn push_key(State(s): State<Shared>) -> ApiResult<Json<PushKey>> {
    let pusher = s.pusher.as_ref().ok_or(ApiError(StatusCode::NOT_FOUND, "push is not configured".into()))?;
    Ok(Json(PushKey { public_key: pusher.public_key.clone() }))
}

#[derive(Deserialize)]
struct SubscribeReq {
    endpoint: String,
    keys: SubscribeKeys,
}

#[derive(Deserialize)]
struct SubscribeKeys {
    p256dh: String,
    auth: String,
}

async fn subscribe(State(s): State<Shared>, _: Player, Json(req): Json<SubscribeReq>) -> ApiResult<StatusCode> {
    if !req.endpoint.starts_with("https://") {
        return Err(bad_request("endpoint must be https"));
    }
    let sub = PushSub { endpoint: req.endpoint, p256dh: req.keys.p256dh, auth: req.keys.auth };
    s.world.lock().unwrap().db.upsert_push_sub(&sub)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct UnsubscribeReq {
    endpoint: String,
}

async fn unsubscribe(State(s): State<Shared>, _: Player, Json(req): Json<UnsubscribeReq>) -> ApiResult<StatusCode> {
    s.world.lock().unwrap().db.delete_push_sub(&req.endpoint)?;
    Ok(StatusCode::NO_CONTENT)
}

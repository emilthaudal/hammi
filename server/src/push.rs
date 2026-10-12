//! Web Push delivery over VAPID. Builds encrypted requests with the web-push crate and sends them with reqwest.

use anyhow::{Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use web_push::{
    request_builder, ContentEncoding, PartialVapidSignatureBuilder, SubscriptionInfo, VapidSignatureBuilder,
    WebPushMessageBuilder,
};

use crate::db::PushSub;
use crate::notify::Note;

pub struct Pusher {
    private_key: String,
    pub public_key: String,
    subject: String,
    http: reqwest::Client,
}

pub enum Delivery {
    Sent,
    /// The browser dropped the subscription; delete it.
    Gone,
}

impl Pusher {
    pub fn new(private_key: String, public_key: String, subject: String) -> Result<Self> {
        VapidSignatureBuilder::from_base64_no_sub(&private_key).context("VAPID_PRIVATE_KEY is not a valid key")?;
        Ok(Pusher { private_key, public_key, subject, http: reqwest::Client::new() })
    }

    pub async fn send(&self, sub: &PushSub, note: &Note) -> Result<Delivery> {
        let info = SubscriptionInfo::new(sub.endpoint.as_str(), sub.p256dh.as_str(), sub.auth.as_str());
        let mut sig = VapidSignatureBuilder::from_base64(&self.private_key, &info)?;
        sig.add_claim("sub", self.subject.as_str());
        let payload = serde_json::to_vec(note)?;

        let mut msg = WebPushMessageBuilder::new(&info);
        msg.set_payload(ContentEncoding::Aes128Gcm, &payload);
        msg.set_vapid_signature(sig.build()?);
        msg.set_ttl(12 * 3600);
        let req: http::Request<Vec<u8>> = request_builder::build_request(msg.build()?);

        let mut out = self.http.post(req.uri().to_string()).body(req.body().clone());
        for (k, v) in req.headers() {
            out = out.header(k.as_str(), v.as_bytes());
        }
        let res = out.send().await?;
        match res.status().as_u16() {
            200..=299 => Ok(Delivery::Sent),
            404 | 410 => Ok(Delivery::Gone),
            code => anyhow::bail!("push service returned {code}: {}", res.text().await.unwrap_or_default()),
        }
    }
}

/// Print a fresh VAPID key pair for the env vars.
pub fn gen_vapid() -> Result<()> {
    let private = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
    let public: PartialVapidSignatureBuilder = VapidSignatureBuilder::from_base64_no_sub(&private)?;
    println!("VAPID_PRIVATE_KEY={private}");
    println!("VAPID_PUBLIC_KEY={}", URL_SAFE_NO_PAD.encode(public.get_public_key()));
    Ok(())
}

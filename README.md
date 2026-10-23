# hammi

*Hammi* is a Tamagotchi-inspired pet hamster you keep on your phone. It hatches from an egg, grows up over four days, and gets hungry, bored and sleepy in real time, even when the app is closed. Everyone in the household shares the same Hammi.

It's a gentle game: if Hammi is neglected it only gets sad, and it cheers up as soon as someone looks after it again.

Game rules, API and configuration are in [docs/DESIGN.md](docs/DESIGN.md).

## Run locally

```sh
# terminal 1: the server, with time running 60x faster
cd server
HAMMI_PASSCODE=hammi HAMMI_SPEED=60 cargo run

# terminal 2: the web app with hot reload, proxying /api to :8080
cd web
bun install
bun run dev
```

Log in with passcode `hammi` and any name.

Push notifications need VAPID keys: run `cargo run -- gen-vapid` in `server/` and export the two printed variables before starting the server. Browsers only allow push on `localhost` or HTTPS.

## Deploy (Railway)

One service built from the root `Dockerfile`:

1. Add a volume mounted at `/data` (the SQLite database lives there).
2. Set `HAMMI_PASSCODE`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` and `VAPID_SUBJECT` (`mailto:you@example.com`).
3. Generate a domain and open it on your phone, then use **Add to Home Screen** (iOS needs this for notifications).

Keep it to one replica; the server holds the game in memory.

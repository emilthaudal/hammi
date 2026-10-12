import { api, ApiError } from "./api";

export type PushStatus = "unsupported" | "needs-install" | "unconfigured" | "denied" | "off" | "on";

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function serverKey(): Promise<string | null> {
  try {
    const { publicKey } = await api.pushKey();
    return publicKey || null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

async function registration() {
  return (await navigator.serviceWorker?.getRegistration()) ?? null;
}

export async function pushStatus(): Promise<PushStatus> {
  if (isIos() && !isStandalone()) return "needs-install";
  if (!supported()) return "unsupported";
  if (!(await serverKey())) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  const sub = await (await registration())?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function enablePush(token: string): Promise<PushStatus> {
  const key = await serverKey();
  if (!key) return "unconfigured";
  const reg = await registration();
  if (!reg) throw new Error("Notifications only work in the installed app.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  await api.subscribe(token, sub.toJSON());
  return "on";
}

export async function disablePush(token: string): Promise<PushStatus> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await api.unsubscribe(token, sub.endpoint).catch(() => undefined);
    await sub.unsubscribe();
  }
  return "off";
}

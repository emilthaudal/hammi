export type Stage = "egg" | "baby" | "kid" | "adult";
export type Form = "chonky" | "zoomy" | "fluffy" | "snuggly";
export type Mood = "happy" | "okay" | "sad";

export type PetEvent = { at: string; who: string; text: string };

export type PetView = {
  name: string;
  stage: Stage;
  form: Form | null;
  hatchesAt: string | null;
  ageDays: number;
  fullness: number;
  fun: number;
  energy: number;
  poops: number;
  asleep: boolean;
  lightsOff: boolean;
  mood: Mood;
  serverTime: string;
  events: PetEvent[];
};

export type ActionType = "meal" | "snack" | "play" | "clean" | "pet" | "lights";

export type Reaction =
  | "yum"
  | "full"
  | "happy"
  | "clean"
  | "nothing"
  | "love"
  | "lights_on"
  | "lights_off"
  | "asleep"
  | "egg";

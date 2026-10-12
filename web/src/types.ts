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
  wish: Wish | null;
  celebration: Celebration | null;
  giftAvailable: boolean;
  favouriteFood: FoodId | null;
};

export type FoodId = "seeds" | "carrot" | "corn" | "sunflower" | "strawberry" | "peanut";
export type Wish = "meal" | "snack" | "play" | "clean" | "pet";
export type Celebration = { kind: "birthday" | "special"; text: string };

export type ActionType = "meal" | "snack" | "play" | "clean" | "pet" | "lights";
export type GameId = "leftright" | "catch" | "jump";

export type TreasureId =
  | "acorn"
  | "sunflower"
  | "pebble"
  | "clover"
  | "feather"
  | "button"
  | "shell"
  | "ribbon"
  | "star"
  | "key"
  | "berry"
  | "leaf"
  | "marble"
  | "bell"
  | "heartstone"
  | "crown";

export type FoundTreasure = { item: TreasureId; count: number; firstFoundBy: string; firstFoundAt: string };
export type GiftResult = { item: TreasureId; isNew: boolean; state: PetView };

export type Reaction =
  | "delighted"
  | "favourite"
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

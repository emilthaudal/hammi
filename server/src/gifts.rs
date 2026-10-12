//! The daily gift: which treasure Hammi finds.

pub const TREASURES: [&str; 16] = [
    "acorn", "sunflower", "pebble", "clover", "feather", "button", "shell", "ribbon", "star", "key", "berry", "leaf",
    "marble", "bell", "heartstone", "crown",
];
const RARE: &str = "crown";
const RARE_CHANCE: f64 = 0.02;
const FAVOUR_UNFOUND: f64 = 0.7;

pub fn pretty_name(item: &str) -> &'static str {
    match item {
        "acorn" => "an acorn",
        "sunflower" => "a sunflower",
        "pebble" => "a shiny pebble",
        "clover" => "a four-leaf clover",
        "feather" => "a soft feather",
        "button" => "a little button",
        "shell" => "a seashell",
        "ribbon" => "a ribbon",
        "star" => "a tiny star",
        "key" => "a tiny key",
        "berry" => "a berry",
        "leaf" => "an autumn leaf",
        "marble" => "a marble",
        "bell" => "a little bell",
        "heartstone" => "a heart-shaped stone",
        "crown" => "a golden crown",
        _ => "something",
    }
}

/// Pick a treasure. `roll` yields uniform numbers in [0, 1).
pub fn pick(found: &[String], roll: &mut dyn FnMut() -> f64) -> &'static str {
    if roll() < RARE_CHANCE {
        return RARE;
    }
    let common: Vec<&'static str> = TREASURES.iter().copied().filter(|t| *t != RARE).collect();
    let unfound: Vec<&'static str> = common.iter().copied().filter(|t| !found.iter().any(|f| f == t)).collect();
    let pool = if !unfound.is_empty() && roll() < FAVOUR_UNFOUND { &unfound } else { &common };
    let i = (roll() * pool.len() as f64) as usize;
    pool[i.min(pool.len() - 1)]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crown_is_rare_and_unfound_items_are_favoured() {
        assert_eq!(pick(&[], &mut || 0.0), "crown");

        let found: Vec<String> = TREASURES.iter().filter(|t| **t != "marble").map(|t| t.to_string()).collect();
        let mut rolls = [0.5, 0.1, 0.9].into_iter();
        assert_eq!(pick(&found, &mut || rolls.next().unwrap()), "marble");
    }
}

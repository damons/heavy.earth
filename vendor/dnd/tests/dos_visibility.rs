use dnd_rs::{
    rng::Rng,
    visibility::{View, recognizes},
};
use serde_json::Value;
#[test]
fn clipping_matches_original_wall_and_room_masks() {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/dos-visibility.json")).unwrap();
    let rooms = |v: &Value| {
        let a: [[u8; 4]; 4] = serde_json::from_value(v.clone()).unwrap();
        a.map(|row| row.map(|x| x != 0))
    };
    for c in fixture["geometry"].as_array().unwrap() {
        let mut view = View {
            west: serde_json::from_value(c["west"].clone()).unwrap(),
            north: serde_json::from_value(c["north"].clone()).unwrap(),
            rooms: rooms(&c["rooms"]),
        };
        view.clip();
        let e = &c["expected"];
        assert_eq!(
            view,
            View {
                west: serde_json::from_value(e["west"].clone()).unwrap(),
                north: serde_json::from_value(e["north"].clone()).unwrap(),
                rooms: rooms(&e["rooms"])
            },
            "{c}"
        );
    }
}
#[test]
fn light_recognition_matches_original_thresholds_and_draws() {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/dos-visibility.json")).unwrap();
    for c in fixture["lighting"].as_array().unwrap() {
        let mut rng = Rng::new(c["seed"].as_u64().unwrap());
        assert_eq!(
            recognizes(
                c["light"].as_i64().unwrap() as i32,
                c["continual"].as_bool().unwrap(),
                c["center"].as_bool().unwrap(),
                &mut rng
            ),
            c["recognized"].as_bool().unwrap(),
            "{c}"
        );
        assert_eq!(rng.state(), c["state"].as_u64().unwrap());
    }
}

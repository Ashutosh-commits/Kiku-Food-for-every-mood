from app.matching import match_dishes, similarity


def test_normalized_dish_matches_variants():
    matches = match_dishes(
        {"Chicken Biryani (Serves 1)": 249},
        {"Chicken Biryani - Single": 239},
        threshold=0.78,
    )
    assert matches


def test_unrelated_dishes_do_not_match():
    matches = match_dishes({"Chicken Biryani": 249}, {"Paneer Tikka": 199})
    assert matches == []


def test_similarity_exact_is_one():
    assert similarity("Butter Chicken", "Butter Chicken") == 1.0


def test_dish_matching_is_one_to_one():
    matches = match_dishes(
        {"Chicken Biryani Small": 249, "Chicken Biryani Large": 399},
        {"Chicken Biryani": 299},
        threshold=0.55,
    )
    assert len(matches) == 1

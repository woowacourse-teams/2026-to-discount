from check_brands import _known_brand_names, unknown_brands


def test_unknown_brands_flags_names_not_in_known_set():
    records = [{"brand": "BBQ"}, {"brand": "BBQ치킨오타"}]
    known = {"BBQ", "bhc"}
    assert unknown_brands(records, known) == ["BBQ치킨오타"]


def test_unknown_brands_empty_when_all_known():
    records = [{"brand": "BBQ"}, {"brand": "bhc"}]
    known = {"BBQ", "bhc"}
    assert unknown_brands(records, known) == []


def test_known_brand_names_flattens_aliases(tmp_path):
    yml = tmp_path / "brands.yml"
    yml.write_text(
        "brands:\n"
        "  BBQ:\n"
        "    aliases: [BBQ, BBQ치킨]\n"
        "  bhc:\n"
        "    aliases: [bhc, BHC]\n",
        encoding="utf-8",
    )
    assert _known_brand_names(yml) == {"BBQ", "BBQ치킨", "bhc", "BHC"}

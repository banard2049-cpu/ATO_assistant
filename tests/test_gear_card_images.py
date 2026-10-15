import unittest

from tools.generate_gear_card_images import gear_face_url


class GearCardFaceTest(unittest.TestCase):
    def deck(self, sheet):
        return {"FaceURL": f"https://example.test/{sheet}/",
                "BackURL": "https://example.test/playable/", "UniqueBack": True}

    def test_secret_cover_sheets_use_playable_reverse(self):
        for sheet, position in [
            ("0108AC862A7C0C3D5939C0AD9EE0399E70DF6F1F", 8),
            ("5B7BB5989D143164EC958EB6C5C8DAC585996370", 14),
        ]:
            deck = self.deck(sheet)
            self.assertEqual(gear_face_url(deck, 13700 + position), deck["BackURL"])

    def test_double_sided_gear_retains_first_side(self):
        deck = self.deck("0108AC862A7C0C3D5939C0AD9EE0399E70DF6F1F")
        for position in [14, 20, 26, 28]:
            self.assertEqual(gear_face_url(deck, 13700 + position), deck["FaceURL"])

    def test_other_secret_sheets_retain_face(self):
        deck = self.deck("1EAC8CCAE63B886559FFF9BE478B78E6DB397232")
        self.assertEqual(gear_face_url(deck, 8202), deck["FaceURL"])

    def test_missing_reverse_does_not_fall_back_to_cover(self):
        deck = self.deck("5B7BB5989D143164EC958EB6C5C8DAC585996370")
        del deck["BackURL"]
        self.assertEqual(gear_face_url(deck, 13702), "")
        deck["BackURL"] = "generic-back"
        deck["UniqueBack"] = False
        self.assertEqual(gear_face_url(deck, 13702), "")


if __name__ == "__main__":
    unittest.main()

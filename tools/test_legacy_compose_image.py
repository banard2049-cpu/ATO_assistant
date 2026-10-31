"""Regression for docker-compose v1's single-pass image interpolation."""
import re
import unittest
from pathlib import Path


COMPOSE = Path(__file__).resolve().parent / "packaging/docker/compose.legacy.yaml"


def interpolate_v1(value, env):
    # docker-compose 1.29.2 TemplateWithDefaults stops at the first `}` and
    # substitutes once. Nested defaults therefore produce an invalid image.
    pattern = re.compile(r"\$\{(?P<var>[_a-z][_a-z0-9]*):-(?P<default>[^}]*)\}", re.I)
    return pattern.sub(lambda match: env.get(match['var']) or match['default'], value)


class LegacyComposeImageTest(unittest.TestCase):
    def test_default_and_override_are_valid_v1_images(self):
        config = COMPOSE.read_text(encoding="utf-8")
        image = re.search(r"^\s*image:\s*(\S+)\s*$", config, re.M).group(1)
        default = "ghcr.io/banard2049-cpu/ato_assistant:latest"
        custom = "ghcr.io/banard2049-cpu/ato_assistant:3.9.2"
        for env, expected in (({}, default), ({"ATO_IMAGE": ""}, default),
                              ({"ATO_IMAGE": custom}, custom)):
            with self.subTest(env=env):
                self.assertEqual(interpolate_v1(image, env), expected)


if __name__ == "__main__":
    unittest.main()

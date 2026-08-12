function buildStoryDoomCycle({ storyCards, doomCards, inwardOdyssey, doomAIsBack = false }) {
  const makeSteps = (cards, aImageKey, bImageKey) => cards.flatMap((card, index) => ([
    {
      id: `${card.id}-a`,
      label: `${index + 1}A`,
      name: card.name,
      cardId: card.cardId,
      side: "A",
      image: card[aImageKey],
      physicalCardId: card.id,
    },
    {
      id: `${card.id}-b`,
      label: `${index + 1}B`,
      name: card.name,
      cardId: card.cardId,
      side: "B",
      image: card[bImageKey],
      physicalCardId: card.id,
    },
  ]));

  return {
    storyCards: [...storyCards, inwardOdyssey],
    doomCards,
    inwardOdyssey,
    storySteps: makeSteps(storyCards, "face", "back"),
    doomSteps: makeSteps(
      doomCards,
      doomAIsBack ? "back" : "face",
      doomAIsBack ? "face" : "back",
    ),
  };
}

window.ATO_STORY_DOOM_DATA = {
  "generatedFrom": "archived source: Aeon Trespass Odyssey.json",
  "note": "StoryCard and DoomCard decks extracted from TTS mod. storySteps/doomSteps follow the printed A/B sides; source FaceURL and BackURL are not assumed to match that order. Inward Odyssey is tracked as Argo knowledge, not a displayed card.",
  "cycles": {
    "c1": {
      "storyCards": [
        {
          "id": "a4f59f",
          "name": "The Absent Rule",
          "cardId": 11100,
          "face": "./assets/story-doom-cards/c1-story-11100-the-absent-rule-front.jpg",
          "back": "./assets/story-doom-cards/c1-story-11100-the-absent-rule-back.jpg"
        },
        {
          "id": "c73af1",
          "name": "A Fateful Randezvous",
          "cardId": 11200,
          "face": "./assets/story-doom-cards/c1-story-11200-a-fateful-randezvous-front.jpg",
          "back": "./assets/story-doom-cards/c1-story-11200-a-fateful-randezvous-back.jpg"
        },
        {
          "id": "71b4b9",
          "name": "A Phantom Thread",
          "cardId": 11000,
          "face": "./assets/story-doom-cards/c1-story-11000-a-phantom-thread-front.jpg",
          "back": "./assets/story-doom-cards/c1-story-11000-a-phantom-thread-back.jpg"
        },
        {
          "id": "e45d47",
          "name": "Unappealable Egress",
          "cardId": 11300,
          "face": "./assets/story-doom-cards/c1-story-11300-unappealable-egress-front.jpg",
          "back": "./assets/story-doom-cards/c1-story-11300-unappealable-egress-back.jpg"
        },
        {
          "id": "0d44f7",
          "name": "Inward Odyssey",
          "cardId": 11400,
          "face": "./assets/story-doom-cards/c1-story-11400-inward-odyssey-front.jpg",
          "back": "./assets/story-doom-cards/c1-story-11400-inward-odyssey-back.jpg"
        }
      ],
      "doomCards": [
        {
          "id": "865507",
          "name": "Shape Of Things To Come",
          "cardId": 10700,
          "face": "./assets/story-doom-cards/c1-doom-10700-shape-of-things-to-come-front.jpg",
          "back": "./assets/story-doom-cards/c1-doom-10700-shape-of-things-to-come-back.jpg"
        },
        {
          "id": "af1090",
          "name": "Invisible Weights",
          "cardId": 10800,
          "face": "./assets/story-doom-cards/c1-doom-10800-invisible-weights-front.jpg",
          "back": "./assets/story-doom-cards/c1-doom-10800-invisible-weights-back.jpg"
        },
        {
          "id": "21a7b7",
          "name": "No Way Out",
          "cardId": 10900,
          "face": "./assets/story-doom-cards/c1-doom-10900-no-way-out-front.jpg",
          "back": "./assets/story-doom-cards/c1-doom-10900-no-way-out-back.jpg"
        }
      ],
      "inwardOdyssey": {
        "id": "0d44f7",
        "name": "Inward Odyssey",
        "cardId": 11400,
        "face": "./assets/story-doom-cards/c1-story-11400-inward-odyssey-front.jpg",
        "back": "./assets/story-doom-cards/c1-story-11400-inward-odyssey-back.jpg"
      },
      "storySteps": [
        {
          "id": "a4f59f-a",
          "label": "1A",
          "name": "The Absent Rule",
          "cardId": 11100,
          "side": "A",
          "image": "./assets/story-doom-cards/c1-story-11100-the-absent-rule-front.jpg",
          "physicalCardId": "a4f59f"
        },
        {
          "id": "a4f59f-b",
          "label": "1B",
          "name": "The Absent Rule",
          "cardId": 11100,
          "side": "B",
          "image": "./assets/story-doom-cards/c1-story-11100-the-absent-rule-back.jpg",
          "physicalCardId": "a4f59f"
        },
        {
          "id": "c73af1-a",
          "label": "2A",
          "name": "A Fateful Randezvous",
          "cardId": 11200,
          "side": "A",
          "image": "./assets/story-doom-cards/c1-story-11200-a-fateful-randezvous-front.jpg",
          "physicalCardId": "c73af1"
        },
        {
          "id": "c73af1-b",
          "label": "2B",
          "name": "A Fateful Randezvous",
          "cardId": 11200,
          "side": "B",
          "image": "./assets/story-doom-cards/c1-story-11200-a-fateful-randezvous-back.jpg",
          "physicalCardId": "c73af1"
        },
        {
          "id": "71b4b9-a",
          "label": "3A",
          "name": "A Phantom Thread",
          "cardId": 11000,
          "side": "A",
          "image": "./assets/story-doom-cards/c1-story-11000-a-phantom-thread-front.jpg",
          "physicalCardId": "71b4b9"
        },
        {
          "id": "71b4b9-b",
          "label": "3B",
          "name": "A Phantom Thread",
          "cardId": 11000,
          "side": "B",
          "image": "./assets/story-doom-cards/c1-story-11000-a-phantom-thread-back.jpg",
          "physicalCardId": "71b4b9"
        },
        {
          "id": "e45d47-a",
          "label": "4A",
          "name": "Unappealable Egress",
          "cardId": 11300,
          "side": "A",
          "image": "./assets/story-doom-cards/c1-story-11300-unappealable-egress-front.jpg",
          "physicalCardId": "e45d47"
        },
        {
          "id": "e45d47-b",
          "label": "4B",
          "name": "Unappealable Egress",
          "cardId": 11300,
          "side": "B",
          "image": "./assets/story-doom-cards/c1-story-11300-unappealable-egress-back.jpg",
          "physicalCardId": "e45d47"
        }
      ],
      "doomSteps": [
        {
          "id": "865507-a",
          "label": "1A",
          "name": "Shape Of Things To Come",
          "cardId": 10700,
          "side": "A",
          "image": "./assets/story-doom-cards/c1-doom-10700-shape-of-things-to-come-front.jpg",
          "physicalCardId": "865507"
        },
        {
          "id": "865507-b",
          "label": "1B",
          "name": "Shape Of Things To Come",
          "cardId": 10700,
          "side": "B",
          "image": "./assets/story-doom-cards/c1-doom-10700-shape-of-things-to-come-back.jpg",
          "physicalCardId": "865507"
        },
        {
          "id": "af1090-a",
          "label": "2A",
          "name": "Invisible Weights",
          "cardId": 10800,
          "side": "A",
          "image": "./assets/story-doom-cards/c1-doom-10800-invisible-weights-front.jpg",
          "physicalCardId": "af1090"
        },
        {
          "id": "af1090-b",
          "label": "2B",
          "name": "Invisible Weights",
          "cardId": 10800,
          "side": "B",
          "image": "./assets/story-doom-cards/c1-doom-10800-invisible-weights-back.jpg",
          "physicalCardId": "af1090"
        },
        {
          "id": "21a7b7-a",
          "label": "3A",
          "name": "No Way Out",
          "cardId": 10900,
          "side": "A",
          "image": "./assets/story-doom-cards/c1-doom-10900-no-way-out-front.jpg",
          "physicalCardId": "21a7b7"
        },
        {
          "id": "21a7b7-b",
          "label": "3B",
          "name": "No Way Out",
          "cardId": 10900,
          "side": "B",
          "image": "./assets/story-doom-cards/c1-doom-10900-no-way-out-back.jpg",
          "physicalCardId": "21a7b7"
        }
      ]
    },
    "c2": {
      "storyCards": [
        {
          "id": "639ec8",
          "name": "A Nietzschean Welcome",
          "cardId": 14700,
          "face": "./assets/story-doom-cards/c2-story-14700-a-nietzschean-welcome-front.jpg",
          "back": "./assets/story-doom-cards/c2-story-14700-a-nietzschean-welcome-back.jpg"
        },
        {
          "id": "b8daed",
          "name": "To Win The War",
          "cardId": 14800,
          "face": "./assets/story-doom-cards/c2-story-14800-to-win-the-war-front.jpg",
          "back": "./assets/story-doom-cards/c2-story-14800-to-win-the-war-back.jpg"
        },
        {
          "id": "8b7565",
          "name": "Argophylae",
          "cardId": 15000,
          "face": "./assets/story-doom-cards/c2-story-15000-argophylae-front.jpg",
          "back": "./assets/story-doom-cards/c2-story-15000-argophylae-back.jpg"
        },
        {
          "id": "febd27",
          "name": "Stand Together",
          "cardId": 14900,
          "face": "./assets/story-doom-cards/c2-story-14900-stand-together-front.jpg",
          "back": "./assets/story-doom-cards/c2-story-14900-stand-together-back.jpg"
        },
        {
          "id": "9a0421",
          "name": "Inward Odyssey",
          "cardId": 15200,
          "face": "./assets/story-doom-cards/c2-story-15200-inward-odyssey-front.jpg",
          "back": "./assets/story-doom-cards/c2-story-15200-inward-odyssey-back.jpg"
        }
      ],
      "doomCards": [
        {
          "id": "729eef",
          "name": "Spartan Olympics",
          "cardId": 14400,
          "face": "./assets/story-doom-cards/c2-doom-14400-spartan-olympics-front.jpg",
          "back": "./assets/story-doom-cards/c2-doom-14400-spartan-olympics-back.jpg"
        },
        {
          "id": "ccc677",
          "name": "Ill Fate Marshaling",
          "cardId": 14500,
          "face": "./assets/story-doom-cards/c2-doom-14500-ill-fate-marshaling-front.jpg",
          "back": "./assets/story-doom-cards/c2-doom-14500-ill-fate-marshaling-back.jpg"
        },
        {
          "id": "e33502",
          "name": "Wolf Among You",
          "cardId": 14600,
          "face": "./assets/story-doom-cards/c2-doom-14600-wolf-among-you-front.jpg",
          "back": "./assets/story-doom-cards/c2-doom-14600-wolf-among-you-back.jpg"
        }
      ],
      "inwardOdyssey": {
        "id": "9a0421",
        "name": "Inward Odyssey",
        "cardId": 15200,
        "face": "./assets/story-doom-cards/c2-story-15200-inward-odyssey-front.jpg",
        "back": "./assets/story-doom-cards/c2-story-15200-inward-odyssey-back.jpg"
      },
      "storySteps": [
        {
          "id": "639ec8-a",
          "label": "1A",
          "name": "A Nietzschean Welcome",
          "cardId": 14700,
          "side": "A",
          "image": "./assets/story-doom-cards/c2-story-14700-a-nietzschean-welcome-front.jpg",
          "physicalCardId": "639ec8"
        },
        {
          "id": "639ec8-b",
          "label": "1B",
          "name": "A Nietzschean Welcome",
          "cardId": 14700,
          "side": "B",
          "image": "./assets/story-doom-cards/c2-story-14700-a-nietzschean-welcome-back.jpg",
          "physicalCardId": "639ec8"
        },
        {
          "id": "b8daed-a",
          "label": "2A",
          "name": "To Win The War",
          "cardId": 14800,
          "side": "A",
          "image": "./assets/story-doom-cards/c2-story-14800-to-win-the-war-front.jpg",
          "physicalCardId": "b8daed"
        },
        {
          "id": "b8daed-b",
          "label": "2B",
          "name": "To Win The War",
          "cardId": 14800,
          "side": "B",
          "image": "./assets/story-doom-cards/c2-story-14800-to-win-the-war-back.jpg",
          "physicalCardId": "b8daed"
        },
        {
          "id": "8b7565-a",
          "label": "3A",
          "name": "Argophylae",
          "cardId": 15000,
          "side": "A",
          "image": "./assets/story-doom-cards/c2-story-15000-argophylae-front.jpg",
          "physicalCardId": "8b7565"
        },
        {
          "id": "8b7565-b",
          "label": "3B",
          "name": "Argophylae",
          "cardId": 15000,
          "side": "B",
          "image": "./assets/story-doom-cards/c2-story-15000-argophylae-back.jpg",
          "physicalCardId": "8b7565"
        },
        {
          "id": "febd27-a",
          "label": "4A",
          "name": "Stand Together",
          "cardId": 14900,
          "side": "A",
          "image": "./assets/story-doom-cards/c2-story-14900-stand-together-front.jpg",
          "physicalCardId": "febd27"
        },
        {
          "id": "febd27-b",
          "label": "4B",
          "name": "Stand Together",
          "cardId": 14900,
          "side": "B",
          "image": "./assets/story-doom-cards/c2-story-14900-stand-together-back.jpg",
          "physicalCardId": "febd27"
        }
      ],
      "doomSteps": [
        {
          "id": "729eef-a",
          "label": "1A",
          "name": "Spartan Olympics",
          "cardId": 14400,
          "side": "A",
          "image": "./assets/story-doom-cards/c2-doom-14400-spartan-olympics-front.jpg",
          "physicalCardId": "729eef"
        },
        {
          "id": "729eef-b",
          "label": "1B",
          "name": "Spartan Olympics",
          "cardId": 14400,
          "side": "B",
          "image": "./assets/story-doom-cards/c2-doom-14400-spartan-olympics-back.jpg",
          "physicalCardId": "729eef"
        },
        {
          "id": "ccc677-a",
          "label": "2A",
          "name": "Ill Fate Marshaling",
          "cardId": 14500,
          "side": "A",
          "image": "./assets/story-doom-cards/c2-doom-14500-ill-fate-marshaling-front.jpg",
          "physicalCardId": "ccc677"
        },
        {
          "id": "ccc677-b",
          "label": "2B",
          "name": "Ill Fate Marshaling",
          "cardId": 14500,
          "side": "B",
          "image": "./assets/story-doom-cards/c2-doom-14500-ill-fate-marshaling-back.jpg",
          "physicalCardId": "ccc677"
        },
        {
          "id": "e33502-a",
          "label": "3A",
          "name": "Wolf Among You",
          "cardId": 14600,
          "side": "A",
          "image": "./assets/story-doom-cards/c2-doom-14600-wolf-among-you-front.jpg",
          "physicalCardId": "e33502"
        },
        {
          "id": "e33502-b",
          "label": "3B",
          "name": "Wolf Among You",
          "cardId": 14600,
          "side": "B",
          "image": "./assets/story-doom-cards/c2-doom-14600-wolf-among-you-back.jpg",
          "physicalCardId": "e33502"
        }
      ]
    },
    "c3": {
      "storyCards": [
        {
          "id": "99ff0b",
          "name": "Icarus's Plea",
          "cardId": 13900,
          "face": "./assets/story-doom-cards/c3-story-13900-icarus-s-plea-front.png",
          "back": "./assets/story-doom-cards/c3-story-13900-icarus-s-plea-back.png"
        },
        {
          "id": "fbdec5",
          "name": "To Those Long Dead",
          "cardId": 14000,
          "face": "./assets/story-doom-cards/c3-story-14000-to-those-long-dead-front.png",
          "back": "./assets/story-doom-cards/c3-story-14000-to-those-long-dead-back.png"
        },
        {
          "id": "2c9dbe",
          "name": "Box of Black",
          "cardId": 14100,
          "face": "./assets/story-doom-cards/c3-story-14100-box-of-black-front.png",
          "back": "./assets/story-doom-cards/c3-story-14100-box-of-black-back.png"
        },
        {
          "id": "7df11b",
          "name": "Trespassing",
          "cardId": 14200,
          "face": "./assets/story-doom-cards/c3-story-14200-trespassing-front.png",
          "back": "./assets/story-doom-cards/c3-story-14200-trespassing-back.png"
        },
        {
          "id": "c2fa42",
          "name": "Inward Odyssey: Pitiless of the Sun",
          "cardId": 14300,
          "face": "./assets/story-doom-cards/c3-story-14300-inward-odyssey-pitiless-of-the-sun-front.png",
          "back": "./assets/story-doom-cards/c3-story-14300-inward-odyssey-pitiless-of-the-sun-back.png"
        }
      ],
      "doomCards": [
        {
          "id": "527ef0",
          "name": "Vicious Circle",
          "cardId": 13600,
          "face": "./assets/story-doom-cards/c3-doom-13600-vicious-circle-front.png",
          "back": "./assets/story-doom-cards/c3-doom-13600-vicious-circle-back.png"
        },
        {
          "id": "3a2fd5",
          "name": "The Eschaton Dilemma",
          "cardId": 13700,
          "face": "./assets/story-doom-cards/c3-doom-13700-the-eschaton-dilemma-front.png",
          "back": "./assets/story-doom-cards/c3-doom-13700-the-eschaton-dilemma-back.png"
        },
        {
          "id": "802656",
          "name": "Divine Shackles",
          "cardId": 13800,
          "face": "./assets/story-doom-cards/c3-doom-13800-divine-shackles-front.png",
          "back": "./assets/story-doom-cards/c3-doom-13800-divine-shackles-back.png"
        }
      ],
      "inwardOdyssey": {
        "id": "c2fa42",
        "name": "Inward Odyssey: Pitiless of the Sun",
        "cardId": 14300,
        "face": "./assets/story-doom-cards/c3-story-14300-inward-odyssey-pitiless-of-the-sun-front.png",
        "back": "./assets/story-doom-cards/c3-story-14300-inward-odyssey-pitiless-of-the-sun-back.png"
      },
      "storySteps": [
        {
          "id": "99ff0b-a",
          "label": "1A",
          "name": "Icarus's Plea",
          "cardId": 13900,
          "side": "A",
          "image": "./assets/story-doom-cards/c3-story-13900-icarus-s-plea-front.png",
          "physicalCardId": "99ff0b"
        },
        {
          "id": "99ff0b-b",
          "label": "1B",
          "name": "Icarus's Plea",
          "cardId": 13900,
          "side": "B",
          "image": "./assets/story-doom-cards/c3-story-13900-icarus-s-plea-back.png",
          "physicalCardId": "99ff0b"
        },
        {
          "id": "fbdec5-a",
          "label": "2A",
          "name": "To Those Long Dead",
          "cardId": 14000,
          "side": "A",
          "image": "./assets/story-doom-cards/c3-story-14000-to-those-long-dead-front.png",
          "physicalCardId": "fbdec5"
        },
        {
          "id": "fbdec5-b",
          "label": "2B",
          "name": "To Those Long Dead",
          "cardId": 14000,
          "side": "B",
          "image": "./assets/story-doom-cards/c3-story-14000-to-those-long-dead-back.png",
          "physicalCardId": "fbdec5"
        },
        {
          "id": "2c9dbe-a",
          "label": "3A",
          "name": "Box of Black",
          "cardId": 14100,
          "side": "A",
          "image": "./assets/story-doom-cards/c3-story-14100-box-of-black-front.png",
          "physicalCardId": "2c9dbe"
        },
        {
          "id": "2c9dbe-b",
          "label": "3B",
          "name": "Box of Black",
          "cardId": 14100,
          "side": "B",
          "image": "./assets/story-doom-cards/c3-story-14100-box-of-black-back.png",
          "physicalCardId": "2c9dbe"
        },
        {
          "id": "7df11b-a",
          "label": "4A",
          "name": "Trespassing",
          "cardId": 14200,
          "side": "A",
          "image": "./assets/story-doom-cards/c3-story-14200-trespassing-front.png",
          "physicalCardId": "7df11b"
        },
        {
          "id": "7df11b-b",
          "label": "4B",
          "name": "Trespassing",
          "cardId": 14200,
          "side": "B",
          "image": "./assets/story-doom-cards/c3-story-14200-trespassing-back.png",
          "physicalCardId": "7df11b"
        }
      ],
      "doomSteps": [
        {
          "id": "527ef0-a",
          "label": "1A",
          "name": "Vicious Circle",
          "cardId": 13600,
          "side": "A",
          "image": "./assets/story-doom-cards/c3-doom-13600-vicious-circle-front.png",
          "physicalCardId": "527ef0"
        },
        {
          "id": "527ef0-b",
          "label": "1B",
          "name": "Vicious Circle",
          "cardId": 13600,
          "side": "B",
          "image": "./assets/story-doom-cards/c3-doom-13600-vicious-circle-back.png",
          "physicalCardId": "527ef0"
        },
        {
          "id": "3a2fd5-a",
          "label": "2A",
          "name": "The Eschaton Dilemma",
          "cardId": 13700,
          "side": "A",
          "image": "./assets/story-doom-cards/c3-doom-13700-the-eschaton-dilemma-front.png",
          "physicalCardId": "3a2fd5"
        },
        {
          "id": "3a2fd5-b",
          "label": "2B",
          "name": "The Eschaton Dilemma",
          "cardId": 13700,
          "side": "B",
          "image": "./assets/story-doom-cards/c3-doom-13700-the-eschaton-dilemma-back.png",
          "physicalCardId": "3a2fd5"
        },
        {
          "id": "802656-a",
          "label": "3A",
          "name": "Divine Shackles",
          "cardId": 13800,
          "side": "A",
          "image": "./assets/story-doom-cards/c3-doom-13800-divine-shackles-front.png",
          "physicalCardId": "802656"
        },
        {
          "id": "802656-b",
          "label": "3B",
          "name": "Divine Shackles",
          "cardId": 13800,
          "side": "B",
          "image": "./assets/story-doom-cards/c3-doom-13800-divine-shackles-back.png",
          "physicalCardId": "802656"
        }
      ]
    },
    "c4": buildStoryDoomCycle({
      storyCards: [
        {
          id: "000e26",
          name: "Law Of Bargains",
          cardId: 11000,
          face: "./assets/story-doom-cards/c4-story-11000-law-of-bargains-front.jpg",
          back: "./assets/story-doom-cards/c4-story-11000-law-of-bargains-back.jpg",
        },
        {
          id: "b17f40",
          name: "Splendor That Beggars Belief",
          cardId: 11001,
          face: "./assets/story-doom-cards/c4-story-11001-splendor-that-beggars-belief-front.jpg",
          back: "./assets/story-doom-cards/c4-story-11001-splendor-that-beggars-belief-back.jpg",
        },
        {
          id: "aa878b",
          name: "The Rope Sellers",
          cardId: 11002,
          face: "./assets/story-doom-cards/c4-story-11002-the-rope-sellers-front.jpg",
          back: "./assets/story-doom-cards/c4-story-11002-the-rope-sellers-back.jpg",
        },
        {
          id: "8b82b1",
          name: "A Mortal's Reach",
          cardId: 11003,
          face: "./assets/story-doom-cards/c4-story-11003-a-mortals-reach-front.jpg",
          back: "./assets/story-doom-cards/c4-story-11003-a-mortals-reach-back.jpg",
        },
      ],
      doomCards: [
        {
          id: "193d1d",
          name: "Delusions Of Grandeur",
          cardId: 9303,
          face: "./assets/story-doom-cards/c4-doom-9303-delusions-of-grandeur-front.jpg",
          back: "./assets/story-doom-cards/c4-doom-9303-delusions-of-grandeur-back.jpg",
        },
        {
          id: "d57517",
          name: "Pandora's Jar",
          cardId: 9304,
          face: "./assets/story-doom-cards/c4-doom-9304-pandoras-jar-front.jpg",
          back: "./assets/story-doom-cards/c4-doom-9304-pandoras-jar-back.jpg",
        },
        {
          id: "a927e2",
          name: "Final Bid",
          cardId: 9305,
          face: "./assets/story-doom-cards/c4-doom-9305-final-bid-front.jpg",
          back: "./assets/story-doom-cards/c4-doom-9305-final-bid-back.jpg",
        },
      ],
      inwardOdyssey: {
        id: "2b8168",
        name: "Inward Odyssey: Gardens Of Infinity Growth",
        cardId: 9400,
        face: "./assets/story-doom-cards/c4-story-9400-inward-odyssey-gardens-of-infinity-growth-front.jpg",
        back: "./assets/story-doom-cards/c4-story-9400-inward-odyssey-gardens-of-infinity-growth-back.jpg",
      },
      doomAIsBack: true,
    }),
    "c5": buildStoryDoomCycle({
      storyCards: [
        {
          id: "d0ac8d",
          name: "What Remains?",
          cardId: 11004,
          face: "./assets/story-doom-cards/c5-story-11004-what-remains-front.jpg",
          back: "./assets/story-doom-cards/c5-story-11004-what-remains-back.jpg",
        },
        {
          id: "9eefad",
          name: "The Enemy Of My Enemy",
          cardId: 11005,
          face: "./assets/story-doom-cards/c5-story-11005-the-enemy-of-my-enemy-front.jpg",
          back: "./assets/story-doom-cards/c5-story-11005-the-enemy-of-my-enemy-back.jpg",
        },
        {
          id: "9c22f7",
          name: "Quietly Into The Night",
          cardId: 11006,
          face: "./assets/story-doom-cards/c5-story-11006-quietly-into-the-night-front.jpg",
          back: "./assets/story-doom-cards/c5-story-11006-quietly-into-the-night-back.jpg",
        },
        {
          id: "204632",
          name: "The Sleep Of Reason",
          cardId: 11007,
          face: "./assets/story-doom-cards/c5-story-11007-the-sleep-of-reason-front.jpg",
          back: "./assets/story-doom-cards/c5-story-11007-the-sleep-of-reason-back.jpg",
        },
      ],
      doomCards: [
        {
          id: "6f8b72",
          name: "Your Nemesis",
          cardId: 9300,
          face: "./assets/story-doom-cards/c5-doom-9300-your-nemesis-front.jpg",
          back: "./assets/story-doom-cards/c5-doom-9300-your-nemesis-back.jpg",
        },
        {
          id: "707112",
          name: "The Last Hierei",
          cardId: 9301,
          face: "./assets/story-doom-cards/c5-doom-9301-the-last-hierei-front.jpg",
          back: "./assets/story-doom-cards/c5-doom-9301-the-last-hierei-back.jpg",
        },
        {
          id: "dbca29",
          name: "To Dark Do We At Last Return",
          cardId: 9302,
          face: "./assets/story-doom-cards/c5-doom-9302-to-dark-do-we-at-last-return-front.jpg",
          back: "./assets/story-doom-cards/c5-doom-9302-to-dark-do-we-at-last-return-back.jpg",
        },
      ],
      inwardOdyssey: {
        id: "df89d1",
        name: "Inward Odyssey: Truthsayer",
        cardId: 9500,
        face: "./assets/story-doom-cards/c5-story-9500-inward-odyssey-truthsayer-front.jpg",
        back: "./assets/story-doom-cards/c5-story-9500-inward-odyssey-truthsayer-back.jpg",
      },
      doomAIsBack: true,
    })
  }
};

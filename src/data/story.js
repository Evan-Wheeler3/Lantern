// Story fragments, per depth. Only pieces: the long arc is still open.
//   intro   : plate shown the first time a depth is entered
//   teach   : ability tutorial plate (first time the ability is available)
//   beacons : what wakes when each beacon is kindled
//             type 'mural'  — a relief that surfaces from the wall in the firelight
//             type 'echo'   — shadow figures that replay a moment, then burn away
//             type 'keeper' — a dead keeper with a journal page
//   door    : the journal on the lectern behind the great door
//
// Premise: in the drowned town above, people walk into the flood in their sleep,
// eyes open, following bells no one else hears. Your master went down after
// the first of them. His lantern came back up the well, still burning. He did
// not. Last night your brother Tomas walked into the water.

export const STORY = {
  1: {
    intro: {
      title: 'The Undercroft',
      text: 'Last night Tomas walked into the flood with his eyes open.\n\nA month ago Master Aldous went down after the first of the sleepers. His lantern came back up the well without him, still burning.\n\nIt is the only light that has ever come back. Take it down.',
    },
    teach: {
      id: 'beam',
      title: 'The Keeper\'s Lantern',
      text: 'LEFT CLICK shutters the lantern into a beam. Shadows held in the beam cannot move, and if you hold them long enough the fire engraves itself into them and they freeze, even after you look away.\n\nKindle the beacons (hold E). Kindled rooms are safe ground.\n\nOil is the only thing worth carrying up. Find spilled oil and hold E to scoop it. That takes both hands, so the lantern goes to your belt and the dark comes close. The well takes a toll in oil for every new depth.',
    },
    beacons: [
      { type: 'keeper', title: 'A keeper, long dead', text: '"The beacons are not for us. They are for them.\n\nA shadow that sees a kindled flame remembers, for one breath, that it once had a name."' },
      { type: 'mural', title: 'Mural — The Procession', text: 'Carved figures walk down a stair in a long line, hands on each other\'s shoulders. None of them is dragged.\n\nAt the front, someone carries a lantern pierced with a star.' },
      { type: 'echo', title: 'An echo in the fire', text: 'Three keepers kneel around this brazier. Two are praying.\n\nThe third has turned his head, and is looking straight at you.' },
    ],
    door: {
      title: 'A page, in Master Aldous\'s hand',
      text: 'If this lantern reached you, I did not get past the first door.\n\nDo not follow the bells. Follow the draft. The deep breathes, and when a door opens it breathes toward it. Watch the flame lean.\n\nAnd do not trust anything down here that knows your name.',
    },
  },
  2: {
    intro: {
      title: 'The Ossuary',
      text: 'The bones are stacked by hand, and by family. Someone took care down here, once.\n\nThe bells are louder. Somewhere below, a boy\'s voice is singing along with them, badly. Tomas never could hold a tune.',
    },
    teach: {
      id: 'blast',
      title: 'The Rite of the Open Palm',
      text: 'The keepers did not only carry fire. They pushed it.\n\nHold RIGHT CLICK: raise the lantern, star-side out, and drive the flame through it with your open hand. It burns any shadow in front of you, frozen ones fastest.\n\nIt costs breath. Empty it and the wick gutters: mash SPACE to pump oil back into it.',
    },
    beacons: [
      { type: 'mural', title: 'Mural — The Open Palm', text: 'A keeper holds a lantern before his chest. Behind it, his bare hand. In front of it, a star of fire as tall as a man.\n\nBeneath, scratched in later: HE BURNED HIS OWN.' },
      { type: 'echo', title: 'An echo in the fire', text: 'A keeper raises his hand to a shadow, then stops.\n\nThe shadow is small, and it is holding out a toy horse. He lowers his hand. The echo ends before you learn what he did.' },
      { type: 'keeper', title: 'A keeper\'s tally', text: 'Rows of strokes in charcoal on the wall: hundreds.\n\nUnder them: "Every one I burn the bells ring once fewer. Every one I burn, someone upstairs stops waiting by a window."' },
      { type: 'mural', title: 'Mural — The Bell', text: 'A great bell hangs under the water. Its rope goes up, through the vaults, through the town, into the houses, and ends tied around a sleeper\'s wrist.' },
    ],
    door: {
      title: 'Tied to the lectern',
      text: 'A wet woollen scarf, red once. Tomas\'s. Knotted tight around the lectern, the way he ties his boots.\n\nHe was here. He stopped long enough to leave you this.\n\nHe is walking faster than you.',
    },
  },
  3: {
    intro: {
      title: 'The Cisterns',
      text: 'Deep water and long vaults. The drips here are not all water.\n\nThe bells stop when you light your lantern, and start again when you look away.',
    },
    teach: {
      id: 'throw',
      title: 'Oil and Iron',
      text: 'Hold Q: grab your oil sack, douse the lantern and draw back. A guide shows where it will land. Release to throw.\n\nIt bursts into a pool of burning oil. Shadows caught in it burn, and the moths cannot keep away from it.\n\nThe lantern survives the fire. You do not have it until you walk into the flames and take it back. It costs oil.',
    },
    beacons: [
      { type: 'echo', title: 'An echo in the fire', text: 'Two keepers argue over a lantern. One wants to carry it down. One wants to put it out.\n\nThe one who wants to put it out has Master Aldous\'s voice.' },
      { type: 'keeper', title: 'A keeper, face to the wall', text: '"The Lamp was never lit to keep them out.\n\nIt was lit so they could find their way back."' },
      { type: 'mural', title: 'Mural — Moths', text: 'Pale wings around a flame, carved so finely the stone looks like ash.\n\nThe moths have faces.' },
      { type: 'keeper', title: 'A torn page', text: '"…whoever carries the star lantern down is the one they follow. So walk slowly. So walk where you mean them to go…"\n\nThe rest is gone.' },
    ],
    door: {
      title: 'Written in soot on the door, from the inside',
      text: 'TOMAS — WAIT FOR ME AT THE LAMP.\n\nThe hand is Master Aldous\'s. The soot is fresh.',
    },
  },
};

// Deeper than the authored chapters: a pool of fragments, chosen by seed.
export const FRAGMENTS = [
  { type: 'mural', title: 'Mural — The Lamp', text: 'A flame the size of a house, in a cage of iron the size of a church. Kneeling around it, keepers. Kneeling around them, shadows. Everyone is facing the same way.' },
  { type: 'echo', title: 'An echo in the fire', text: 'A sleeper walks past a keeper\'s lantern and stops. For a breath he looks down at his own hands as if he has never seen them. Then the bells ring, and he walks on.' },
  { type: 'keeper', title: 'A keeper\'s last line', text: '"Still burning. Still burning. Still—"' },
  { type: 'mural', title: 'Mural — The Bellringer', text: 'Someone stands under the drowned bell with the rope in their hands. The carver did not give them a face. The stone where the face would be has been scraped away, again and again.' },
  { type: 'echo', title: 'An echo in the fire', text: 'Children\'s voices, counting. The echo is of a game of hide-and-seek. One of the shadows is very good at it.' },
  { type: 'keeper', title: 'A pressed flower', text: 'Between two pages of an empty journal: a marsh-marigold, the yellow long gone to brown. On the page: "For when you come up."' },
];

export function storyFor(n, seed) {
  if (STORY[n]) return STORY[n];
  const pick = (k) => FRAGMENTS[(seed + k * 7) % FRAGMENTS.length];
  return {
    intro: { title: `Depth ${n}`, text: 'Further down than any keeper wrote of. The bells are close enough now to feel in your teeth.' },
    beacons: [0, 1, 2, 3, 4].map(pick),
    door: { title: 'A note on the lectern', text: 'Only the word KEEP, written many times, by many hands.' },
  };
}

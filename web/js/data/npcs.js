// The six people who live in Coldbrook, the town below your farm.
//
// Hearts run 0-10. Each threshold unlocks something concrete — this is a war
// economy, and being liked is a resource like any other.

export const HEART_MAX = 10;
export const POINTS_PER_HEART = 100;

export const NPCS = {
  mora: {
    id: 'mora', name: 'Mora', role: 'Mechanic', shop: 'mech',
    color: '#c4643a', icon: '🔧',
    desc: 'Runs the chassis yard. Speaks mostly in tolerances.',
    likes: ['scrap', 'alloy', 'core', 'cider'],
    loves: ['core'],
    dislikes: ['posy', 'mireblossom'],
    rewards: {
      2: { kind: 'discount', value: 0.9, text: '10% off every chassis.' },
      5: { kind: 'unit', value: 'thresher', text: 'Mora builds you a Thresher, free.' },
      8: { kind: 'discount', value: 0.75, text: '25% off every chassis.' },
      10: { kind: 'research', value: 'r_foundry', text: 'Field Foundry, on the house.' },
    },
  },
  bram: {
    id: 'bram', name: 'Bram', role: 'Seed Vendor', shop: 'seed',
    color: '#7fbf5a', icon: '🌱',
    desc: 'Sells seed, gossip, and unsolicited weather predictions.',
    likes: ['turnip', 'cornbolt', 'hayberry', 'posy'],
    loves: ['sunmelon'],
    dislikes: ['scrap', 'slagvine'],
    rewards: {
      2: { kind: 'discount', value: 0.85, text: '15% off all seed.' },
      5: { kind: 'crop', value: 'ironfruit', text: 'Bram slips you an Ironfruit cutting.' },
      8: { kind: 'seeds', value: 10, text: '10 free seeds of the day, every season.' },
      10: { kind: 'discount', value: 0.6, text: '40% off all seed.' },
    },
  },
  ilse: {
    id: 'ilse', name: 'Ilse', role: 'Blacksmith', shop: 'forge',
    color: '#d8b45a', icon: '🔨',
    desc: 'Upgrades your tools. Considers the mechs a passing fashion.',
    likes: ['alloy', 'scrap', 'emberpepper'],
    loves: ['iceflax'],
    dislikes: ['milk', 'egg'],
    rewards: {
      2: { kind: 'toolDiscount', value: 0.85, text: '15% off tool upgrades.' },
      5: { kind: 'energy', value: 20, text: '+20 max energy — better grip, less strain.' },
      8: { kind: 'item', value: { repairKit: 3 }, text: 'Three repair kits.' },
      10: { kind: 'energy', value: 30, text: '+30 more max energy.' },
    },
  },
  odell: {
    id: 'odell', name: 'Odell', role: 'Mayor', shop: 'board',
    color: '#8fb6cf', icon: '📜',
    desc: 'Posts the contracts. Has never once been outside the wall.',
    likes: ['bogroot', 'glacierleaf', 'trinket'],
    loves: ['mireblossom'],
    dislikes: ['scrap'],
    rewards: {
      2: { kind: 'contracts', value: 1, text: 'One more contract on the board each day.' },
      5: { kind: 'gold', value: 1500, text: 'A grant of 1500g from the town purse.' },
      8: { kind: 'research', value: 'r_scouts', text: 'Scout Balloons, requisitioned.' },
      10: { kind: 'research', value: 'r_warchest', text: 'War Chest, funded by the town.' },
    },
  },
  wren: {
    id: 'wren', name: 'Wren', role: 'Rancher', shop: 'ranch',
    color: '#e0c15a', icon: '🐄',
    desc: 'Sells livestock. Knows every animal on the continent by name.',
    likes: ['milk', 'egg', 'wool', 'hayberry'],
    loves: ['cider'],
    dislikes: ['emberpepper'],
    rewards: {
      2: { kind: 'discount', value: 0.9, text: '10% off livestock.' },
      5: { kind: 'animal', value: 'chicken', text: 'Wren gifts you a chicken.' },
      8: { kind: 'produce', value: 1.3, text: 'Animal produce sells for 30% more.' },
      10: { kind: 'animal', value: 'cow', text: 'A cow. Just like that.' },
    },
  },
  sable: {
    id: 'sable', name: 'Sable', role: 'Salvager', shop: 'salvage',
    color: '#a49d86', icon: '⚙️',
    desc: 'Buys and sells wreckage. Was out past the Ashlands once and came back.',
    likes: ['scrap', 'core', 'trinket', 'slagvine'],
    loves: ['alloy'],
    dislikes: ['posy', 'turnip'],
    rewards: {
      2: { kind: 'salvage', value: 1.2, text: '+20% salvage from every battle.' },
      5: { kind: 'item', value: { core: 2 }, text: 'Two power cores.' },
      8: { kind: 'research', value: 'r_salvage', text: 'Salvage Rights, taught for free.' },
      10: { kind: 'unit', value: 'combine_titan', text: 'Sable hauls you a working Titan.' },
    },
  },
};

export const NPC_IDS = Object.keys(NPCS);

/** Gift reaction and the affection points it's worth. */
export function giftReaction(npcId, itemId) {
  const npc = NPCS[npcId];
  if (!npc) return { reaction: 'neutral', points: 0 };
  if (npc.loves.includes(itemId)) return { reaction: 'loved', points: 90 };
  if (npc.likes.includes(itemId)) return { reaction: 'liked', points: 50 };
  if (npc.dislikes.includes(itemId)) return { reaction: 'disliked', points: -30 };
  return { reaction: 'neutral', points: 15 };
}

export const REACTION_TEXT = {
  loved: ['This — where did you get this?', 'I will not forget this.', 'You remembered.'],
  liked: ['That is a good one. Thank you.', 'Useful. Genuinely.', 'I will put it to work.'],
  neutral: ['Hm. Thank you.', 'Kind of you.', 'I will find a use.'],
  disliked: ['...why.', 'I have no use for this.', 'Keep it. Really.'],
};

/** Rotating daily lines, keyed loosely by how well you know them. */
export const DIALOGUE = {
  mora: {
    0: ['Fences down again on the near field, I hear.', 'You want plating, bring me alloy.'],
    3: ['Your Harvester came back walking. That is not nothing.', 'I can fix most things twice.'],
    6: ['Bring me a core and I will show you something.', 'You are getting better at this.'],
    9: ['Whatever you march on next — I want to see the wreckage.'],
  },
  bram: {
    0: ['Frost is coming early. Plant accordingly.', 'Turnips. Always turnips, to start.'],
    3: ['The marsh seed is worth the trip, if you can hold the crossing.'],
    6: ['I have been saving something for a farmer who could use it.'],
    9: ['Whatever you plant now, I will have the seed for it.'],
  },
  ilse: {
    0: ['Your hoe is bent. I can see it from here.', 'Tools first. Machines are a distraction.'],
    3: ['You work harder than you rest. That is a choice.'],
    6: ['Better grip, longer days. Come by.'],
    9: ['You will outlast all of them. Not the mechs. You.'],
  },
  odell: {
    0: ['The board is up. Read it before you march.', 'Coldbrook does not fund losses.'],
    3: ['Two parcels in. People are noticing.'],
    6: ['The council asked about you by name. I said good things.'],
    9: ['Take the Ironfield and I will put your name on the wall.'],
  },
  wren: {
    0: ['Feed them every day. Every day, mind.', 'A neglected animal remembers.'],
    3: ['Your coop is running well. I can tell from the eggs.'],
    6: ['You have the hands for this. Not everyone does.'],
    9: ['Come by tomorrow. There is something in the back barn.'],
  },
  sable: {
    0: ['Anything you drag back, I will price it.', 'Ash country eats machines. Go carefully.'],
    3: ['You are bringing back more than you lose now.'],
    6: ['I went past the Cauldron once. Do not do it lightly.'],
    9: ['When you take the Ironfield, I want to be standing there.'],
  },
};

export function dialogueFor(npcId, hearts) {
  const table = DIALOGUE[npcId] ?? {};
  const tiers = Object.keys(table).map(Number).sort((a, b) => b - a);
  for (const tier of tiers) {
    if (hearts >= tier) return table[tier];
  }
  return ['...'];
}

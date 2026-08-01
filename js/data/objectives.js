/* ============================================================================
 * data/objectives.js — the OPS BOARD.
 *
 * Five short chains of goals that give the game direction: build, merge, crew,
 * hits and research. Only the first unclaimed objective of each chain is live
 * at any time, so the board shows five things to chase instead of twenty.
 *
 * `stat` names are resolved by state.statValue(); `n` is the target value.
 * Rewards use the same shape as state.grant().
 * ========================================================================== */
CM.OBJECTIVES = (function () {
  'use strict';

  const O = (id, chain, name, stat, n, desc, reward) =>
    ({ id: id, chain: chain, name: name, stat: stat, n: n, desc: desc, reward: reward });

  const LIST = [
    /* ------------------------------------------------------------ BUILD */
    O('b1', 'build', 'FIRST LIGHT',    'buildings',    1,  'Deploy your first outpost.',
      { credits: 200, xp: 12 }),
    O('b2', 'build', 'CITY BLOCK',     'buildings',    4,  'Run four outposts at once.',
      { credits: 1200, intel: 10, xp: 30 }),
    O('b3', 'build', 'GRID LORD',      'buildings',    8,  'Eight outposts on the slab.',
      { credits: 9000, intel: 45, xp: 80 }),
    O('b4', 'build', 'HEAVY PLANT',    'maxBuildLevel', 8, 'Push any outpost to level 8.',
      { credits: 120000, chips: 40, xp: 220 }),
    O('b5', 'build', 'SKYLINE OWNER',  'buildings',   16,  'Sixteen outposts. Own the block.',
      { credits: 400000, intel: 900, xp: 500 }),

    /* ------------------------------------------------------------ MERGE */
    O('m1', 'merge', 'FIRST FUSION',   'merges',       1,  'Fuse any two matching items.',
      { credits: 150, xp: 10 }),
    O('m2', 'merge', 'TIER THREE',     'bestTier',     3,  'Merge anything up to tier 3.',
      { credits: 900, chips: 5, xp: 30 }),
    O('m3', 'merge', 'TIER FIVE',      'bestTier',     5,  'Reach tier 5 on any chain.',
      { credits: 14000, chips: 22, xp: 110 }),
    O('m4', 'merge', 'TIER SEVEN',     'bestTier',     7,  'Reach tier 7 on any chain.',
      { credits: 220000, chips: 110, xp: 380 }),
    O('m5', 'merge', 'CHROME WARLORD', 'bestTier',     8,  'Build a tier 8. The top of the chain.',
      { credits: 1200000, chips: 400, xp: 900 }),

    /* ------------------------------------------------------------- CREW */
    O('c1', 'crew',  'PUT THEM TO WORK', 'stationed',  1,  'Station one agent at an outpost.',
      { credits: 300, xp: 14 }),
    O('c2', 'crew',  'FULL SHIFT',       'stationed',  4,  'Four outposts staffed at once.',
      { credits: 4200, intel: 18, xp: 60 }),
    O('c3', 'crew',  'SYNDICATE',        'stationed',  9,  'Nine staffed outposts. A real operation.',
      { credits: 140000, intel: 400, xp: 400 }),

    /* -------------------------------------------------------------- HIT */
    O('h1', 'hit',   'FIRST BLOOD',    'missionsWon',  1,  'Clear any contract.',
      { credits: 400, xp: 24 }),
    O('h2', 'hit',   'REGULARS',       'missionsWon', 10,  'Clear ten contracts.',
      { credits: 7000, intel: 34, xp: 90 }),
    O('h3', 'hit',   'PROFESSIONALS',  'missionsWon', 40,  'Forty contracts cleared.',
      { credits: 110000, chips: 70, xp: 340 }),
    O('h4', 'hit',   'HEAT SEEKER',    'maxHeat',      5,  'Clear any contract at heat 5.',
      { credits: 500000, chips: 180, xp: 700 }),

    /* ------------------------------------------------------------- TECH */
    O('t1', 'tech',  'BOOTSTRAP',      'techNodes',    3,  'Bring three tech nodes online.',
      { credits: 600, xp: 20 }),
    O('t2', 'tech',  'WIRED IN',       'techNodes',    8,  'Eight nodes online.',
      { credits: 11000, intel: 40, xp: 120 }),
    O('t3', 'tech',  'FULL STACK',     'techNodes',   16,  'Sixteen nodes online.',
      { credits: 180000, intel: 600, xp: 450 }),
    O('t4', 'tech',  'SINGULARITY',    'techNodes',   24,  'Every node on the tree.',
      { credits: 2500000, chips: 900, xp: 1500 }),

    /* ----------------------------------------------------------- LEGACY */
    O('p1', 'legacy', 'WALK AWAY ONCE', 'prestiges',   1,  'Retire a crew and start again with street cred.',
      { credits: 50000, chips: 250, xp: 600 }),
    O('p2', 'legacy', 'REVOLVING DOOR', 'prestiges',   3,  'Retire three crews.',
      { credits: 900000, chips: 1200, xp: 2000 })
  ];

  const CHAINS = ['build', 'merge', 'crew', 'hit', 'tech', 'legacy'];
  const CHAIN_COLOR = {
    build: '#24e2ff', merge: '#ffb020', crew: '#ff3fa4',
    hit: '#ff4b57', tech: '#49ff9b', legacy: '#9a6bff'
  };

  const byId = (id) => LIST.find((o) => o.id === id);

  return { LIST, CHAINS, CHAIN_COLOR, byId };
})();

/* ============================================================================
 * data/missions.js — hit-mission contracts + the enemy bestiary + the player
 * abilities used by the turn-based combat resolver.
 * ========================================================================== */
CM.MISSIONS = (function () {
  'use strict';

  /* Enemy archetypes. `hp`/`atk` are multipliers applied to the mission's
     power budget, so the same archetype scales with district tier. */
  const FOES = [
    { id: 'punk',   name: 'Street Punk',   hp: 0.75, atk: 0.85, color: '#ff4b57', kind: 'agent' },
    { id: 'runner', name: 'Chrome Runner', hp: 0.65, atk: 1.15, color: '#ff3fa4', kind: 'agent' },
    { id: 'drone',  name: 'Corp Drone',    hp: 0.55, atk: 1.30, color: '#24e2ff', kind: 'weapon' },
    { id: 'secbot', name: 'Sec-Bot',       hp: 1.35, atk: 0.75, color: '#9a6bff', kind: 'agent' },
    { id: 'cruiser',name: 'Patrol Cruiser',hp: 1.20, atk: 0.95, color: '#ffb020', kind: 'vehicle' },
    { id: 'mech',   name: 'Enforcer Mech', hp: 1.90, atk: 1.25, color: '#ff7a2f', kind: 'agent' },
    { id: 'ronin',  name: 'Rival Ronin',   hp: 1.10, atk: 1.55, color: '#49ff9b', kind: 'agent' },
    { id: 'titan',  name: 'Arasa Titan',   hp: 2.60, atk: 1.60, color: '#ffffff', kind: 'agent' }
  ];
  const foe = (id) => FOES.find((f) => f.id === id);

  /* Contracts. `power` is the per-enemy stat budget; rewards are the base
     payout before loot multipliers and the streak bonus. */
  const CONTRACTS = [
    { id: 'm1', name: 'CORNER SHAKEDOWN', district: 'Kabu Alley',    tier: 1, lvl: 1,
      energy: 12, foes: ['punk','punk'],                       power: 34,
      reward: { credits: 180, intel: 4,  chips: 1, xp: 14 },
      blurb: 'Two punks are skimming your corner. Make an example.' },

    { id: 'm2', name: 'CARGO SNATCH', district: 'Dofact Docks',      tier: 2, lvl: 2,
      energy: 16, foes: ['punk','runner','drone'],             power: 62,
      reward: { credits: 520, intel: 10, chips: 2, xp: 26 },
      blurb: 'A container of grey-market chips is sitting unguarded. Mostly.' },

    { id: 'm3', name: 'SIGNAL JAM', district: 'Rnutos Strip',        tier: 3, lvl: 4,
      energy: 22, foes: ['drone','drone','secbot'],            power: 120,
      reward: { credits: 1500, intel: 26, chips: 4, xp: 48 },
      blurb: 'Kill the corp relay lighting up your outposts.' },

    { id: 'm4', name: 'HIGHWAY HIT', district: 'Zaraote Overpass',   tier: 4, lvl: 7,
      energy: 30, foes: ['cruiser','runner','runner','secbot'], power: 240,
      reward: { credits: 4800, intel: 60, chips: 8, xp: 90 },
      blurb: 'An armoured convoy, one overpass, ninety seconds.' },

    { id: 'm5', name: 'TOWER BREACH', district: 'Zealy Spire',       tier: 5, lvl: 11,
      energy: 40, foes: ['mech','secbot','drone','drone'],     power: 470,
      reward: { credits: 15000, intel: 150, chips: 16, xp: 170 },
      blurb: 'Forty floors of security between you and the vault.' },

    { id: 'm6', name: 'GHOST CONTRACT', district: 'Old Noir Ward',   tier: 6, lvl: 16,
      energy: 52, foes: ['ronin','ronin','mech'],              power: 900,
      reward: { credits: 48000, intel: 380, chips: 32, xp: 300 },
      blurb: 'A rival crew wants your merge chains. Decline loudly.' },

    { id: 'm7', name: 'BLACK RAIN', district: 'Arasa Foundry',       tier: 7, lvl: 22,
      energy: 68, foes: ['mech','mech','ronin','cruiser'],     power: 1800,
      reward: { credits: 160000, intel: 950, chips: 65, xp: 520 },
      blurb: 'Burn the foundry that stamps the Sec-Bot chassis.' },

    { id: 'm8', name: 'CROWN HEIST', district: 'Cyber Merger Tower', tier: 8, lvl: 30,
      energy: 90, foes: ['titan','mech','ronin','secbot','drone'], power: 3600,
      reward: { credits: 620000, intel: 2800, chips: 150, xp: 900 },
      blurb: 'The building with your name on it. Take it back.' }
  ];

  /* Player abilities — the "turn-based" layer. Each costs energy and has a
     cooldown measured in combat rounds. */
  const ABILITIES = [
    { id: 'strike',    name: 'STRIKE',    energy: 0,  cd: 0, color: '#24e2ff',
      desc: 'Standard volley. Everyone fires.' },
    { id: 'overclock', name: 'OVERCLOCK', energy: 6,  cd: 3, color: '#ffb020',
      desc: 'Squad deals 2.2x damage this round.' },
    { id: 'patch',     name: 'PATCH',     energy: 8,  cd: 3, color: '#49ff9b',
      desc: 'Heal the squad for 30% of max HP.' },
    { id: 'smoke',     name: 'SMOKE',     energy: 10, cd: 4, color: '#9a6bff',
      desc: 'Enemies miss their next round entirely.' },
    { id: 'retreat',   name: 'BAIL',      energy: 0,  cd: 0, color: '#ff4b57',
      desc: 'Abort. Keep half the energy, lose the payout.' }
  ];

  return { FOES, foe, CONTRACTS, ABILITIES };
})();

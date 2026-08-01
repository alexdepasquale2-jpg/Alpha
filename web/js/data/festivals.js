// Two festivals per season, on fixed days. They fire when you sleep into the
// date, and they are the only thing that can interrupt a farming day.

export const FESTIVALS = {
  seedFair: {
    id: 'seedFair', name: 'Seed Fair', season: 0, day: 7, kind: 'market',
    desc: 'Bram lays out everything he has. Seed is cheap and the marsh stock is out.',
    effect: { seedDiscount: 0.6 },
    blurb: 'All seed at 40% off for the day.',
  },
  harvestFair: {
    id: 'harvestFair', name: 'Harvest Fair', season: 2, day: 16, kind: 'judging',
    desc: 'Bring your single finest crop. The judges are not kind but they are fair.',
    // Prize scales with the sale value of the entry.
    effect: { prizeMult: 6 },
    blurb: 'Enter your best crop for a prize worth six times its value.',
  },
  mechExhibition: {
    id: 'mechExhibition', name: 'Mech Exhibition', season: 1, day: 12, kind: 'arena',
    desc: 'A fixed-budget bout in the town square. No salvage, no risk, real gold.',
    effect: { budget: 1200, purse: 2200 },
    blurb: 'Build an army from a 1200g loan and fight for a 2200g purse.',
  },
  lanternNight: {
    id: 'lanternNight', name: 'Lantern Night', season: 3, day: 22, kind: 'social',
    desc: 'The whole town turns out. Everyone is in a generous mood.',
    effect: { affection: 40 },
    blurb: 'Everyone in Coldbrook warms to you a little.',
  },
  thawMarket: {
    id: 'thawMarket', name: 'Thaw Market', season: 0, day: 21, kind: 'market',
    desc: 'Salvagers come in off the ash road with whatever survived the winter.',
    effect: { salvageStock: true },
    blurb: 'Sable stocks cores and alloy at half price.',
  },
  emberVigil: {
    id: 'emberVigil', name: 'Ember Vigil', season: 1, day: 25, kind: 'social',
    desc: 'For the ones who marched out and did not come back.',
    effect: { homesteadHp: 20 },
    blurb: 'Permanent +20 Homestead HP, in their memory.',
  },
  ironFeast: {
    id: 'ironFeast', name: 'Iron Feast', season: 2, day: 4, kind: 'social',
    desc: 'The town eats what you shipped. It is a good feeling.',
    effect: { goldPerParcel: 300 },
    blurb: 'The town pays 300g for every parcel you hold.',
  },
  longDark: {
    id: 'longDark', name: 'The Long Dark', season: 3, day: 9, kind: 'arena',
    desc: 'Frost brings raiders down off the reach. Coldbrook asks for help.',
    effect: { budget: 2600, purse: 4200 },
    blurb: 'Defend the town with a 2600g loan. The purse is 4200g.',
  },
};

export const FESTIVAL_IDS = Object.keys(FESTIVALS);

/** The festival on a given date, if any. */
export function festivalOn(season, day) {
  return FESTIVAL_IDS
    .map((id) => FESTIVALS[id])
    .find((f) => f.season === season && f.day === day) ?? null;
}

/** Upcoming festivals this season, soonest first. */
export function upcoming(season, day) {
  return FESTIVAL_IDS
    .map((id) => FESTIVALS[id])
    .filter((f) => f.season === season && f.day >= day)
    .sort((a, b) => a.day - b.day);
}

export function festivalKey(festivalId, year) {
  return `${year}:${festivalId}`;
}

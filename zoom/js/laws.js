// A Law is a chunk of the ocean with one rule. This file is only the data;
// what a Law does to a given target lives in sim.js (applyLaw).

export const LAWS = {
  WONT_CLOSE: {
    id: 'WONT_CLOSE', name: "WON'T CLOSE", color: '#7dffb3', weight: 2,
    notice: 14, plant: 0.7, wobble: 3.0, sweet: 0.95,
  },
  TEETH: {
    id: 'TEETH', name: 'TEETH', color: '#ffd66b', weight: 2,
    notice: 18, plant: 0.8, wobble: 4.4, sweet: 0.85,
  },
  LOOKS: {
    id: 'LOOKS', name: 'LOOKS THROUGH YOU', color: '#6fd6ff', weight: 3,
    notice: 45, plant: 1.25, wobble: 3.6, sweet: 0.75, wearable: true,
  },
  HEARTS: {
    id: 'HEARTS', name: 'THREE HEARTS', color: '#ff5d7a', weight: 3,
    notice: 18, plant: 0.9, wobble: 4.0, sweet: 0.85, wearable: true,
  },
  LEAVES: {
    id: 'LEAVES', name: 'LEAVES THE MEETING', color: '#ffb45e', weight: 2,
    notice: 16, plant: 0.9, wobble: 3.8, sweet: 0.85, wearable: true,
  },
  BORED: {
    id: 'BORED', name: 'GETS BORED', color: '#b7a6ff', weight: 1,
    notice: 10, plant: 0.6, wobble: 2.8, sweet: 1.0, wearable: true,
  },
  STATIC: {
    id: 'STATIC', name: 'STATIC', color: '#eeeef8', weight: 1,
    notice: 0, plant: 0.5, wobble: 3, sweet: 1,
  },
};

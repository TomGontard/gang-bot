// src/config/metrics.js

export default {
    // -------------------------------------------------
    // Faction-change cooldown (in milliseconds)
    factionChangeCooldown: 24 * 60 * 60 * 1000, // 24 hours
  
    // -------------------------------------------------
    // Base mission rewards (expand as needed)
    mission: {
      baseXpPerLevel: {
        1: 10,
        2: 15,
        3: 20,
        4: 30,
        5: 40
        // … you can add more levels here
      },
      baseCoinsPerLevel: {
        1: 5,
        2: 10,
        3: 15,
        4: 25,
        5: 35
        // …
      }
    },
  
    // -------------------------------------------------
    // Level thresholds: total XP required to reach each level
    // You can extend up to as many levels as you want.
    levelThresholds: {
      1:   0,
      2: 100,
      3: 250,
      4:  450,
      5:  700,
      6: 1000,
      7: 1350,
      8: 1750,
      9: 2200,
      10: 2700,
      // … continue to level 100+ if desired.
      // If undefined, experienceService will treat as “no higher level.”
    },
  
    // -------------------------------------------------
    // HP gained per level‐up
    hpPerLevel: 1,
  
    // -------------------------------------------------
    // Attribute‐upgrade costs
    attributeCosts: {
      Vitality:      2,
      Wisdom:        2,
      Strength:      1,
      Intelligence:  1,
      Luck:          1,
      Agility:       1
    },
  
    // -------------------------------------------------
    // NFT-based boosts (kept for future use)
    nftBoosts: {
      1: { xpBoost: 0.00, coinsBoost: 0.00, maxConcurrentMissions: 1 },
      2: { xpBoost: 0.05, coinsBoost: 0.10, maxConcurrentMissions: 2 },
      3: { xpBoost: 0.10, coinsBoost: 0.15, maxConcurrentMissions: 3 },
      4: { xpBoost: 0.10, coinsBoost: 0.15, maxConcurrentMissions: 3 },
      5: { xpBoost: 0.20, coinsBoost: 0.25, maxConcurrentMissions: 3 }
    }
  };
  
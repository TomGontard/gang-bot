// src/config/metrics.js

export default {
    // -------------------------------------------------
    // Faction-change cooldown (in milliseconds)
    // Users must wait this long after leaving a faction
    // before they can join another.
    // For example: 24 hours = 24 * 60 * 60 * 1000 ms
    factionChangeCooldown: 24 * 60 * 60 * 1000,
  
    // -------------------------------------------------
    // Base mission rewards (you can expand as needed)
    mission: {
      baseXpPerLevel: {
        // Example: level 1 missions give 10 XP, level 2 give 15, etc.
        1: 10,
        2: 15,
        3: 20,
        // … add more thresholds or compute dynamically
      },
      baseCoinsPerLevel: {
        1: 5,
        2: 10,
        3: 15,
        // …
      }
    },
  
    // -------------------------------------------------
    // Level thresholds: total XP required to reach each level
    // You can list as many levels as you want. For now:
    levelThresholds: {
      1: 0,
      2: 100,
      3: 250,
      4: 500,
      5: 900,
      // … continue up to 100+
    },
  
    // -------------------------------------------------
    // Example attribute-upgrade costs (if you decide to use them)
    attributeCosts: {
      Vitality: 2,    // costs 2 points for +1 Vitality
      Wisdom: 2,      // costs 2 points for +1 Wisdom
      Strength: 1,
      Intelligence: 1,
      Luck: 1,
      Agility: 1
    },
  
    // -------------------------------------------------
    // NFT-based boosts (if desired; or leave here for future)
    nftBoosts: {
      1: { xpBoost: 0.00, coinsBoost: 0.00, maxConcurrentMissions: 1 },
      2: { xpBoost: 0.05, coinsBoost: 0.10, maxConcurrentMissions: 2 },
      3: { xpBoost: 0.10, coinsBoost: 0.15, maxConcurrentMissions: 3 },
      4: { xpBoost: 0.10, coinsBoost: 0.15, maxConcurrentMissions: 3 },
      5: { xpBoost: 0.20, coinsBoost: 0.25, maxConcurrentMissions: 3 }
    }
  };
  
import Player from '../data/models/Player.js';
import { addExperience } from './experienceService.js';

export async function distributeLootToFaction(factionName, { xp = 0, coins = 0 }) {
  // Récupérer tous les joueurs de la faction
  const players = await Player.find({ faction: factionName });
  const results = [];

  for (const p of players) {
    // ajouter XP et gérer level-up
    const { levelsGained } = await addExperience(p, xp);
    // ajouter pièces
    p.coins += coins;
    await p.save();

    results.push({
      discordId: p.discordId,
      xpGained: xp,
      coinsGained: coins,
      levelsGained
    });
  }

  return results;
}

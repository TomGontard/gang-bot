import Faction from '../data/models/Faction.js';
import factionsConfig from '../config/factions.js';
import Player from '../data/models/Player.js';

export async function initializeFactions() {
  const existingCount = await Faction.countDocuments();
  if (existingCount > 0) return;

  const defaultFactions = factionsConfig.map(f => ({
      name: f.name,
      displayName: f.displayName,
      color: f.color,
      membersCount: 0,
      warOngoing: false
  }));
  for (const data of defaultFactions) {
    await Faction.create(data);
  }
}

export async function getAllFactions() {
  return await Faction.find().sort({ name: 1 }).lean();
}

export async function getFactionByName(name) {
  return await Faction.findOne({ name }).lean();
}

export async function canJoinFaction(factionName) {
  const factions = await Faction.find().lean();
  const target = factions.find(f => f.name === factionName);
  if (!target) return false;

  const sizes = factions.map(f => f.membersCount);
  const minSize = Math.min(...sizes);
  if (target.membersCount + 1 > minSize + 3) {
    return false;
  }
  return true;
}

export async function assignFactionToPlayer(player, factionName) {
  if (player.faction === factionName) {
    throw new Error('You are already in that faction.');
  }

  const targetFaction = await Faction.findOne({ name: factionName });
  if (!targetFaction) throw new Error('That faction does not exist.');

  const allowed = await canJoinFaction(factionName);
  if (!allowed) throw new Error('Cannot join: faction would become too large compared to others.');

  // Remove from old faction if present
  if (player.faction) {
    const oldFaction = await Faction.findOne({ name: player.faction });
    if (oldFaction) {
      oldFaction.membersCount = Math.max(0, oldFaction.membersCount - 1);
      await oldFaction.save();
    }
  }

  // Assign new faction
  player.faction = factionName;
  await player.save();

  // Increment new faction’s count
  targetFaction.membersCount += 1;
  await targetFaction.save();
}

export async function removePlayerFromFaction(player) {
  if (!player.faction) throw new Error('You are not in any faction.');
  const oldFaction = await Faction.findOne({ name: player.faction });
  if (oldFaction) {
    oldFaction.membersCount = Math.max(0, oldFaction.membersCount - 1);
    await oldFaction.save();
  }
  player.faction = null;
  await player.save();
}

export async function getPlayerFaction(player) {
  if (!player.faction) return null;
  return await Faction.findOne({ name: player.faction }).lean();
}

import Territory from '../data/models/Territory.js';
import Player from '../data/models/Player.js';
import metrics from '../config/metrics.js';
import { calculateTotalStats } from './itemService.js';

// ✅ init en "Neutral"
export async function ensureMapInitialized(defaultOwner = 'Neutral') {
  const { rows, cols } = metrics.faction.territory;
  const count = await Territory.countDocuments();
  if (count) return;
  const bulk = [];
  for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) {
    bulk.push({ key: `r${r}c${c}`, owner: defaultOwner });
  }
  await Territory.insertMany(bulk);
}

function buildingExtraDef(type, L) {
  if (!type || L<=0) return 0;
  const cfg = metrics.faction.territory.buildings[type];
  if (!cfg) return 0;
  const { startLevel, every } = cfg.extraDef;
  if (L < startLevel) return 0;
  return Math.floor((L - startLevel) / every) + 1;
}

export function calcDefMax(tile) {
  const b = tile.building;
  const extraB = b?.level ? buildingExtraDef(b.type, b.level) : 0;
  const extraF = Math.floor((tile.fortLevel || 0) / metrics.faction.territory.fort.extraDefEvery);
  return 1 + extraB + extraF;
}

export async function sumForce(discordIds) {
  const players = await Player.find({ discordId: { $in: discordIds } });
  let total = 0;
  for (const p of players) {
    const s = await calculateTotalStats(p);
    total += (s.force || 0);
  }
  return total;
}

export function calcTileDefenseForce(tile, defendersForce) {
  const fort = (tile.fortLevel || 0) * metrics.faction.territory.fort.forcePerLevel;
  const arm  = (tile.building?.type === 'armory')
    ? (tile.building.level * metrics.faction.territory.buildings.armory.forceAuraPerLevel)
    : 0;
  return defendersForce + fort + arm;
}

export async function getMaxAttackers(targetFaction) {
  const count = await Player.countDocuments({ faction: targetFaction });
  const d = metrics.faction.attack.attackerLimitDivisor;
  return Math.max(1, Math.floor(count / d));
}

export async function isPlayerBusy(discordId) {
  const t = await Territory.findOne({
    $or: [
      { 'defenders.discordId': discordId },
      { 'attack.attackers':    discordId }
    ]
  });
  return !!t;
}

// ✅ règles de défense : même faction + jamais sur Neutral
export async function joinDefense(key, discordId) {
  const tile = await Territory.findOne({ key });
  if (!tile) throw new Error('Territory not found');
  if (tile.owner === 'Neutral') throw new Error('Neutral territory cannot be defended.');
  const player = await Player.findOne({ discordId });
  if (!player?.faction) throw new Error('You are not in a faction.');
  if (player.faction !== tile.owner) throw new Error('You can only defend your faction territory.');

  const max = calcDefMax(tile);
  if (tile.defenders.some(d => d.discordId === discordId)) return tile;
  if (tile.defenders.length >= max) throw new Error('All defense slots are taken.');
  if (tile.attack && tile.attack.endAt && Date.now() > tile.attack.endAt.getTime()) {
    tile.attack = null;
  }
  if (await isPlayerBusy(discordId)) throw new Error('You are already engaged on another territory.');
  tile.defenders.push({ discordId, sinceAt: new Date() });
  await tile.save();
  return tile;
}

export async function canLeaveDefense(tile, discordId) {
  const d = tile.defenders.find(x => x.discordId === discordId);
  if (!d) return true;

  // Attaque en cours = endAt non défini OU endAt dans le futur
  const attackOngoing = !!(tile.attack && (!tile.attack.endAt || Date.now() < tile.attack.endAt.getTime()));
  if (attackOngoing) return false;

  // Min hours depuis la config defense (fallback 24h) → ms
  const minHours = metrics?.faction?.defense?.minHours ?? 24;
  const minMs = minHours * 3600 * 1000;

  return (Date.now() - new Date(d.sinceAt).getTime()) >= minMs;
}


export async function leaveDefense(key, discordId) {
  const tile = await Territory.findOne({ key });
  if (!tile) throw new Error('Territory not found');

  const minHours = metrics?.faction?.defense?.minHours ?? 24;
  if (!(await canLeaveDefense(tile, discordId))) {
    throw new Error(`You cannot leave defense yet (minimum ${minHours}h or an attack is ongoing).`);
  }

  tile.defenders = tile.defenders.filter(d => d.discordId !== discordId);
  await tile.save();
  return tile;
}


export function buildingUpgradeCost(type, toLevel) {
  const b = metrics.faction.territory.buildings[type];
  return Math.floor(b.costBase * Math.pow(b.costGrowth, toLevel - 1));
}

export function fortUpgradeCost(toLevel) {
  const f = metrics.faction.territory.fort;
  return Math.floor(f.costBase * Math.pow(f.costGrowth, toLevel - 1));
}

export async function destroyBuilding(key) {
  const tile = await Territory.findOne({ key });
  if (!tile) throw new Error('Territory not found');
  if (tile.attack) throw new Error('Cannot destroy while an attack is ongoing.');
  if (!tile.building?.type || tile.building.level <= 0) throw new Error('No building to destroy.');
  const refund = Math.floor(0.5 * buildingUpgradeCost(tile.building.type, tile.building.level));
  const prevType = tile.building.type;
  tile.building = { type: null, level: 0 };
  await tile.save();
  return { tile, refund, prevType };
}

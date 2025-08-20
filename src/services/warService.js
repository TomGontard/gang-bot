// src/services/warService.js
import Territory from '../data/models/Territory.js';
import Player from '../data/models/Player.js';
import FactionBank from '../data/models/FactionBank.js';
import metrics from '../config/metrics.js';
import { calculateTotalStats } from './itemService.js';
import { sumForce, calcTileDefenseForce, getMaxAttackers, isPlayerBusy, buildingUpgradeCost } from './territoryService.js';
import { createEmbed } from '../utils/createEmbed.js';

function maxConcurrentByFaction() {
  return metrics?.faction?.attack?.maxConcurrentByFaction ?? 3;
}

async function countOngoingAttacks(attackerFaction) {
  return Territory.countDocuments({
    'attack.attackerFaction': attackerFaction,
    'attack.endAt': { $gt: new Date() }
  });
}

async function getPlayersForces(discordIds = []) {
  if (!discordIds.length) return [];
  const players = await Player.find({ discordId: { $in: discordIds } });
  const byId = new Map();
  for (const p of players) {
    const s = await calculateTotalStats(p);
    byId.set(p.discordId, s.force || 0);
  }
  return discordIds.map(id => ({ id, force: byId.get(id) || 0 }));
}

function getDefenseStructuresForces(tile) {
  const fortForce = (tile.fortLevel || 0) * (metrics.faction.territory.fort?.forcePerLevel || 0);
  const armoryAura = tile.building?.type === 'armory'
    ? (tile.building.level || 0) * (metrics.faction.territory.buildings?.armory?.forceAuraPerLevel || 0)
    : 0;
  return { fortForce, armoryAura };
}

// ⬇️ starter is automatically added as an attacker
export async function startAttack(key, attackerFaction, starterDiscordId) {
  const tile = await Territory.findOne({ key });
  if (!tile) throw new Error('Territory not found');
  if (tile.owner === attackerFaction) throw new Error('You already own this tile.');
  if (tile.truceUntil && Date.now() < tile.truceUntil.getTime()) throw new Error('Tile is in truce.');
  if (tile.attack && tile.attack.endAt && Date.now() < tile.attack.endAt.getTime()) {
    throw new Error('Attack already ongoing.');
  }

  // verify starter
  const starter = await Player.findOne({ discordId: starterDiscordId });
  if (!starter?.faction || starter.faction !== attackerFaction) {
    throw new Error('Only members of the attacking faction can start an attack.');
  }
  if (await isPlayerBusy(starterDiscordId)) {
    throw new Error('You are already engaged elsewhere (attack or defense).');
  }

  // max concurrent attacks by the same faction
  const ongoing = await countOngoingAttacks(attackerFaction);
  if (ongoing >= maxConcurrentByFaction()) {
    throw new Error(`Your faction already has ${ongoing} active attacks (limit ${maxConcurrentByFaction()}).`);
  }

  const start = new Date();
  const end   = new Date(start.getTime() + metrics.faction.attack.durationMs);

  tile.attack = {
    attackerFaction,
    startedAt: start,
    endAt: end,
    attackers: [starterDiscordId], // ← add starter
    locked: true
  };
  await tile.save();
  return tile;
}

export async function joinAttack(key, discordId, faction) {
  const tile = await Territory.findOne({ key });
  if (!tile?.attack) throw new Error('No ongoing attack.');
  if (tile.attack.attackerFaction !== faction) throw new Error('Your faction is not attacking this tile.');
  if (tile.attack.attackers.includes(discordId)) return tile; // idempotent

  // cannot be both attacker and defender anywhere
  if (await isPlayerBusy(discordId)) throw new Error('You are already engaged elsewhere (attack or defense).');

  const maxAtk = await getMaxAttackers(tile.owner);
  if (tile.attack.attackers.length >= maxAtk) throw new Error('Attacker slots are full.');

  tile.attack.attackers.push(discordId);
  await tile.save();
  return tile;
}

/**
 * Resolve if attack is due. Optionally send a battle report to CHANNEL_BOT_ID when `client` is provided.
 * Returns null if not due/no attack, otherwise a summary object.
 */
export async function resolveAttackIfDue(key, client = null) {
  const tile = await Territory.findOne({ key });
  if (!tile?.attack) return null;
  if (Date.now() < tile.attack.endAt.getTime()) return null;

  // --- forces BEFORE state changes
  const attackerIds = tile.attack.attackers || [];
  const defenderIds = (tile.defenders || []).map(d => d.discordId);

  const atkList = await getPlayersForces(attackerIds);
  const defList = await getPlayersForces(defenderIds);

  const attackForce  = atkList.reduce((s,a)=>s+a.force,0);
  const defenseForcePlayers = defList.reduce((s,a)=>s+a.force,0);
  const { fortForce, armoryAura } = getDefenseStructuresForces(tile);
  const tileDefense  = calcTileDefenseForce(tile, defenseForcePlayers); // players + fort + armory

  // snapshot structures
  const prevOwner        = tile.owner;
  const prevFortLevel    = tile.fortLevel || 0;
  const prevBType        = tile.building?.type || null;
  const prevBLevel       = tile.building?.level || 0;

  // --- outcome & structure downgrades
  let captured = false;
  let newOwner = tile.owner;
  let captureReward = 0;

  if (attackForce > tileDefense) {
    captured = true;
    newOwner = tile.attack.attackerFaction;

    // reward = value of the last building level (if any), paid to attacker faction treasury
    if (prevBType && prevBLevel > 0) {
      captureReward = buildingUpgradeCost(prevBType, prevBLevel);
      let bank = await FactionBank.findOne({ faction: newOwner });
      if (!bank) bank = await FactionBank.create({ faction: newOwner, treasury: 0 });
      bank.treasury += captureReward;
      await bank.save();
    }

    // change owner + downgrade structures by 1 (min 0)
    tile.owner = newOwner;
    if (tile.building?.level > 0) tile.building.level -= 1;
    if (tile.fortLevel > 0) tile.fortLevel -= 1;
    tile.defenders = []; // reset defenders on capture
  }

  // truce/protection
  const truceMs = metrics?.faction?.attack?.truceMs ?? (48 * 60 * 60 * 1000);
  const truceUntil = new Date(Date.now() + truceMs);

  tile.truceUntil = truceUntil;
  tile.attack = null;
  await tile.save();

  // --- optional battle report
  if (client && process.env.CHANNEL_BOT_ID) {
    try {
      const ch = await client.channels.fetch(process.env.CHANNEL_BOT_ID);
      if (ch?.isTextBased()) {
        const unix = Math.floor(truceUntil.getTime() / 1000);

        const attackersLines = atkList.length
          ? atkList.map(a => `• <@${a.id}> — **${a.force}**`).join('\n')
          : '_None_';

        const defendersLines = defList.length
          ? defList.map(a => `• <@${a.id}> — **${a.force}**`).join('\n')
          : '_None_';

        const defenseBreakdown =
          `Players **${defenseForcePlayers}** + Fort **${fortForce}** + Armory **${armoryAura}** = **${tileDefense}**`;

        const afterBLevel  = (tile.building?.type === prevBType) ? (tile.building?.level || 0) : 0;
        const afterFort    = tile.fortLevel || 0;

        const bBeforeStr = prevBType ? `${prevBType} L${prevBLevel}` : 'none';
        const bAfterStr  = prevBType
          ? (afterBLevel > 0 ? `${prevBType} L${afterBLevel}` : 'destroyed')
          : 'none';

        const rewardStr = captured && captureReward > 0
          ? `\n**Capture reward** → **${newOwner}** treasury **+${captureReward}** (value of last building level).`
          : '';

        const embed = createEmbed({
          title: `⚔️ Battle resolved — ${key}`,
          description:
            `**Attacker**: **${tile.owner === newOwner && captured ? newOwner : (tile.attack?.attackerFaction || newOwner)}** vs **Defender**: **${prevOwner}**\n\n` +
            `**Result**: ${captured ? `✅ **${newOwner}** captured the tile!` : `🛡️ **${prevOwner}** held the line.`}\n` +
            `**Protection**: ${Math.round(truceMs/3600000)}h — until <t:${unix}:f> (<t:${unix}:R>)\n` +
            rewardStr
        });

        embed.addFields(
          { name: `Attackers — Total **${attackForce}**`, value: attackersLines },
          { name: `Defenders — ${defenseBreakdown}`, value: defendersLines },
          {
            name: 'Structures',
            value:
              `• Building: **${bBeforeStr}** → **${bAfterStr}**\n` +
              `• Fortifications: **L${prevFortLevel}** → **L${afterFort}**`
          }
        );

        await ch.send({ embeds: [embed] });
      }
    } catch (e) {
      console.error('Failed to send battle report:', e);
    }
  }

  return {
    captured,
    attackForce,
    defense: {
      total: tileDefense,
      players: defenseForcePlayers,
      fort: fortForce,
      armory: armoryAura
    },
    owner: newOwner,
    prevOwner,
    truceUntil,
    captureReward,
    attackers: atkList,
    defenders: defList,
    structures: {
      buildingBefore: { type: prevBType, level: prevBLevel },
      buildingAfter: { type: tile.building?.type || null, level: tile.building?.level || 0 },
      fortBefore: prevFortLevel,
      fortAfter: tile.fortLevel || 0
    }
  };
}

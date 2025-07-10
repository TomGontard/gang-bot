// src/commands/guide.js
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../utils/createEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('guide')
  .setDescription('Read the full GangBot game rules and mechanics.');

export async function execute(interaction) {
  const fields = [
    {
      name: '1️⃣ Eligibility',
      value:
        '- Only Discord users holding at least **1 Genesis Pass NFT** can play.\n' +
        '- Each player must link their wallet before playing.'
    },
    {
      name: '2️⃣ Starting Stats',
      value:
        '- **HP**: 100\n' +
        '- **XP**: 0\n' +
        '- **Coins**: 0\n' +
        '- **Attributes**: 5 points each in Vitality, Wisdom, Strength, Intelligence, Luck, Agility\n' +
        '- **Unassigned Points**: 0 (earn 10 per level)'
    },
    {
      name: '3️⃣ NFTs & Boosts',
      value:
        '- Holding NFTs allows you to run missions (lock one NFT per mission).\n' +
        '- Max **3 concurrent missions** by default.\n' +
        '- **Boosts** by NFT count:\n' +
        '   • 1 NFT: no boost\n' +
        '   • 2 NFTs: +5% XP, +10% Coins\n' +
        '   • 3–4 NFTs: +10% XP, +15% Coins\n' +
        '   • 5+ NFTs: +20% XP, +25% Coins'
    },
    {
      name: '4️⃣ Level & Attributes',
      value:
        '- Each **level** grants **10 attribute points**.\n' +
        '- Attributes costs and effects:\n' +
        '   • Vitality: 2 pts, +1 HP max/pt.\n' +
        '   • Wisdom: 2 pts, +1% XP/pt.\n' +
        '   • Strength: 1 pt, +combat power.\n' +
        '   • Intelligence: 1 pt, +1% heal speed/pt.\n' +
        '   • Luck: 1 pt, +1% extra coin chance/pt.\n' +
        '   • Agility: 1 pt, reduces HP loss.'
    },
    {
      name: '5️⃣ Healing',
      value:
        '- Recover **1 HP/hour** (+Intelligence%).\n' +
        '- Launch with the Healing menu and click buttons to start/stop.'
    },
    {
      name: '6️⃣ Missions (Solo)',
      value:
        '- Launch with the Missions menu and click buttons to start a mission.\n' +
        '- HP cost deducted at start.' +
        '- Success grants XP & Coins.\n' +
        '- Attributes influence costs and rewards.'
    },
    {
      name: '7️⃣ Faction Wars **(not implemented)**',
      value:
        '- PvP duels between factions.\n' +
        '- Win for XP/Coins, boosts for faction.'
    },
    {
      name: '8️⃣ Raids (Weekly) **(not implemented)**',
      value:
        '- Collaborative PvPvE events.\n' +
        '- Deal damage via `/raid`, tally per faction.\n' +
        '- Rewards for participation and victory.'
    },
    {
      name: '📣 Tips',
      value:
        '- Balance attributes for your playstyle.\n' +
        '- Heal strategically to avoid downtime.\n' +
        '- Check `/profile` often for status.\n' +
        '- Watch for faction events. **(not implemented)**'
    }
  ];

  const embed = createEmbed({
    title: '📜 GangBot Game Guide',
    description: 'Full rules and mechanics overview:',
    fields,
    color: 0xFFA500,
    interaction
  });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

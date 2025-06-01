// src/commands/guide.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('guide')
  .setDescription('Read the full Bandit game rules and mechanics (in English).');

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('📜 Bandit Game Guide')
    .setDescription('All rules and mechanics')
    .addFields(
      { name: '1️⃣ Eligibility',
        value:
          '- Only Discord users holding at least **1 Genesis Pass NFT** can play.\n' +
          '- Each player must link their wallet in advance (using `/wallet`) before playing.'
      },
      { name: '2️⃣ Starting Stats',
        value:
          '- **HP**: 100\n' +
          '- **XP**: 0\n' +
          '- **Coins**: 0\n' +
          '- **Attributes**: 5 points each in Vitality, Wisdom, Strength, Intelligence, Luck, Agility\n' +
          '- **Unassigned Points**: 0 (earn 10 per level)'
      },
      { name: '3️⃣ NFTs & Boosts',
        value:
          '- Holding NFTs lets you start missions. Each NFT is “locked” while on a mission.\n' +
          '- You can “lock” up to **3 NFTs** (i.e. run up to 3 concurrent missions). That is the **max**.\n' +
          '- **Boosts** by NFT held count:\n' +
          '   • 1 NFT: normal (no boost)\n' +
          '   • 2 NFTs: +5% XP, +10% Coins\n' +
          '   • 3–4 NFTs: +10% XP, +15% Coins\n' +
          '   • 5+ NFTs: +20% XP, +25% Coins\n'
      },
      { name: '4️⃣ Level & Attribute System',
        value:
          '- Each **level** grants **10 attribute points** to spend.\n' +
          '- **Raising attributes**:\n' +
          '   • Vitality: costs **2 points** per +1; adds +1 HP max per point.\n' +
          '   • Wisdom: costs **2 points** per +1; adds +1% XP gain per point.\n' +
          '   • Strength: costs **1 point**; increases power in gang wars.\n' +
          '   • Intelligence: costs **1 point**; +1% healing speed per point (1 HP/hour base).\n' +
          '   • Luck: costs **1 point**; boosts chance for extra coins in missions.\n' +
          '   • Agility: costs **1 point**; reduces HP lost during missions.'
      },
      { name: '5️⃣ Healing (`/heal`)',
        value:
          '- **Entering healing**: you recover **1 HP per hour**.\n' +
          '- While healing, you cannot start any mission.\n' +
          '- To begin/stop healing, use `/heal` and click the button.\n' +
          '- If you cancel healing, you gain all HP for the hours spent healing (capped by HP max).'
      },
      { name: '6️⃣ Missions (Solo PvE)',
        value:
          '- Start a mission with `/mission type:<missionName>`.\n' +
          '- Each mission costs some HP if you fail; success grants XP & Coins.\n' +
          '- Luck reduces failure chance; Agility reduces HP loss on failure.\n' +
          '- While on a mission (`inExpedition = true`), you cannot heal.'
      },
      { name: '7️⃣ Faction Wars (PvP)',
        value:
          '- Once implemented, players can challenge an opponent in the rival faction.\n' +
          '- Victory in a duel grants XP & Coins; losing may cost some XP.\n' +
          '- Faction scores accumulate over a war event; the winning faction gets bonuses.'
      },
      { name: '8️⃣ Raids (PvPvE Weekly)',
        value:
          '- Each week, both factions face a common “boss” event.\n' +
          '- Players “deal damage” via `/raid`, and total damage is tallied per faction.\n' +
          '- Winning faction members receive XP/Coins bonus; participation always grants a baseline.\n' +
          '- Up to 3 concurrent raid participations if you hold ≥3 NFTs.'
      },
      { name: '📣 Tips',
        value:
          '- Distribute attributes wisely (e.g. high Vitality for tank builds, Luck for farming coins).\n' +
          '- Healing at strategic times keeps you in the game longer without risking K.O.\n' +
          '- Use `/profile` often to track XP, Coins, NFT count & boosts.\n' +
          '- Read faction announcements to know when wars/raids start.'
      }
    )
    .setFooter({ text: 'Bandit — Powered by Discord.js & MongoDB' })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

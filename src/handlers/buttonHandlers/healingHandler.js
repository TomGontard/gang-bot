// src/handlers/buttonHandlers/healingHandler.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../../data/models/Player.js';
import { createEmbed } from '../../utils/createEmbed.js';

export default async function healingHandler(interaction) {
  const [action, discordId] = interaction.customId.split(':');

  // 🛡️ Security
  if (interaction.user.id !== discordId) {
    return interaction.reply({ content: '❌ You cannot control another user’s healing.', ephemeral: true });
  }

  // load or create
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  const intStat     = player.attributes.intelligence || 0;
  const boostFactor = 1 + intStat / 100;
  const healDesc    = `Recover **5 HP per hour** (+${intStat}% from Intelligence).`;

  // 1️⃣ OPEN MENU — first & only reply()
  if (action === 'openHealing') {
    const embed = createEmbed({
      title: player.healing ? '🛌 Healing In Progress' : '💉 Healing Menu',
      description: player.healing
        ? `Healing since <t:${Math.floor(player.healStartAt.getTime() / 1000)}:R>.`
        : healDesc,
      fields: [{ name: 'HP', value: `${player.hp}/${player.hpMax}`, inline: true }],
      color: player.healing ? 0x00ff00 : 0xff9900,
      interaction
    });

    const btn = new ButtonBuilder()
      .setCustomId(player.healing ? `stopHealing:${discordId}` : `startHealing:${discordId}`)
      .setLabel(player.healing ? 'Stop Healing' : 'Start Healing')
      .setStyle(player.healing ? ButtonStyle.Danger : ButtonStyle.Success);

    return interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(btn)],
      ephemeral: true
    });
  }

  // 🚧 All other steps edit the same message via update()

  // 2️⃣ START HEALING
  if (action === 'startHealing') {
    if (!player.healing) {
      player.healing     = true;
      player.healStartAt = new Date();
      await player.save();
    }

    const embed = createEmbed({
      title: '🛌 Healing Started',
      description: healDesc,
      fields: [
        { name: 'HP',    value: `${player.hp}/${player.hpMax}`, inline: true },
        { name: 'Since', value: `<t:${Math.floor(player.healStartAt.getTime() / 1000)}:R>`, inline: true }
      ],
      interaction
    });

    const btn = new ButtonBuilder()
      .setCustomId(`stopHealing:${discordId}`)
      .setLabel('Stop Healing')
      .setStyle(ButtonStyle.Danger);

    return interaction.update({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(btn)]
    });
  }

  // 3️⃣ STOP HEALING
  if (action === 'stopHealing') {
    let hpGained = 0;
    if (player.healing && player.healStartAt) {
      const now    = Date.now();
      // 10-minute blocks
      const blocks = Math.floor((now - player.healStartAt.getTime()) / 720_000);
      const rawHp  = Math.floor(blocks * boostFactor);
      hpGained     = Math.min(player.hpMax - player.hp, rawHp);

      player.hp          += hpGained;
      player.healing     = false;
      player.healStartAt = null;
      await player.save();
    }

    const embed = createEmbed({
      title: '✅ Healing Completed',
      description: `You regained **${hpGained} HP** over your healing session.`,
      fields: [{ name: 'HP', value: `${player.hp}/${player.hpMax}`, inline: true }],
      interaction
    });

    // offer to continue if not fully healed
    const rows = [];
    if (player.hp < player.hpMax) {
      const contBtn = new ButtonBuilder()
        .setCustomId(`startHealing:${discordId}`)
        .setLabel('Continue Healing')
        .setStyle(ButtonStyle.Success);
      rows.push(new ActionRowBuilder().addComponents(contBtn));
    }

    return interaction.update({
      embeds: [embed],
      components: rows
    });
  }
}

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../../data/models/Player.js';
import { calculateTotalStats } from '../../services/itemService.js';
import { createEmbed } from '../../utils/createEmbed.js';

export default async function healingHandler(interaction) {
  const [action, discordId] = interaction.customId.split(':');

  if (interaction.user.id !== discordId) {
    return interaction.reply({ content: '❌ You cannot control another user’s healing.', ephemeral: true });
  }

  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  const totalStats = await calculateTotalStats(player);
  const intStat = totalStats.intelligence || 0;
  const boostFactor = 1 + intStat / 100;
  const healPerHour = boostFactor * 5;
  const healDesc = `Recover **5 HP/hour** (+${intStat}% from Intelligence → **${healPerHour.toFixed(1)} HP/h**).`;

  // ───── OPEN HEALING MENU ─────
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

  // ───── START HEALING ─────
  if (action === 'startHealing') {
    if (!player.healing) {
      player.healing = true;
      player.healStartAt = new Date();
      await player.save();
    }

    const embed = createEmbed({
      title: '🛌 Healing Started',
      description: healDesc,
      fields: [
        { name: 'HP', value: `${player.hp}/${player.hpMax}`, inline: true },
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

  // ───── STOP HEALING ─────
  if (action === 'stopHealing') {
      let hpGained = 0;

      if (player.healing && player.healStartAt) {
        const now = Date.now();
        const blocks = Math.floor((now - player.healStartAt.getTime()) / 720_000); // 12 min blocks
        const healPerBlock = healPerHour; // 5 blocks per hour
        const rawHp = Math.floor(blocks * healPerBlock / 5);

        hpGained = Math.min(player.hpMax - player.hp, rawHp);

        player.hp += hpGained;
        player.healing = false;
        player.healStartAt = null;
        await player.save();
      }

    const embed = createEmbed({
      title: '✅ Healing Completed',
      description: `You regained **${hpGained} HP** over your healing session.`,
      fields: [{ name: 'HP', value: `${player.hp}/${player.hpMax}`, inline: true }],
      interaction
    });

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

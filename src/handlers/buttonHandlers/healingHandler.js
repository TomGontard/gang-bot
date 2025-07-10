// src/handlers/buttonHandlers/healingHandler.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../../data/models/Player.js';
import { createEmbed } from '../../utils/createEmbed.js';

export default async function healingHandler(interaction) {
  const [action, targetId] = interaction.customId.split(':');
  if (interaction.user.id !== targetId) {
    return interaction.reply({ content: '❌ You cannot control another user’s healing.', ephemeral: true });
  }

  const discordId = interaction.user.id;
  const player = await Player.findOne({ discordId });
  if (!player) {
    return interaction.reply({ content: '❌ Player not found.', ephemeral: true });
  }

  const intStat = player.attributes.intelligence || 0;
  const boostFactor = 1 + intStat / 100;
  const healRateDesc = `Recover **1 HP per hour** (+${intStat}% from Intelligence).`;

  // OPEN HEALING MENU
  if (action === 'openHealing') {
    const title = player.healing ? '🛌 Healing In Progress' : '💉 Healing Menu';
    const description = player.healing
      ? `You have been healing since <t:${Math.floor(player.healStartAt.getTime() / 1000)}:R>.`
      : healRateDesc;
    const fields = [
      { name: 'Current HP', value: `${player.hp}/${player.hpMax}`, inline: true }
    ];
    const color = player.healing ? 0x00ff00 : 0xff9900;

    const embed = createEmbed({ title, description, fields, color, interaction });

    const button = new ButtonBuilder()
      .setCustomId(player.healing ? `stopHealing:${discordId}` : `startHealing:${discordId}`)
      .setLabel(player.healing ? 'Stop Healing' : 'Start Healing')
      .setStyle(player.healing ? ButtonStyle.Danger : ButtonStyle.Success);
    const row = new ActionRowBuilder().addComponents(button);

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // START HEALING
  if (action === 'startHealing') {
    if (player.healing) {
      return interaction.reply({ content: '🔄 You are already in healing mode.', ephemeral: true });
    }
    player.healing = true;
    player.healStartAt = new Date();
    await player.save();

    const title = '🛌 Healing Mode Activated';
    const description = healRateDesc;
    const fields = [
      { name: 'Current HP', value: `${player.hp}/${player.hpMax}`, inline: true },
      { name: 'Healing Since', value: `<t:${Math.floor(player.healStartAt.getTime() / 1000)}:R>`, inline: true }
    ];
    const embed = createEmbed({ title, description, fields, interaction });

    const stopBtn = new ButtonBuilder()
      .setCustomId(`stopHealing:${discordId}`)
      .setLabel('Stop Healing')
      .setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(stopBtn);

    return interaction.update({ embeds: [embed], components: [row] });
  }

  // STOP HEALING
  if (action === 'stopHealing') {
    if (!player.healing || !player.healStartAt) {
      return interaction.reply({ content: '❌ You are not currently healing.', ephemeral: true });
    }
    const now = new Date();
    const elapsedMs = now.getTime() - new Date(player.healStartAt).getTime();
    const hoursHealed = Math.floor(elapsedMs / 3_600_000);
    const rawHp = Math.floor(hoursHealed * boostFactor);
    const hpGained = Math.min(rawHp, player.hpMax - player.hp);

    player.hp += hpGained;
    player.healing = false;
    player.healStartAt = null;
    await player.save();

    const title = '✅ Healing Completed';
    const description =
      `You have stopped healing and regained **${hpGained} HP** over ${hoursHealed} hour(s)\n` +
      `(${intStat}% bonus from Intelligence).`;
    const fields = [
      { name: 'Current HP', value: `${player.hp}/${player.hpMax}`, inline: true }
    ];
    const embed = createEmbed({ title, description, fields, interaction });

    const components = [];
    if (player.hp < player.hpMax) {
      const continueBtn = new ButtonBuilder()
        .setCustomId(`startHealing:${discordId}`)
        .setLabel('Continue Healing')
        .setStyle(ButtonStyle.Success);
      components.push(new ActionRowBuilder().addComponents(continueBtn));
    }

    return interaction.update({ embeds: [embed], components });
  }
}

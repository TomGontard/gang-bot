// src/handlers/buttonHandlers/healingHandler.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../../data/models/Player.js';
import { createEmbed } from '../../utils/createEmbed.js';

export default async function healingHandler(interaction) {
  const [action, targetId] = interaction.customId.split(':');

  // Seul le lanceur initial peut interagir
  if (interaction.user.id !== targetId) {
    return interaction.reply({ content: '❌ You cannot control another user’s healing.', ephemeral: true });
  }

  const discordId = targetId;
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  const intStat = player.attributes.intelligence || 0;
  const boostFactor = 1 + intStat / 100; // +1% par point d'INT
  const healRateDesc = `Recover **5 HP per hour** (+${intStat}% from Intelligence).`;

  // 1) OUVERTURE DU MENU DE SOIN
  if (action === 'openHealing') {
    const title = player.healing ? '🛌 Healing In Progress' : '💉 Healing Menu';
    const description = player.healing
      ? `You have been healing since <t:${Math.floor(player.healStartAt.getTime() / 1000)}:R>.`
      : healRateDesc;

    const embed = createEmbed({
      title,
      description,
      fields: [{ name: 'Current HP', value: `${player.hp}/${player.hpMax}`, inline: true }],
      color: player.healing ? 0x00ff00 : 0xff9900,
      interaction
    });

    const toggleBtn = new ButtonBuilder()
      .setCustomId(player.healing ? `stopHealing:${discordId}` : `startHealing:${discordId}`)
      .setLabel(player.healing ? 'Stop Healing' : 'Start Healing')
      .setStyle(player.healing ? ButtonStyle.Danger : ButtonStyle.Success);

    return interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(toggleBtn)],
      ephemeral: true
    });
  }

  // 2) DÉMARRER LE SOIN
  if (action === 'startHealing') {
    if (player.healing) {
      return interaction.reply({ content: '🔄 You are already in healing mode.', ephemeral: true });
    }

    player.healing = true;
    player.healStartAt = new Date();
    await player.save();

    const embed = createEmbed({
      title: '🛌 Healing Mode Activated',
      description: healRateDesc,
      fields: [
        { name: 'Current HP', value: `${player.hp}/${player.hpMax}`, inline: true },
        { name: 'Healing Since', value: `<t:${Math.floor(player.healStartAt.getTime() / 1000)}:R>`, inline: true }
      ],
      interaction
    });

    const stopBtn = new ButtonBuilder()
      .setCustomId(`stopHealing:${discordId}`)
      .setLabel('Stop Healing')
      .setStyle(ButtonStyle.Danger);

    return interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(stopBtn)],
      ephemeral: true
    });
  }

  // 3) ARRÊTER LE SOIN
  if (action === 'stopHealing') {
    if (!player.healing || !player.healStartAt) {
      return interaction.reply({ content: '❌ You are not currently healing.', ephemeral: true });
    }

    const now = new Date();
    const hoursHealed = Math.floor((now - player.healStartAt) / 3_600_000);
    // 5 HP/heure * bonus INT
    const rawHp = Math.floor(hoursHealed * 5 * boostFactor);
    const hpGained = Math.min(rawHp, player.hpMax - player.hp);

    player.hp += hpGained;
    player.healing = false;
    player.healStartAt = null;
    await player.save();

    const embed = createEmbed({
      title: '✅ Healing Completed',
      description:
        `You have stopped healing and regained **${hpGained} HP** over ${hoursHealed} hour(s)\n` +
        `(${intStat}% bonus from Intelligence).`,
      fields: [{ name: 'Current HP', value: `${player.hp}/${player.hpMax}`, inline: true }],
      interaction
    });

    // Proposition de continuer si pas full HP
    const components = [];
    if (player.hp < player.hpMax) {
      const contBtn = new ButtonBuilder()
        .setCustomId(`startHealing:${discordId}`)
        .setLabel('Continue Healing')
        .setStyle(ButtonStyle.Success);
      components.push(new ActionRowBuilder().addComponents(contBtn));
    }

    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true
    });
  }
}

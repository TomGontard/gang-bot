import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../../data/models/Player.js';
import { createEmbed } from '../../utils/createEmbed.js';

export default async function healingHandler(interaction) {
  const [action, discordId] = interaction.customId.split(':');

  if (interaction.user.id !== discordId) {
    return interaction.reply({ content: '❌ You cannot control another user’s healing.', ephemeral: true });
  }

  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  const intStat = player.attributes.intelligence || 0;
  const healDesc = `Recover **5 HP per hour** (+${intStat}% Intelligence).`;

  // OPEN
  if (action === 'openHealing') {
    const embed = createEmbed({
      title: player.healing ? '🛌 Healing In Progress' : '💉 Healing Menu',
      description: player.healing
        ? `Healing since <t:${Math.floor(player.healStartAt/1000)}:R>.`
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

  // START HEAL
  if (action === 'startHealing') {
    if (player.healing) {
      return interaction.reply({ content: '🔄 Already healing.', ephemeral: true });
    }
    player.healing = true;
    player.healStartAt = new Date();
    await player.save();

    const embed = createEmbed({
      title: '🛌 Healing Started',
      description: healDesc,
      fields: [
        { name: 'HP', value: `${player.hp}/${player.hpMax}`, inline: true },
        { name: 'Since', value: `<t:${Math.floor(player.healStartAt/1000)}:R>`, inline: true }
      ],
      interaction
    });
    const btn = new ButtonBuilder()
      .setCustomId(`stopHealing:${discordId}`)
      .setLabel('Stop Healing')
      .setStyle(ButtonStyle.Danger);
    return interaction.reply({ embeds:[embed], components:[new ActionRowBuilder().addComponents(btn)], ephemeral:true });
  }

  // STOP HEAL
  if (action === 'stopHealing') {
    if (!player.healing || !player.healStartAt) {
      return interaction.reply({ content: '❌ Not healing.', ephemeral: true });
    }
    const hours = Math.floor((Date.now() - player.healStartAt.getTime()) / 3_600_000);
    const gained = Math.min(player.hpMax - player.hp, Math.floor(hours * 5 * (1 + intStat/100)));
    player.hp += gained;
    player.healing = false;
    player.healStartAt = null;
    await player.save();

    const embed = createEmbed({
      title: '✅ Healing Completed',
      description: `Gained **${gained} HP** over ${hours} hour(s).`,
      fields: [{ name:'HP', value:`${player.hp}/${player.hpMax}`, inline:true }],
      interaction
    });

    const contBtn = player.hp < player.hpMax
      ? new ButtonBuilder().setCustomId(`startHealing:${discordId}`).setLabel('Continue').setStyle(ButtonStyle.Success)
      : null;

    return interaction.reply({
      embeds: [embed],
      components: contBtn ? [new ActionRowBuilder().addComponents(contBtn)] : [],
      ephemeral: true
    });
  }
}

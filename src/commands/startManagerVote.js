import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { startFactionManagerVote } from '../services/managerService.js';

export const data = new SlashCommandBuilder()
  .setName('start_manager_vote')
  .setDescription('Start a 24h manager election in the faction channel (admin only).')
  .addStringOption(o=>o.setName('faction')
    .setDescription('Faction')
    .setRequired(true)
    .addChoices(
      { name:'Red',   value:'Red' },
      { name:'Blue',  value:'Blue' },
      { name:'Green', value:'Green' }
    ))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction){
  const faction = interaction.options.getString('faction', true);
  try{
    const { channelId } = await startFactionManagerVote(interaction.client, interaction.guild, faction);
    return interaction.editReply({ content: `🗳️ Vote started in <#${channelId}> for **${faction}**.` });
  }catch(e){
    return interaction.editReply({ content:`❌ ${e.message}` });
  }
}

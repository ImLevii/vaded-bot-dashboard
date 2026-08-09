import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import songinfoCommand from './songinfo'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('<a:music:741605543046807626> Show what\'s currently playing'),
    category: 'music',
    execute: songinfoCommand.execute,
})

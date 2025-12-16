// --- Initial Setup & Imports ---
const { 
    Client, GatewayIntentBits, Collection, REST, Routes, 
    SlashCommandBuilder, PermissionFlagsBits, ActivityType, 
    EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, 
    ChannelType 
} = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const express = require('express');

// Load environment variables from .env
dotenv.config(); 

// --- Keep-Alive Server ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => console.log(`Keep-alive server running on port ${PORT}`));


// --- Bot Configuration ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           
        GatewayIntentBits.GuildMessages,    
        GatewayIntentBits.MessageContent,   
        GatewayIntentBits.GuildMembers      
    ],
});

client.commands = new Collection();


// ==========================================================
//              COMMAND DATA DEFINITIONS
// ==========================================================

// --- 1. /embed Command (Studio) ---
const embedCommand = {
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Launches the Embed Studio modal to create and send a custom rich embed.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), 
    
    async execute(interaction) {
        // Create the Modal
        const modal = new ModalBuilder()
            .setCustomId('embedStudioModal')
            .setTitle('🎨 Embed Studio');

        // Create the Text Inputs
        const titleInput = new TextInputBuilder().setCustomId('embedTitleInput').setLabel("Embed Title (Optional)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(256);
        const descriptionInput = new TextInputBuilder().setCustomId('embedDescriptionInput').setLabel("Embed Description (Required)").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000);
        const colorInput = new TextInputBuilder().setCustomId('embedColorInput').setLabel("Hex Color (e.g., #0099FF)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7);
        const channelInput = new TextInputBuilder().setCustomId('embedChannelInput').setLabel("Target Channel ID (Where to send)").setPlaceholder("e.g., 123456789012345678").setStyle(TextInputStyle.Short).setRequired(true);
        const footerInput = new TextInputBuilder().setCustomId('embedFooterInput').setLabel("Footer Text (Optional)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2048);


        // Add inputs to the modal using ActionRows
        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(colorInput),
            new ActionRowBuilder().addComponents(channelInput),
            new ActionRowBuilder().addComponents(footerInput),
        );

        await interaction.showModal(modal);
    },
};
client.commands.set(embedCommand.data.name, embedCommand);


// --- 2. /mod Command (Kick, Ban, Purge, Warn) ---
const modCommand = {
    data: new SlashCommandBuilder()
        .setName('mod')
        .setDescription('Moderation commands for admins.')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers) 

        // KICK Subcommand
        .addSubcommand(subcommand =>
            subcommand.setName('kick').setDescription('Kicks a user from the server.')
                .addUserOption(option => option.setName('target').setDescription('The member to kick.').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('The reason for the kick.').setRequired(false)))
        
        // BAN Subcommand
        .addSubcommand(subcommand =>
            subcommand.setName('ban').setDescription('Bans a user from the server.')
                .addUserOption(option => option.setName('target').setDescription('The member to ban.').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('The reason for the ban.').setRequired(false)))
        
        // PURGE Subcommand (FIXED: Removed setDefaultMemberPermissions from subcommand)
        .addSubcommand(subcommand =>
            subcommand.setName('purge').setDescription('Bulk deletes a specified number of messages (up to 100).')
                .addIntegerOption(option => option.setName('amount').setDescription('Number of messages to delete (1-100).').setRequired(true).setMinValue(1).setMaxValue(100)))
        
        // WARN Subcommand
        .addSubcommand(subcommand =>
            subcommand.setName('warn').setDescription('Issues a formal warning to a user (sends DM).')
                .addUserOption(option => option.setName('target').setDescription('The member to warn.').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('The reason for the warning.').setRequired(true))),


    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');
        
        // Handle Purge separately as it doesn't use a target user/member
        if (subcommand === 'purge') {
            const amount = interaction.options.getInteger('amount');

            // Explicit permission check for purge (since perm wasn't set on subcommand builder)
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return interaction.reply({ content: '❌ You need the `Manage Messages` permission to use this command.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                // Fetch and delete messages
                const fetched = await interaction.channel.messages.fetch({ limit: amount });
                const deleted = await interaction.channel.bulkDelete(fetched, true);

                return interaction.editReply({ content: `✅ Successfully deleted **${deleted.size}** messages.` });
            } catch (error) {
                console.error("Purge Error:", error);
                return interaction.editReply({ content: `❌ Failed to delete messages: ${error.message}` });
            }
        }
        
        // Handle Kick, Ban, Warn
        const targetMember = targetUser ? interaction.guild.members.cache.get(targetUser.id) : null;
        
        if (subcommand !== 'ban' && !targetMember) {
            return interaction.reply({ content: `❌ Could not find **${targetUser.tag}** in this server.`, ephemeral: true });
        }
        
        const successEmbed = new EmbedBuilder().setColor(0x00FF00).setTimestamp().setFooter({ text: `Moderator: ${interaction.user.tag}` });
        
        try {
            if (subcommand === 'kick') {
                if (!targetMember.kickable) return interaction.reply({ content: `❌ I cannot kick ${targetUser.tag}.`, ephemeral: true });
                await targetMember.kick(reason || 'No reason provided.');
                successEmbed.setTitle(`🚪 Member Kicked`).setDescription(`**Target:** ${targetUser.tag}\n**Reason:** ${reason || 'No reason provided.'}`);
                await interaction.reply({ embeds: [successEmbed] });
            
            } else if (subcommand === 'ban') {
                if (!targetMember.bannable) return interaction.reply({ content: `❌ I cannot ban ${targetUser.tag}.`, ephemeral: true });
                await interaction.guild.members.ban(targetUser, { reason: reason || 'No reason provided.' });
                successEmbed.setTitle(`🔨 Member Banned`).setDescription(`**Target:** ${targetUser.tag}\n**Reason:** ${reason || 'No reason provided.'}`);
                await interaction.reply({ embeds: [successEmbed] });

            } else if (subcommand === 'warn') {
                const dmEmbed = new EmbedBuilder()
                    .setTitle("⚠️ Server Warning Issued")
                    .setDescription(`You have received a warning in **${interaction.guild.name}**.\n\n**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}`)
                    .setColor(0xFFFF00)
                    .setTimestamp();
                
                await targetUser.send({ embeds: [dmEmbed] }).catch(() => {
                    console.log(`Could not DM ${targetUser.tag}`);
                }); // Attempt to DM, ignore failure
                
                successEmbed.setTitle(`🔔 Member Warned`).setDescription(`**Target:** ${targetUser.tag}\n**Reason:** ${reason}`);
                await interaction.reply({ embeds: [successEmbed] });
            }

        } catch (error) {
            console.error(`Moderation command failed: ${error}`);
            const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ Failed to execute action: \`${error.message}\``);
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
};
client.commands.set(modCommand.data.name, modCommand);


// --- 3. /timeout Command ---
const timeoutCommand = {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeouts (mutes) a user for a specified duration.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option.setName('target').setDescription('The member to timeout.').setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration').setDescription('Duration in minutes (e.g., 60 for 1 hour).').setRequired(true))
        .addStringOption(option =>
            option.setName('reason').setDescription('The reason for the timeout.').setRequired(false)),
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const durationMinutes = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const durationMs = durationMinutes * 60 * 1000;
        const targetMember = interaction.guild.members.cache.get(targetUser.id);

        if (!targetMember) return interaction.reply({ content: `❌ Could not find **${targetUser.tag}** in this server.`, ephemeral: true });
        if (!targetMember.moderatable) return interaction.reply({ content: `❌ I cannot timeout ${targetUser.tag}.`, ephemeral: true });
        
        await targetMember.timeout(durationMs, reason);

        const successEmbed = new EmbedBuilder()
            .setTitle('⏳ Member Timed Out')
            .setDescription(`**Target:** ${targetUser.tag}\n**Duration:** ${durationMinutes} minutes\n**Reason:** ${reason}`)
            .setColor(0xFFA500)
            .setTimestamp();
        
        await interaction.reply({ embeds: [successEmbed] });
    }
};
client.commands.set(timeoutCommand.data.name, timeoutCommand);


// --- 4. /lock and /unlock Commands ---
const lockCommand = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Locks the current channel for @everyone.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    async execute(interaction) {
        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.cache.find(r => r.name === '@everyone');

        try {
            await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
            const embed = new EmbedBuilder().setTitle('🔒 Channel Locked').setDescription(`This channel has been locked by ${interaction.user}.`).setColor(0xFF0000).setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            await interaction.reply({ content: `❌ Failed to lock channel: ${error.message}`, ephemeral: true });
        }
    }
};
client.commands.set(lockCommand.data.name, lockCommand);

const unlockCommand = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlocks the current channel for @everyone.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    async execute(interaction) {
        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.cache.find(r => r.name === '@everyone');

        try {
            await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: true });
            const embed = new EmbedBuilder().setTitle('🔓 Channel Unlocked').setDescription(`This channel has been unlocked by ${interaction.user}.`).setColor(0x00FF00).setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            await interaction.reply({ content: `❌ Failed to unlock channel: ${error.message}`, ephemeral: true });
        }
    }
};
client.commands.set(unlockCommand.data.name, unlockCommand);


// --- 5. /poll Command ---
const pollCommand = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Creates a simple yes/no reaction poll.')
        .addStringOption(option => 
            option.setName('question').setDescription('The question for the poll.').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

    async execute(interaction) {
        const question = interaction.options.getString('question');

        const embed = new EmbedBuilder()
            .setTitle(`📊 Poll: ${question}`)
            .setDescription(`React with ✅ for **Yes** or ❌ for **No**.\n\n*Created by ${interaction.user.tag}*`)
            .setColor(0x3498DB)
            .setTimestamp();

        const message = await interaction.reply({ embeds: [embed], fetchReply: true });
        await message.react('✅');
        await message.react('❌');
    }
};
client.commands.set(pollCommand.data.name, pollCommand);


// --- 6. /serverinfo Command ---
const serverInfoCommand = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Displays detailed information about the server.'),
    
    async execute(interaction) {
        const { guild } = interaction;
        const owner = await guild.fetchOwner();
        
        const infoEmbed = new EmbedBuilder()
            .setTitle(`🏛️ Server Information: ${guild.name}`)
            .setColor(0x1ABC9C)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: 'Owner', value: `${owner.user.tag}`, inline: true },
                { name: 'Members', value: `${guild.memberCount}`, inline: true },
                { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
                { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
                { name: 'Created On', value: `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:f>`, inline: false },
                { name: 'ID', value: `${guild.id}`, inline: false }
            )
            .setFooter({ text: `Boosts: ${guild.premiumSubscriptionCount || 0}` })
            .setTimestamp();
            
        await interaction.reply({ embeds: [infoEmbed] });
    }
};
client.commands.set(serverInfoCommand.data.name, serverInfoCommand);


// --- 7. /userinfo Command ---
const userInfoCommand = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Displays detailed information about a user.')
        .addUserOption(option => 
            option.setName('target').setDescription('The user to get info about.').setRequired(false)),
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('target') || interaction.user;
        const targetMember = interaction.guild.members.cache.get(targetUser.id);
        
        const infoEmbed = new EmbedBuilder()
            .setTitle(`👤 User Information: ${targetUser.tag}`)
            .setColor(targetMember?.displayColor || 0x2ECC71)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: 'Joined Discord', value: `<t:${Math.floor(targetUser.createdAt.getTime() / 1000)}:f>`, inline: false },
                { name: 'Joined Server', value: `<t:${Math.floor(targetMember.joinedAt.getTime() / 1000)}:f>`, inline: false },
                { name: 'ID', value: `${targetUser.id}`, inline: true },
                { name: 'Bot', value: `${targetUser.bot ? '✅ Yes' : '❌ No'}`, inline: true }
            )
            .setTimestamp();
            
        await interaction.reply({ embeds: [infoEmbed] });
    }
};
client.commands.set(userInfoCommand.data.name, userInfoCommand);


// --- 8. /ping Command ---
const pingCommand = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Checks the bot\'s latency (API and Websocket).'),
    
    async execute(interaction) {
        const pingEmbed = new EmbedBuilder()
            .setTitle('Pong! 🏓')
            .setDescription(`**Latency Check**\n*API Latency:* Calculating...\n*Websocket Latency:* ${client.ws.ping}ms`)
            .setColor(0xFEE75C);
            
        const sent = await interaction.reply({ embeds: [pingEmbed], fetchReply: true });

        // Calculate API latency
        const apiLatency = sent.createdTimestamp - interaction.createdTimestamp;
        
        const finalEmbed = new EmbedBuilder()
            .setTitle('Pong! 🏓')
            .setDescription(`**Latency Check**\n*API Latency:* **${apiLatency}ms**\n*Websocket Latency:* **${client.ws.ping}ms**`)
            .setColor(apiLatency < 100 ? 0x00FF00 : 0xFF0000); // Green if fast, Red if slow
            
        await interaction.editReply({ embeds: [finalEmbed] });
    }
};
client.commands.set(pingCommand.data.name, pingCommand);


// --- 9. /avatar Command ---
const avatarCommand = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Displays the full size avatar of a user.')
        .addUserOption(option => 
            option.setName('target').setDescription('The user to get the avatar of.').setRequired(false)),
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('target') || interaction.user;
        
        const avatarURL = targetUser.displayAvatarURL({ dynamic: true, size: 1024 });

        const embed = new EmbedBuilder()
            .setTitle(`${targetUser.username}'s Avatar`)
            .setImage(avatarURL)
            .setColor(0x7289DA)
            .setFooter({ text: `Requested by ${interaction.user.tag}` });
            
        await interaction.reply({ embeds: [embed] });
    }
};
client.commands.set(avatarCommand.data.name, avatarCommand);


// --- 10. /say Command ---
const sayCommand = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Makes the bot send a message in the current channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Restrict to Administrators
        .addStringOption(option => 
            option.setName('message').setDescription('The message the bot should send.').setRequired(true)),
    
    async execute(interaction) {
        const messageToSend = interaction.options.getString('message');

        try {
            // Delete the user's command interaction reply, then send the message
            await interaction.deferReply({ ephemeral: true }); // Defer to prevent timeout
            
            await interaction.channel.send(messageToSend);
            
            // Send a confirmation reply that is only visible to the user
            await interaction.editReply({ content: '✅ Message sent!', ephemeral: true });
        } catch (error) {
            console.error('Say command failed:', error);
            await interaction.editReply({ content: `❌ Failed to send message: ${error.message}`, ephemeral: true });
        }
    }
};
client.commands.set(sayCommand.data.name, sayCommand); 


// --- 11. /recover Command (NEW) ---
const recoverCommand = {
    data: new SlashCommandBuilder()
        .setName('recover')
        .setDescription('Reverses a moderation action (e.g., lifts timeout or unbans a user).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) 
        .addSubcommand(subcommand =>
            subcommand.setName('timeout').setDescription('Lifts the timeout/mute from a member.')
                .addUserOption(option => option.setName('target').setDescription('The member to remove the timeout from.').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('The reason for lifting the timeout.').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand.setName('unban').setDescription('Unbans a user from the server.')
                .addStringOption(option => option.setName('user_id').setDescription('The ID of the user to unban.').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('The reason for the unban.').setRequired(false))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const successEmbed = new EmbedBuilder().setColor(0x00FF00).setTimestamp().setFooter({ text: `Moderator: ${interaction.user.tag}` });
        
        await interaction.deferReply({ ephemeral: true });

        try {
            if (subcommand === 'timeout') {
                const targetUser = interaction.options.getUser('target');
                const targetMember = interaction.guild.members.cache.get(targetUser.id);
                
                if (!targetMember) return interaction.editReply({ content: `❌ Could not find **${targetUser.tag}** in this server.`, ephemeral: true });
                if (!targetMember.moderatable) return interaction.editReply({ content: `❌ I cannot moderate ${targetUser.tag}.`, ephemeral: true });

                // Set timeout to 0 to remove it
                await targetMember.timeout(null, reason); 
                
                successEmbed.setTitle('✅ Timeout Removed').setDescription(`**Target:** ${targetUser.tag}\n**Reason:** ${reason}`);
                await interaction.editReply({ embeds: [successEmbed] });
            
            } else if (subcommand === 'unban') {
                const userId = interaction.options.getString('user_id');

                // Note: Unbanning requires the user ID, not a user object, since they are not in the guild.
                await interaction.guild.bans.remove(userId, reason);

                successEmbed.setTitle('✅ User Unbanned').setDescription(`**Target ID:** ${userId}\n**Reason:** ${reason}`);
                await interaction.editReply({ embeds: [successEmbed] });
            }

        } catch (error) {
            console.error(`Recover command failed: ${error}`);
            const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ Failed to execute action: \`${error.message}\``);
            await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
};
client.commands.set(recoverCommand.data.name, recoverCommand); // <--- ADDED THE NEW COMMAND HERE!


// ==========================================================
//              BOT EVENTS AND HANDLERS
// ==========================================================

// --- Command Registration and Ready Event ---
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    
    // Set Bot Activity
    client.user.setPresence({
        activities: [{ name: 'ES • Studio Assistant', type: ActivityType.Watching }],
        status: 'online',
    });

    const commandsToRegister = client.commands.map(command => command.data.toJSON());
    
    try {
        // NOTE: This assumes you have a config.json file with a valid 'guildId'
        const { guildId } = require('./config.json'); 
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
        
        console.log('Started refreshing application (/) commands.');

        // This is the critical line that registers all commands with Discord
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, guildId),
            { body: commandsToRegister },
        );

        console.log(`Successfully reloaded ${commandsToRegister.length} application (/) commands.`);
    } catch (error) {
        console.error("Command Registration Error: Make sure './config.json' with guildId exists, or use global registration.", error);
    }
});


// --- Interaction Listener and Modal Handler ---
client.on('interactionCreate', async interaction => {
    
    // Handle Slash Commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ **Error executing command:** \`${error.message}\``);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }

    // Handle Modal Submissions (Embed Studio)
    if (interaction.isModalSubmit() && interaction.customId === 'embedStudioModal') {
        await handleEmbedStudioModal(interaction);
    }
});


// --- Embed Studio Modal Submission Handler Function ---
async function handleEmbedStudioModal(interaction) {
    await interaction.deferReply({ ephemeral: true }); 

    const title = interaction.fields.getTextInputValue('embedTitleInput');
    const description = interaction.fields.getTextInputValue('embedDescriptionInput');
    const colorInput = interaction.fields.getTextInputValue('embedColorInput');
    const channelId = interaction.fields.getTextInputValue('embedChannelInput');
    const footer = interaction.fields.getTextInputValue('embedFooterInput');
    
    const targetChannel = interaction.guild.channels.cache.get(channelId);
    
    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) { 
        return interaction.editReply({ content: '❌ **Invalid Channel ID.** Please ensure it is a valid text channel ID from this server.', ephemeral: true });
    }

    try {
        let color = 0x0099FF;
        if (colorInput) {
            const cleanColor = colorInput.replace('#', '');
            if (/^[0-9A-Fa-f]{6}$/.test(cleanColor)) {
                color = parseInt(cleanColor, 16);
            }
        }
        
        const embed = new EmbedBuilder()
            .setTitle(title || null)
            .setDescription(description || null)
            .setColor(color) 
            .setTimestamp()
            .setFooter({ text: footer || `Sent by ${interaction.user.tag}` });
        
        await targetChannel.send({ embeds: [embed] });

        return interaction.editReply({ content: `✅ **Embed sent successfully!** Check ${targetChannel} for the result.`, ephemeral: true });

    } catch (error) {
        console.error("Embed Studio Send Error:", error);
        return interaction.editReply({ content: `❌ **Failed to send embed:** Check bot permissions and channel ID. Error: ${error.message}`, ephemeral: true });
    }
}


// --- Login ---
client.login(process.env.DISCORD_BOT_TOKEN);
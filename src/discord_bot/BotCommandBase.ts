import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionsBitField, Embed, EmbedBuilder, InteractionReplyOptions, AttachmentBuilder } from "discord.js";
import { Logger } from "../Logger";

export abstract class BotCommandBase {
    readonly command: string;
    protected readonly commandBuilder: SlashCommandBuilder;
    protected readonly logger: Logger;

    constructor(command: string, description: string) {
        command = command.toLowerCase();
        this.command = command;
        this.logger = new Logger("Command:" + command);

        this.commandBuilder = new SlashCommandBuilder()
            .setName(command)
            .setDescription(description)
            .setDMPermission(false);
    }

    /**
     * Set command to require the MuteMembers permission.
     */
    protected setRequiresPermission() {
        const permissions = new PermissionsBitField();
        permissions.add("MuteMembers");
        this.commandBuilder.setDefaultMemberPermissions(permissions.bitfield);
    }

    /**
     * Add string option.
     * @param name Only allows lowercase characters and underscores.
     * @param description 
     * @param minLen 
     * @param maxLen 
     * @throws Error if name contains invalid characters.
     */
    protected addStringOption(name: string, description: string, minLen = 0, maxLen = 9999) {
        if (name.match(/[^a-z_]/)) throw new Error("String option name contains invalid characters!");

        this.commandBuilder.addStringOption(opt => opt
            .setName(name)
            .setDescription(description.trim())
            .setRequired(minLen != 0)
            .setMinLength(minLen)
            .setMaxLength(maxLen));
    }

    /**
     * Get JSON payload for REST API.
     */
    getPayload() {
        return this.commandBuilder.toJSON();
    }

    /**
     * Reply to interaction. Uses correct function based on whether interaction was deffered before.
     * Also handles promise rejections. Returned boolean value denotes success.
     * @param interaction 
     * @param msg 
     * @param embeds
     */
    protected async interactionReply(interaction: ChatInputCommandInteraction, msg: string, embeds?: (Embed | EmbedBuilder)[], files?: (AttachmentBuilder)[]) {
        const payload: InteractionReplyOptions = { content: msg };
        if (embeds) payload.embeds = embeds;
        if (files) payload.files = files;

        try {
            if (interaction.deferred)
                await interaction.editReply(payload);
            else
                await interaction.reply(payload);
        } catch (error) {
            this.logger.logError("Interaction error!", error);
            return false;
        }
        return true;
    }

    /**
     * Same as interactionReply() but prepends ❌, wow!
     * @param interaction 
     * @param msg 
     * @returns 
     */
    protected replyError(interaction: ChatInputCommandInteraction, msg: string) {
        return this.interactionReply(interaction, "❌ " + msg);
    }

    /**
     * Same as interactionReply() but prepends 🥏, wow!
     * @param interaction 
     * @param msg 
     * @returns 
     */
    protected replySuccess(interaction: ChatInputCommandInteraction, msg: string, embeds?: (Embed | EmbedBuilder)[], files?: (AttachmentBuilder)[]) {
        return this.interactionReply(interaction, "🥏 " + msg, embeds, files);
    }

    /**
     * Get voice channel from interaction.
     * @param interaction 
     * @returns 
     */
    protected getInteractionVoicechannel(interaction: ChatInputCommandInteraction) {
        if (!interaction.guild || !interaction.member)
            return null;

        const guildMember = interaction.guild.members.cache.get(interaction.member.user.id);
        if (!guildMember)
            return null;

        return guildMember.voice.channel;
    }

    abstract execute(interaction: ChatInputCommandInteraction): void | Promise<void>
}

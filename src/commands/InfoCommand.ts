import { ChatInputCommandInteraction, CacheType } from "discord.js";
import { BotCommandBase } from "../discord_bot/BotCommandBase";
import { Artist } from "../Artist";
import { L } from "../Localization";

export class InfoCommand extends BotCommandBase {
    private readonly artist: Artist;

    constructor(artist: Artist) {
        super("info", L("Information about the artist."));
        this.artist = artist;
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        const guildId = interaction.guildId;
        const textchanel = interaction.channel;

        if (!guildId || !textchanel) {
            await this.replyError(interaction, L("Invalid request channel!"));
            return;
        }

        let info = `${L("Hello! My name is ")} ${this.artist.name}.\n${L("My music style is")} ${this.artist.style}.\n${L("I write my own songs in")} ${this.artist.language}.`
        this.replySuccess(interaction, info);
    }
}

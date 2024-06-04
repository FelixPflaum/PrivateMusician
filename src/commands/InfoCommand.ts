import { ChatInputCommandInteraction, CacheType } from "discord.js";
import { BotCommandBase } from "../discord_bot/BotCommandBase";
import { Artist } from "../Artist";
import { L } from "../lang/language";

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

        let info = L("Hello! My name is {name}. My music style is {style}. I write my own songs in {lang}.",
            { name: this.artist.name, style: this.artist.style, lang: this.artist.language });
        this.replySuccess(interaction, info);
    }
}

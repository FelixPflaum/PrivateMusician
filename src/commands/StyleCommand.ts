import { ChatInputCommandInteraction, CacheType } from "discord.js";
import { BotCommandBase } from "../discord_bot/BotCommandBase";
import { Artist } from "../Artist";
import { L } from "../Localization";
import { setConfigValue } from "../config";

export class StyleCommand extends BotCommandBase {
    private readonly artist: Artist;

    constructor(artist: Artist) {
        super("setstyle", L("Set the song style."));
        this.artist = artist;
        this.addStringOption("tags", L("A list of style tags."), 4, 250);
        this.setRequiresPermission();
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        const guildId = interaction.guildId;
        const textchanel = interaction.channel;

        if (!guildId || !textchanel) {
            await this.replyError(interaction, L("Invalid request channel!"));
            return;
        }

        const tags = interaction.options.getString("tags");
        if (!tags) {
            await this.replyError(interaction, L("Missing tags!"));
            return;
        }

        setConfigValue("musicStyle", tags);
        this.artist.style = tags;
        this.replySuccess(interaction, `${L("Music style set to: ")}\`${tags}\``);
    }
}

import type { ChatInputCommandInteraction, CacheType } from "discord.js";
import { BotCommandBase } from "../discord_bot/BotCommandBase";
import { Artist } from "../Artist";
import { L } from "../lang/language";
import { setConfigValue } from "../config";

export class LangCommand extends BotCommandBase {
    private readonly artist: Artist;

    constructor(artist: Artist) {
        super("setlang", L("Set the lyric generation language."));
        this.artist = artist;
        this.addStringOption("lang", L("The language to use."), 4, 32);
        this.setRequiresPermission();
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        const guildId = interaction.guildId;
        const textchanel = interaction.channel;

        if (!guildId || !textchanel) {
            await this.replyError(interaction, L("Invalid request channel!"));
            return;
        }

        const lang = interaction.options.getString("lang");
        if (!lang) {
            await this.replyError(interaction, L("Missing language!"));
            return;
        }

        setConfigValue("musicLanguage", lang);
        this.artist.language = lang;
        this.replySuccess(interaction, L("Music language set to: {lang}", {lang}));
    }
}

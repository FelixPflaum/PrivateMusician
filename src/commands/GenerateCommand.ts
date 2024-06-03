import { ChatInputCommandInteraction, CacheType, EmbedBuilder, AttachmentBuilder } from "discord.js";
import { BotCommandBase } from "../discord_bot/BotCommandBase";
import { Artist } from "../Artist";
import { L } from "../Localization";
import { ClipInfo } from "../suna_ai_api/ApiMsgTypes";

/**
 * Formats seconds into [HH:]MM:SS
 * @param timeInSec 
 */
export function hhmmss(timeInSec: number): string {
    const hours = Math.floor(timeInSec / 3600);
    const minutes = Math.floor((timeInSec % 3600) / 60);
    const seconds = Math.floor(timeInSec % 60);
    let timeStr = minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0");
    if (hours) timeStr = minutes.toString().padStart(2, "0") + ":" + timeStr;
    return timeStr;
}

function buildSongEmbed(song: ClipInfo, songNum: number, artist: string, mp3: Buffer) {
    const fileName = (`${artist} - ${song.title}_${songNum}.mp3`).replace(/ /g, "_");
    const attachment = new AttachmentBuilder(mp3, { name: fileName });

    const embed = new EmbedBuilder()
        .setTitle(`${song.title} (Variant ${songNum})`)
        .setColor("#41a92f")
        .setFields(
            { name: L("Duration"), value: hhmmss(song.metadata.duration ?? 0), inline: true },
            { name: L("Genre"), value: song.metadata.tags ?? "Unknown", inline: true },
            { name: L("File Name"), value: `attachment://${fileName}` },
        );

    const img = song.image_large_url ?? song.image_url;
    if (img) embed.setThumbnail(img);

    return { embed, attachment };
}

export class GenerateCommand extends BotCommandBase {
    private readonly artist: Artist;

    constructor(artist: Artist) {
        super("commission", L("Commission a banger song!"));
        this.artist = artist;
        this.addStringOption("song_description", L("A description of what the song should be about."), 4, 500);
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        const guildId = interaction.guildId;
        const textchanel = interaction.channel;

        if (!guildId || !textchanel) {
            await this.replyError(interaction, L("Invalid request channel!"));
            return;
        }

        const prompt = interaction.options.getString("song_description");
        if (!prompt) {
            await this.replyError(interaction, L("Missing song description!"));
            return;
        }

        await interaction.deferReply();

        let done = 0;

        const result = await this.artist.comission(prompt, async (status, clip) => {
            let msg = status;
            if (clip) done++;
            if (status.includes("Recording")) {
                msg += `\n${L("Done")}: ${done}/2\n${L("This will take a few minutes.")}`;
            }
            this.interactionReply(interaction, msg);
        });

        if (result.error) {
            await this.replyError(interaction, result.error);
            return;
        }

        const embeds: EmbedBuilder[] = [];
        const attachments: AttachmentBuilder[] = [];

        for (const clip of result.clipInfos) {
            try {
                const mp3 = await this.artist.getMp3FromClip(clip);
                const ea = buildSongEmbed(clip, embeds.length + 1, this.artist.name, Buffer.from(mp3));
                embeds.push(ea.embed);
                attachments.push(ea.attachment);
            } catch (error) {
                this.logger.logError("Error on getting mp3!", error);
                await this.replyError(interaction, L("Failed to release track!"));
                return;
            }
        }

        this.replySuccess(interaction, L("Songs released!"), embeds, attachments);
    }
}

export class GenerateCommandCustomLyrics extends BotCommandBase {
    private readonly artist: Artist;

    constructor(artist: Artist) {
        super("commission_with_lyrics", L("Commission a banger song providing your own lyrics!"));
        this.artist = artist;
        this.addStringOption("song_title", L("Title of the song!"), 4, 1000);
        this.addStringOption("song_lyrics", L("Lyrics of the song."), 100, 2500);
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        const guildId = interaction.guildId;
        const textchanel = interaction.channel;

        if (!guildId || !textchanel) {
            await this.replyError(interaction, L("Invalid request channel!"));
            return;
        }

        const title = interaction.options.getString("song_title");
        if (!title) {
            await this.replyError(interaction, L("Missing song title!"));
            return;
        }

        const lyrics = interaction.options.getString("song_lyrics");
        if (!lyrics) {
            await this.replyError(interaction, L("Missing lyrics!"));
            return;
        }

        await interaction.deferReply();

        let done = 0;

        const result = await this.artist.comissionWithLyrics(title, lyrics, async (status, clip) => {
            let msg = status;
            if (clip) done++;
            if (status.includes("Recording")) {
                msg += `\n${L("Done")}: ${done}/2\n${L("This will take a few minutes.")}`;
            }
            this.interactionReply(interaction, msg);
        });

        if (result.error) {
            await this.replyError(interaction, result.error);
            return;
        }

        const embeds: EmbedBuilder[] = [];
        const attachments: AttachmentBuilder[] = [];

        for (const clip of result.clipInfos) {
            try {
                const mp3 = await this.artist.getMp3FromClip(clip);
                const ea = buildSongEmbed(clip, embeds.length + 1, this.artist.name, Buffer.from(mp3));
                embeds.push(ea.embed);
                attachments.push(ea.attachment);
            } catch (error) {
                this.logger.logError("Error on getting mp3!", error);
                await this.replyError(interaction, L("Failed to release track!"));
                return;
            }
        }

        this.replySuccess(interaction, L("Songs released!"), embeds, attachments);
    }
}

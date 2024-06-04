import { ChatInputCommandInteraction, CacheType, EmbedBuilder, AttachmentBuilder } from "discord.js";
import { BotCommandBase } from "../discord_bot/BotCommandBase";
import { Artist, ComissionState } from "../Artist";
import type { ComissionStatusFunc, SongInfo } from "../Artist";
import { L } from "../lang/language";

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

function buildAttachment(song: SongInfo, songNum: number, artist: string, mp3: Buffer) {
    const fileName = (`${artist} - ${song.title}_v${songNum}.mp3`).replace(/ /g, "_");
    const attachment = new AttachmentBuilder(mp3, { name: fileName });
    return attachment;
}

function buildEmbed(song: SongInfo) {
    const embed = new EmbedBuilder()
        .setTitle(song.title)
        .setDescription(song.lyrics)
        .setColor("#41a92f");
    if (song.imgUrl) embed.setThumbnail(song.imgUrl);
    return embed;
}

abstract class GenerateCommandBase extends BotCommandBase {
    protected readonly artist: Artist;

    constructor(artist: Artist, cmd: string, desc: string) {
        super(cmd, desc);
        this.artist = artist;
    }

    abstract handleGeneration(interaction: ChatInputCommandInteraction<CacheType>, statusUpdate: ComissionStatusFunc): ReturnType<typeof this.artist.comission>

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        const guildId = interaction.guildId;
        const textchanel = interaction.channel;

        if (!guildId || !textchanel) {
            await this.replyError(interaction, L("Invalid request channel!"));
            return;
        }

        await interaction.deferReply();

        let done = 0;

        const result = await this.handleGeneration(interaction, async (status, statusText, _clip) => {
            switch (status) {
                case ComissionState.streaming:
                case ComissionState.clipDone:
                    if (status == ComissionState.clipDone) done++;
                    statusText += "\n" + L("Done: {done}/2\nThis will take a few minutes.", { done });
            }
            this.interactionReply(interaction, statusText);
        });

        if (result.error) {
            await this.replyError(interaction, result.error);
            return;
        }

        const attachments: AttachmentBuilder[] = [];

        for (const song of result.songInfos) {
            try {
                const res = await fetch(song.mp3Url);
                if (res.status != 200) {
                    this.logger.logError("Could not load mp3 file!", await res.text());
                    await this.replyError(interaction, L("Could not load mp3 file!"));
                    return;
                }
                const mp3 = await res.arrayBuffer();
                attachments.push(buildAttachment(song, attachments.length + 1, this.artist.name, Buffer.from(mp3)));
            } catch (error) {
                this.logger.logError("Error on getting mp3!", error);
                await this.replyError(interaction, L("Failed to release track!"));
                return;
            }
        }

        this.replySuccess(interaction, L("Songs released!"), [buildEmbed(result.songInfos[0]!)], attachments);
    }
}

export class GenerateCommand extends GenerateCommandBase {
    constructor(artist: Artist) {
        super(artist, "commission", L("Commission a banger song!"));
        this.addStringOption("song_description", L("A description of what the song should be about."), 10, 500);
    }

    override handleGeneration(interaction: ChatInputCommandInteraction<CacheType>, statusUpdate: ComissionStatusFunc): ReturnType<typeof this.artist.comission> {
        return new Promise(resolve => {
            const prompt = interaction.options.getString("song_description");
            if (!prompt) {
                resolve({ error: L("Missing song description!"), songInfos: [] });
                return;
            }
            this.artist.comission(prompt, statusUpdate).then(resolve);
        });
    }
}

export class GenerateCommandCustomLyrics extends GenerateCommandBase {
    constructor(artist: Artist) {
        super(artist, "commission_with_lyrics", L("Commission a banger song providing your own lyrics!"));
        this.addStringOption("song_title", L("Title of the song!"), 4, 1000);
        this.addStringOption("song_lyrics", L("Lyrics of the song."), 100, 2500);
    }

    override handleGeneration(interaction: ChatInputCommandInteraction<CacheType>, statusUpdate: ComissionStatusFunc): ReturnType<typeof this.artist.comission> {
        return new Promise(resolve => {
            const title = interaction.options.getString("song_title");
            if (!title) {
                resolve({ error: L("Missing song title!"), songInfos: [] });
                return;
            }

            const lyrics = interaction.options.getString("song_lyrics");
            if (!lyrics) {
                resolve({ error: L("Missing lyrics!"), songInfos: [] });
                return;
            }

            this.artist.comissionWithLyrics(title, lyrics, statusUpdate).then(resolve);
        });
    }
}

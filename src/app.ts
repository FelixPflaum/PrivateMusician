import { GenerateCommand, GenerateCommandCustomLyrics } from "./commands/GenerateCommand";
import { getConfig } from "./config";
import { Discordbot } from "./discord_bot/DiscordBot";
import { Artist } from "./Artist";
import { StyleCommand } from "./commands/StyleCommand";
import { InfoCommand } from "./commands/InfoCommand";
import { LangCommand } from "./commands/LangCommand";

async function run() {
    const cfg = getConfig();
    const artist = new Artist(cfg.artistName, cfg.musicStyle, cfg.musicLanguage, cfg.clients);
    const discord = new Discordbot(cfg.discordToken);
    discord.registerCommand(new GenerateCommand(artist));
    discord.registerCommand(new GenerateCommandCustomLyrics(artist));
    discord.registerCommand(new StyleCommand(artist));
    discord.registerCommand(new InfoCommand(artist));
    discord.registerCommand(new LangCommand(artist));
    await discord.connect();
}
run();

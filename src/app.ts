import { GenerateCommand } from "./commands/GenerateCommand";
import { getConfig } from "./config";
import { Discordbot } from "./discord_bot/DiscordBot";
import { Artist } from "./Artist";

async function run() {
    const cfg = getConfig();
    const artist = new Artist(cfg.artistName, cfg.clients);
    const discord = new Discordbot(cfg.discordToken);
    discord.registerCommand(new GenerateCommand(artist));
    await discord.connect();
}
run();

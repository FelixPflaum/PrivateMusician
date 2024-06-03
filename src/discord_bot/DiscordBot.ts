import { Client, GatewayIntentBits, Guild, REST, RESTPostAPIChatInputApplicationCommandsJSONBody, Routes } from "discord.js";
import { BotCommandBase } from "./BotCommandBase";
import { Logger } from "../Logger";

export class Discordbot
{
    private readonly token: string;
    private readonly client: Client;
    private readonly logger: Logger;
    private readonly commands: Map<string, BotCommandBase>;

    constructor(token: string)
    {
        this.token = token;
        this.logger = new Logger("Discordbot");
        this.commands = new Map<string, BotCommandBase>();

        this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

        this.client.on("ready", () =>
        {
            this.logger.log("Logged in and ready.");
            for (const guild of this.client.guilds.cache.values())
            {
                this.refreshCommandsForGuild(guild);
            }
        });

        this.client.on("guildCreate", guild =>
        {
            this.refreshCommandsForGuild(guild);
        });

        this.client.on("interactionCreate", async interaction =>
        {
            if (!interaction || !interaction.isChatInputCommand()) return;
            const cmdName = interaction.commandName;
            const command = this.commands.get(cmdName);
            if (command) command.execute(interaction);
        });
    }

    /**
     * Register a command.
     * @param command 
     */
    registerCommand(command: BotCommandBase)
    {
        if (this.client.isReady()) throw new Error("Bot is already logged in! Register commands before calling connect()!");
        if (this.commands.has(command.command)) throw new Error("Command with that name already registered!");
        this.commands.set(command.command, command);
    }

    /**
     * Refresh commands for a guild.
     * @param guild 
     */
    private async refreshCommandsForGuild(guild: Guild)
    {
        this.logger.log(`Refreshing application commands for guild ${guild.name} (${guild.id})...`);

        const rest = new REST().setToken(this.token);
        const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];

        for (const cmd of this.commands.values())
        {
            commands.push(cmd.getPayload());
        }

        try
        {
            const clientId = this.client.user?.id;
            if (!clientId) throw new Error("Bot has no user?! Can't get client Id.");
            const data = await rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body: commands });
            this.logger.log(`Successfully refreshed ${Array.isArray(data) ? data.length : "??"} application commands for guild ${guild.name} (${guild.id}).`);
        }
        catch (error)
        {
            this.logger.logError(`Failed to refresh commands in guild ${guild.name} (${guild.id})!`, error);
            console.error(error);
        }
    }

    /**
     * Connect the bot client.
     */
    async connect()
    {
        if (this.client.isReady()) Promise.resolve();
        this.logger.log("Logging in...");
        await this.client.login(this.token);
    }

    /**
     * Disconnect the bot client.
     */
    disconnect()
    {
        return this.client.destroy();
    }
}

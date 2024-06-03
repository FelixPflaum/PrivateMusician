import { existsSync, readFileSync, writeFileSync } from "fs";

export interface ClientDef {
    agent: string;
    cookie: string;
}

export interface ConfigFile {
    discordToken: string;
    artistName: string;
    musicStyle: string;
    musicLanguage: string;
    clients: ClientDef[];
}

const CONFIG_PATH = "config.json";

const DEFAULT_CONFIG: ConfigFile = {
    discordToken: "",
    artistName: "MC AI",
    musicStyle: "crappy and bad",
    musicLanguage: "Schweitzerdeutsch",
    clients: [{
        agent: "",
        cookie: "",
    }],
};

let data: ConfigFile | undefined;

function checkConfigFile() {
    if (existsSync(CONFIG_PATH)) return;
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 4));
    console.log("Config file created!");
    process.exit(0);
}

/**
 * Get config data.
 * @returns The ConfigFile data.
 */
export function getConfig() {
    if (data) return data;
    checkConfigFile();
    data = JSON.parse(readFileSync("config.json", "utf-8")) as ConfigFile;
    return data;
}

export function setConfigValue(key: keyof ConfigFile, value: any) {
    getConfig();
    if (typeof value !== typeof data![key]) throw new Error("Config value type mismatch!");
    data![key] = value;
    writeFileSync(CONFIG_PATH, JSON.stringify(data!, null, 4));
}

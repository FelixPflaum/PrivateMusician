import { existsSync, readFileSync, writeFile, writeFileSync } from "fs";

export interface ClientDef {
    agent: string; // Browser user agent to use.
    cookie: string; // Cookies of a logged in session sent with the clerk request.
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

/**
 * Change config value and save to file.
 * @param key 
 * @param value 
 */
export async function setConfigValue<K extends keyof ConfigFile>(key: K, value: ConfigFile[K]) {
    data = getConfig();
    if (typeof value !== typeof data[key]) throw new Error("Config value type mismatch!");
    data[key] = value;

    writeFile(CONFIG_PATH, JSON.stringify(data!, null, 4), err => {
        if (err) console.error(err);
    });
}

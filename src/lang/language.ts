import { existsSync, readdirSync, readFileSync } from "fs";
import * as path from "path";
import { Logger } from "../Logger";
import { getConfig } from "../config";

const fileDir = path.join(process.cwd(), "translations");
const logger = new Logger("Language");
const lang = getConfig().locale;
const strings = (() => 
{
    const targetPath = path.join(fileDir, lang + ".json");

    if (!existsSync(targetPath))
    {
        const files = readdirSync(fileDir);
        const validIdentifiers: string[] = ["en"];
        for (const fileName of files)
        {
            validIdentifiers.push(fileName.replace(/\..+/, ""));
        }
        logger.logError("Invalid language identifier: " + lang + ". Valid options are: " + validIdentifiers.join(", "));
        process.exit(1);
    }

    try
    {
        const data = readFileSync(targetPath, "utf-8");
        const parsed = <{ [index: string]: string }>JSON.parse(data);

        for (const str in parsed)
        {
            if (!parsed[str] || typeof parsed[str] !== "string")
                throw new Error("Invalid entry in translation file: " + str);
        }

        return parsed;
    }
    catch (error)
    {
        logger.logError("Failed to load translations for: " + lang, error);
        process.exit(1);
    }
})();

/**
 * Get the translated string, replacing {placeholders} in the process.
 * @param str 
 * @param replace 
 * @returns 
 */
export function L(str: string, replace?: { [placeholder: string]: string | number })
{
    let translated = strings[str.replace(/\n/g,"\\n")];

    if (!translated)
    {
        logger.logError("Missing translation for: " + str);
        translated = str;
    }

    if (replace)
    {
        for (const ph in replace)
        {
            let repl = replace[ph]!;
            translated = translated.replace("{" + ph + "}", (typeof repl === "string") ? repl : repl.toString());
        }
    }

    return translated.replace(/\\n/g, "\n");
}

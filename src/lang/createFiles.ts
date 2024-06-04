/**
 * This script creates or updates translations .json files in ./translations.
 * It scans all .ts files of the project for strings in L() functions calls in the format: L(["'`].*["'`]
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "fs"
import * as path from "path"

if (require.main !== module)
    throw new Error("Requiring this file was probably a mistake.");

const fileDir = path.join(process.cwd(), "translations");

function fillFileList(currentDir: string, pathList: string[])
{
    const files = readdirSync(currentDir);
    for (const file of files)
    {
        if (file == "node_modules") continue;
        const filePath = path.join(currentDir, file);
        const stat = statSync(filePath);
        if (stat.isDirectory())
        {
            fillFileList(filePath, pathList);
        }
        else
        {
            if (file.indexOf(".ts") !== -1)
                pathList.push(filePath);
        }
    }
}

const list: string[] = [];
fillFileList("./", list);

const strings: { [str: string]: string } = {};

for (const file of list)
{
    const content = readFileSync(file, "utf-8");
    const matches = content.match(/L\(["'`].*?["'`][,)]/gm);
    if (!matches) continue;
    for (const match of matches)
    {
        const strMatch = match.match(/L\(["'`](.*?)["'`][,)]/);
        if (!strMatch)
            throw new Error("Could not match string: " + match);
        strings[strMatch[1]!] = strMatch[1]!;
    }
}

const langFiles = readdirSync(fileDir);

for (const langFile of langFiles)
{
    const target = path.join(fileDir, langFile);

    console.log("Updating file: " + target);

    const data = readFileSync(target, "utf-8");
    const parsed = <{ [index: string]: string }>JSON.parse(data || "{}");

    for (const str in parsed)
    {
        if (!parsed[str] || typeof parsed[str] !== "string")
            throw new Error("Invalid entry in translation file: " + str);
    }

    for (const str in strings)
    {
        if (!parsed[str])
        {
            parsed[str] = str;
            console.log("Add new string: " + str);
        }
    }

    writeFileSync(target, JSON.stringify(parsed, null, 4));
    console.log("Done.");
}

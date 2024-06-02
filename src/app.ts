import { getConfig } from "./config";
import { SunoAiApi } from "./SunoAiApi";

const cfg = getConfig();
const clientData = cfg.clients[0]!;
SunoAiApi.create(clientData.agent, clientData.cookie).then(async sapi => {
    const c = await sapi.checkBillingInfo();
    const l = await sapi.generateLyrics("a song about a cat that is really, really muscular and a literal god");
    console.log(l.title);
    console.log(l.text);
}).catch(err => {
    console.error(err);
});

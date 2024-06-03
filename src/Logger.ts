/** Placeholder Logger */
export class Logger {
    private readonly title: string;

    constructor(title: string) {
        this.title = title;
    }

    log(str: string) {
        console.log(`${this.title}: ${str}`);
    }

    logError(str: string, error?: unknown) {
        console.error(`${this.title}: ${str}`);
        if (error) console.error(error);
    }
}

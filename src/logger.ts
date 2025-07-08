export const logger = {
    info: (...args: any[]) => {
        console.log("info", ...args);
    },
    warn: (...args: any[]) => {
        console.log("warn", ...args);
    },
    error: (...args: any[]) => {
        console.log("error", ...args);
    }
}
export function assertNever(x: never): never {
    throw new Error("Unexpected object: " + x);
}

export function capitalizeFirst(str?: string): string | undefined {
    if (str == null) return str;                     // empty / null safety
    return str[0].toUpperCase() + str.slice(1);
}

export function msToReadable (ms: number): string {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / 1000 / 60));

    return `${numberToPaddedString(minutes)}:${numberToPaddedString(seconds)}`;
}

export function numberToPaddedString (n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}
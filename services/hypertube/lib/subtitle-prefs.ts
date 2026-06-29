"use client";

const ENABLED_COOKIE = "ht_subtitles_enabled";
const LANG_MAP_COOKIE = "ht_subtitle_lang_map";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Sentinel cached for a movie where the user explicitly turned subtitles off. */
export const SUBTITLES_OFF = "off" as const;

function readCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(
        new RegExp(`(?:^|; )${name}=([^;]*)`)
    );
    return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string): void {
    if (typeof document === "undefined") return;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function isSubtitlesEnabled(): boolean {
    return readCookie(ENABLED_COOKIE) === "1";
}

export function setSubtitlesEnabled(enabled: boolean): void {
    writeCookie(ENABLED_COOKIE, enabled ? "1" : "0");
}

function readLangMap(): Record<string, string> {
    const raw = readCookie(LANG_MAP_COOKIE);
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

/** Returns a cached language code, the SUBTITLES_OFF sentinel, or null if no choice was made yet for this movie. */
export function getCachedSubtitleChoice(movieId: string): string | null {
    return readLangMap()[movieId] ?? null;
}

export function setCachedSubtitleChoice(
    movieId: string,
    choice: string | typeof SUBTITLES_OFF
): void {
    const map = readLangMap();
    map[movieId] = choice;
    writeCookie(LANG_MAP_COOKIE, JSON.stringify(map));
}

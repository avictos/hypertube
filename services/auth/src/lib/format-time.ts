/**
 * Formats a duration in milliseconds into a human-readable string format.
 * @param ms The duration in milliseconds to format
 * @returns A formatted string representing the duration in hours, minutes, and seconds (e.g., "1h 30m 45s")
 * If the duration is less than 1 second, it returns "a few seconds"
 */
export const formatTime = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);

    return (
        [
            hours > 0 ? `${hours}h` : null,
            minutes > 0 ? `${minutes}m` : null,
            seconds > 0 ? `${seconds}s` : null,
        ]
            .filter(Boolean)
            .join(" ") || "a few seconds"
    );
};

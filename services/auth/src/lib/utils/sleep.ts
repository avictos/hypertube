export const sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

export const sleepWithExit = async (ms: number, exitCode: number = 0): Promise<void> => {
    await sleep(ms);
    process.exit(exitCode);
};

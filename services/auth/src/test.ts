import { db } from "./lib/db/orm/client";

const runTest = async () => {
    console.log("Running tests...");

    const result = await db.emailAddresses.findUnique({
        where: {
            email: "test1@example.com",
        },
        select: ["id", "user_id", "is_verified", "email", "is_locked", "vcode_sent_at"],
        include: {
            user: {
                select: ["id", "first_name", "last_name", "username"],
            },
            security: {
                select: ["id", "user_id", "created_at", "updated_at"],
            },
        },
    });

    console.log(result);
};

runTest();

// TODO: remove file

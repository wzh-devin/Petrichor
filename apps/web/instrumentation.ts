export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { runStartupMigration } = await import("@/server/db/startup-migration")
        await runStartupMigration()
    }
}

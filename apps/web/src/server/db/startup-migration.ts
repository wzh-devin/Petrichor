import path from "node:path"
import { runPostgresMigrations } from "./postgres-migration"

export async function runStartupMigration() {
    if (process.env.PETRICHOR_AUTO_MIGRATE !== "true") return

    const databaseUrl = process.env.MIGRATION_DATABASE_URL?.trim()
        || process.env.DATABASE_URL?.trim()
    if (process.env.PETRICHOR_DB_DIALECT === "sqlite" || databaseUrl?.startsWith("file:")) {
        return
    }

    await runPostgresMigrations(path.resolve(process.cwd(), "docs/migrations"))
}

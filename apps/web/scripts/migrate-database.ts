import path from "node:path"
import { runPostgresMigrations } from "../src/server/db/postgres-migration"

const productionOnly = process.argv.includes("--vercel-production-only")
if (productionOnly && process.env.VERCEL_ENV !== "production") {
    console.log(`[db:migrate] 跳过 ${process.env.VERCEL_ENV ?? "非 Vercel"} 环境`)
    process.exit(0)
}

const repositoryRoot = path.resolve(import.meta.dirname, "../../..")
const migrationsDirectory = path.join(repositoryRoot, "docs/migrations")
await runPostgresMigrations(migrationsDirectory)

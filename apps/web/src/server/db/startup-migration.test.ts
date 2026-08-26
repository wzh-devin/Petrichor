import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { runStartupMigration } from "./startup-migration"

const runPostgresMigrations = vi.hoisted(() => vi.fn())
vi.mock("./postgres-migration", () => ({ runPostgresMigrations }))

const originalEnv = { ...process.env }
afterEach(() => {
    process.env = { ...originalEnv }
    runPostgresMigrations.mockReset()
})

it("仅在启用时执行启动迁移", async () => {
    delete process.env.PETRICHOR_AUTO_MIGRATE
    await runStartupMigration()
    expect(runPostgresMigrations).not.toHaveBeenCalled()

    process.env.PETRICHOR_AUTO_MIGRATE = "true"
    process.env.DATABASE_URL = "postgres://example"
    await runStartupMigration()
    expect(runPostgresMigrations).toHaveBeenCalledWith(
        path.resolve(process.cwd(), "../../docs/migrations"),
    )
})

import { eq } from "drizzle-orm"
import { NextRequest } from "next/server"
import { z } from "zod"
import { requireCurrentUser } from "@/server/auth/current-user"
import { isSuperAdmin } from "@/server/admin/logic"
import { getDb } from "@/server/db/client"
import { users } from "@/server/db/schema"
import { ok, readJson, toErrorResponse } from "@/server/http/response"
import { toUserProfileResponse } from "@/server/mappers"
import { invalidatePublicAboutProfileCache } from "@/server/public-content-cache"

const schema = z.object({
    nickname: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    signature: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
    try {
        const currentUser = await requireCurrentUser(request)
        const input = schema.parse(await readJson(request))
        const [user] = await getDb()
            .update(users)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(users.id, currentUser.id))
            .returning()

        if (input.avatar !== undefined && isSuperAdmin(currentUser.systemRole, currentUser.id)) {
            invalidatePublicAboutProfileCache()
        }

        return ok(toUserProfileResponse(user))
    } catch (error) {
        return toErrorResponse(error, request.nextUrl.pathname)
    }
}

import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import n8nApi from "@/lib/n8n-api"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
})

async function ensureDefaultUser() {
  const defaultUserId = "00000000-0000-0000-0000-000000000001"
  const defaultEmail = "default@flowviber.local"

  // First check if user exists by email
  const { data: userByEmail } = await supabaseAdmin.auth.admin.listUsers()
  const existingUser = userByEmail.users.find((user) => user.email === defaultEmail)

  if (existingUser) {
    // User exists, return their actual ID
    return existingUser.id
  }

  // User doesn't exist, create them
  const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
    user_id: defaultUserId,
    email: defaultEmail,
    password: "temp-password-123",
    email_confirm: true,
  })

  if (error) {
    console.error("[v0] Failed to create default user:", error.message)
    // If creation failed, try to find the user again in case it was created by another request
    const { data: retryUserList } = await supabaseAdmin.auth.admin.listUsers()
    const retryUser = retryUserList.users.find((user) => user.email === defaultEmail)
    if (retryUser) {
      return retryUser.id
    }
    throw new Error(`Failed to create or find default user: ${error.message}`)
  }

  return newUser.user?.id || defaultUserId
}

async function getUserId(): Promise<string> {
  try {
    // Try to get authenticated user first
    const cookieStore = cookies()
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    })

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (user && !error) {
      console.log("[v0] Sync API: Using authenticated user ID:", user.id)
      return user.id
    } else {
      console.log("[v0] Sync API: No authenticated user, using default user")
    }
  } catch (error) {
    console.log("[v0] Sync API: Authentication check failed, using default user:", error)
  }

  // Fallback to default user
  const defaultUserId = await ensureDefaultUser()
  console.log("[v0] Sync API: Using default user ID:", defaultUserId)
  return defaultUserId
}

export async function POST(request: NextRequest) {
  try {
    const { workflowId, n8nWorkflowId } = await request.json()

    if (!workflowId || !n8nWorkflowId) {
      return NextResponse.json({ error: "Missing required fields: workflowId, n8nWorkflowId" }, { status: 400 })
    }

    console.log("[v0] Sync API: Syncing workflow from n8n:", n8nWorkflowId)

    const userId = await getUserId()

    // Get workflow from n8n
    const n8nWorkflow = await n8nApi.syncWorkflowFromN8n(n8nWorkflowId, userId)

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    await supabase
      .from("workflows")
      .update({
        workflow_json: n8nWorkflow,
        status: "deployed", // Maintain deployed status after sync
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", workflowId)

    console.log("[v0] Sync API: Workflow synced authoritatively from n8n response")

    return NextResponse.json({
      success: true,
      workflow: n8nWorkflow,
      message: "Workflow synced from n8n successfully",
    })
  } catch (error) {
    console.error("[v0] Sync API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync workflow" },
      { status: 500 },
    )
  }
}

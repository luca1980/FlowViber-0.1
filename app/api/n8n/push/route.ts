import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import n8nApi from "@/lib/n8n-api"
import { createClient } from "@supabase/supabase-js"
import { WorkflowStorage } from "@/lib/workflow-storage"

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
      console.log("[v0] Push API: Using authenticated user ID:", user.id)
      return user.id
    } else {
      console.log("[v0] Push API: No authenticated user, using default user")
    }
  } catch (error) {
    console.log("[v0] Push API: Authentication check failed, using default user:", error)
  }

  // Fallback to default user
  const defaultUserId = await ensureDefaultUser()
  console.log("[v0] Push API: Using default user ID:", defaultUserId)
  return defaultUserId
}

export async function POST(request: NextRequest) {
  try {
    const { n8nWorkflowId, workflowJson, workflowName } = await request.json()

    if (!n8nWorkflowId || !workflowJson || !workflowName) {
      return NextResponse.json(
        { error: "Missing required fields: n8nWorkflowId, workflowJson, workflowName" },
        { status: 400 },
      )
    }

    console.log("[v0] Push API: Pushing workflow to n8n:", n8nWorkflowId)

    const userId = await getUserId()

    // Push to n8n
    const updatedWorkflow = await n8nApi.pushWorkflowToN8n(n8nWorkflowId, workflowJson, workflowName, userId)

    const workflowStorage = WorkflowStorage.getInstance()

    // Find the local workflow by n8n_workflow_id to get the local ID
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: localWorkflow } = await supabase
      .from("workflows")
      .select("id")
      .eq("n8n_workflow_id", n8nWorkflowId)
      .single()

    if (localWorkflow) {
      // Update the workflow JSON and ensure status stays "deployed"
      await supabase
        .from("workflows")
        .update({
          workflow_json: updatedWorkflow,
          status: "deployed", // Explicitly maintain deployed status
          updated_at: new Date().toISOString(),
        })
        .eq("id", localWorkflow.id)

      console.log("[v0] Push API: Local workflow status maintained as 'deployed'")
    }

    console.log("[v0] Push API: Workflow pushed successfully")

    return NextResponse.json({
      success: true,
      workflow: updatedWorkflow,
      message: "Workflow pushed to n8n successfully",
    })
  } catch (error) {
    console.error("[v0] Push API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to push workflow" },
      { status: 500 },
    )
  }
}

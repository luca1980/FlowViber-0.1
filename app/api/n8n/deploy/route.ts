import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import n8nApi from "@/lib/n8n-api"
import WorkflowStorage from "@/lib/workflow-storage"
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
      console.log("[v0] Deploy API: Using authenticated user ID:", user.id)
      return user.id
    } else {
      console.log("[v0] Deploy API: No authenticated user, using default user")
    }
  } catch (error) {
    console.log("[v0] Deploy API: Authentication check failed, using default user:", error)
  }

  // Fallback to default user
  const defaultUserId = await ensureDefaultUser()
  console.log("[v0] Deploy API: Using default user ID:", defaultUserId)
  return defaultUserId
}

function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const { workflowId, workflowJson, workflowName } = await request.json()

    if (!workflowId || !workflowJson || !workflowName) {
      return NextResponse.json(
        { error: "Missing required fields: workflowId, workflowJson, workflowName" },
        { status: 400 },
      )
    }

    console.log("[v0] Deploy API: Deploying workflow to n8n:", workflowName)

    const userId = await getUserId()

    // Deploy to n8n first
    const deployedWorkflow = await n8nApi.deployWorkflow(workflowJson, workflowName, userId)
    console.log("[v0] Deploy API: n8n deployment successful, workflow ID:", deployedWorkflow.id)

    const workflowStorage = WorkflowStorage.getInstance()

    try {
      // Update everything in one operation to prevent inconsistencies
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

      const { data: updatedWorkflow, error: updateError } = await supabase
        .from("workflows")
        .update({
          status: "deployed",
          n8n_workflow_id: deployedWorkflow.id,
          deployed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", workflowId)
        .select()
        .single()

      if (updateError) {
        console.error("[v0] Deploy API: Database update failed:", updateError)
        // If database update fails, we should clean up the n8n deployment
        try {
          await n8nApi.deleteWorkflow(deployedWorkflow.id, userId)
          console.log("[v0] Deploy API: Cleaned up n8n deployment after database failure")
        } catch (cleanupError) {
          console.error("[v0] Deploy API: Failed to cleanup n8n deployment:", cleanupError)
        }
        throw new Error(`Database update failed: ${updateError.message}`)
      }

      console.log("[v0] Deploy API: Database updated successfully:", updatedWorkflow)
    } catch (dbError) {
      console.error("[v0] Deploy API: Database operation failed:", dbError)
      throw dbError
    }

    return NextResponse.json({
      success: true,
      n8nWorkflowId: deployedWorkflow.id,
      message: "Workflow deployed to n8n successfully",
    })
  } catch (error) {
    console.error("[v0] Deploy API error:", error)

    let errorMessage = "Failed to deploy workflow"
    let errorCode = "DEPLOY_FAILED"

    if (error instanceof Error) {
      errorMessage = error.message
      if (error.message.includes("n8n")) {
        errorCode = "N8N_ERROR"
      } else if (error.message.includes("Database")) {
        errorCode = "DATABASE_ERROR"
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        errorCode: errorCode,
      },
      { status: 500 },
    )
  }
}

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    console.log("[v0] GET /api/workflows/[id] called for:", params.id)
    const supabase = createAdminClient()

    const { data, error } = await supabase.from("workflows").select("*").eq("id", params.id).single()

    if (error) throw error

    console.log("[v0] Individual workflow API returning:", {
      id: data.id,
      name: data.name,
      status: data.status,
      has_workflow_json: !!data.workflow_json,
    })

    return NextResponse.json({ workflow: data })
  } catch (error) {
    console.error("[v0] Error fetching workflow:", error)
    return NextResponse.json({ error: "Failed to fetch workflow" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    console.log("[v0] PUT /api/workflows/[id] called for:", params.id)
    const body = await request.json()
    console.log("[v0] PUT request body keys:", Object.keys(body))
    console.log("[v0] PUT request body:", body)

    const supabase = createAdminClient()

    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    // Handle chat history updates
    if (body.chat_history !== undefined) {
      console.log("[v0] Updating chat history with", body.chat_history.length, "messages")
      updateData.chat_history = body.chat_history
    }

    // Handle workflow JSON and status updates
    if (body.workflow_json !== undefined) {
      console.log("[v0] Updating workflow JSON with", body.workflow_json.nodes?.length || 0, "nodes")
      updateData.workflow_json = body.workflow_json
    }

    if (body.status !== undefined) {
      console.log("[v0] Updating status to:", body.status)
      updateData.status = body.status
    }

    if (body.n8n_workflow_id !== undefined) {
      console.log("[v0] Updating n8n_workflow_id to:", body.n8n_workflow_id)
      updateData.n8n_workflow_id = body.n8n_workflow_id
    }

    if (body.deployed_at !== undefined) {
      console.log("[v0] Updating deployed_at to:", body.deployed_at)
      updateData.deployed_at = body.deployed_at
    }

    if (body.last_sync_at !== undefined) {
      console.log("[v0] Updating last_sync_at to:", body.last_sync_at)
      updateData.last_sync_at = body.last_sync_at
    }

    console.log("[v0] Final update data:", updateData)

    const { error } = await supabase.from("workflows").update(updateData).eq("id", params.id)

    if (error) {
      console.error("[v0] Supabase update error:", error)
      throw error
    }

    console.log("[v0] Workflow updated successfully")
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error updating workflow:", error)
    return NextResponse.json({ error: "Failed to update workflow" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createAdminClient()

    const { error } = await supabase.from("workflows").delete().eq("id", params.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error deleting workflow:", error)
    return NextResponse.json({ error: "Failed to delete workflow" }, { status: 500 })
  }
}

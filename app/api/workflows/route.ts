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

const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"

export async function GET() {
  try {
    console.log("[v0] GET /api/workflows called")
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("workflows")
      .select("*")
      .eq("user_id", DEFAULT_USER_ID)
      .order("updated_at", { ascending: false })

    if (error) throw error

    console.log("[v0] Workflows API returning data:", JSON.stringify(data, null, 2))

    return NextResponse.json({ workflows: data || [] })
  } catch (error) {
    console.error("[v0] Error fetching workflows:", error)
    return NextResponse.json({ error: "Failed to fetch workflows" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] POST /api/workflows called")

    const body = await request.json()
    console.log("[v0] Request body:", body)

    const { name, description } = body
    console.log("[v0] Extracted values:", { name, description })

    const supabase = createAdminClient()
    console.log("[v0] Admin client created")

    const insertData = {
      name,
      description,
      chat_history: [],
      user_id: DEFAULT_USER_ID,
      status: "draft",
    }
    console.log("[v0] Insert data:", insertData)

    const { data, error } = await supabase.from("workflows").insert(insertData).select().single()

    console.log("[v0] Supabase insert result:", { data, error })

    if (error) {
      console.error("[v0] Supabase error details:", error)
      throw error
    }

    console.log("[v0] Workflow created successfully:", data)
    return NextResponse.json({ workflow: data })
  } catch (error) {
    console.error("[v0] Error creating workflow:", error)

    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorDetails = error instanceof Error && "details" in error ? (error as any).details : null

    return NextResponse.json(
      {
        error: "Failed to create workflow",
        details: errorMessage,
        supabaseDetails: errorDetails,
      },
      { status: 500 },
    )
  }
}

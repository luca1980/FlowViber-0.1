import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  try {
    console.log("[v0] N8n Config API: Getting n8n configuration")

    const supabase = createAdminClient()

    // Get the default user ID (same approach as other endpoints)
    const defaultUserId = "00000000-0000-0000-0000-000000000001"

    // Get n8n instance URL from profiles table
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("n8n_instance_url")
      .eq("id", defaultUserId)
      .single()

    if (profileError && profileError.code !== "PGRST116") {
      console.log("[v0] N8n Config API: Profile query error:", profileError)
      throw profileError
    }

    const n8nInstanceUrl = profile?.n8n_instance_url || null
    console.log("[v0] N8n Config API: Retrieved URL:", n8nInstanceUrl ? "configured" : "not configured")

    return NextResponse.json({
      status: 200,
      result: {
        n8nInstanceUrl,
      },
    })
  } catch (error) {
    console.error("[v0] N8n Config API: Error getting configuration:", error)
    return NextResponse.json({ error: "Failed to get n8n configuration" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { n8nInstanceUrl } = await request.json()
    console.log("[v0] N8n Config API: Saving n8n instance URL")

    const supabase = createAdminClient()

    // Get the default user ID (same approach as other endpoints)
    const defaultUserId = "00000000-0000-0000-0000-000000000001"

    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        id: defaultUserId,
        n8n_instance_url: n8nInstanceUrl,
        display_name: "Development User",
        updated_at: new Date().toISOString(),
      })
      .select()

    if (error) {
      console.error("[v0] N8n Config API: Database error:", error)
      throw error
    }

    console.log("[v0] N8n Config API: Successfully saved n8n instance URL")

    return NextResponse.json({
      status: 200,
      result: {
        success: true,
        data,
      },
    })
  } catch (error) {
    console.error("[v0] N8n Config API: Error saving configuration:", error)
    return NextResponse.json({ error: "Failed to save n8n configuration" }, { status: 500 })
  }
}

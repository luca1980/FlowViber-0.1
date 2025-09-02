import { type NextRequest, NextResponse } from "next/server"
import n8nApi from "@/lib/n8n-api"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workflowId = searchParams.get("workflowId")

    console.log("[v0] Errors API: Retrieving workflow errors")

    // Get errors from n8n
    const errors = await n8nApi.getWorkflowErrors(workflowId || undefined)

    console.log("[v0] Errors API: Retrieved", errors.length, "error executions")

    return NextResponse.json({
      success: true,
      errors: errors.map((execution) => ({
        id: execution.id,
        workflowId: execution.workflowId,
        status: execution.status,
        startedAt: execution.startedAt,
        stoppedAt: execution.stoppedAt,
        error: execution.data?.resultData?.error || "Unknown error",
      })),
    })
  } catch (error) {
    console.error("[v0] Errors API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retrieve errors" },
      { status: 500 },
    )
  }
}

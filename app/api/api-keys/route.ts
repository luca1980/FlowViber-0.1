import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

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

  try {
    const { data: userById, error: userByIdError } = await supabaseAdmin.auth.admin.getUserById(defaultUserId)
    if (userById.user && !userByIdError) {
      console.log("[v0] Default user found by ID:", defaultUserId)
      return userById.user.id
    }
  } catch (error) {
    console.log("[v0] User not found by ID, checking by email")
  }

  // Check if user exists by email
  const { data: userByEmail } = await supabaseAdmin.auth.admin.listUsers()
  const existingUser = userByEmail.users.find((user) => user.email === defaultEmail)

  if (existingUser) {
    console.log("[v0] Default user found by email:", existingUser.id)
    return existingUser.id
  }

  try {
    const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
      user_id: defaultUserId,
      email: defaultEmail,
      password: "temp-password-123",
      email_confirm: true,
    })

    if (error) {
      console.error("[v0] Failed to create default user:", error.message)

      if (error.message.includes("already been registered")) {
        const { data: retryUserList } = await supabaseAdmin.auth.admin.listUsers()
        const retryUser = retryUserList.users.find((user) => user.email === defaultEmail || user.id === defaultUserId)
        if (retryUser) {
          console.log("[v0] Found existing user after creation failure:", retryUser.id)
          return retryUser.id
        }
      }

      throw new Error(`Failed to create or find default user: ${error.message}`)
    }

    console.log("[v0] Created new default user:", newUser.user?.id)
    return newUser.user?.id || defaultUserId
  } catch (createError) {
    console.error("[v0] Error in user creation:", createError)

    const { data: finalUserList } = await supabaseAdmin.auth.admin.listUsers()
    const finalUser = finalUserList.users.find((user) => user.email === defaultEmail || user.id === defaultUserId)
    if (finalUser) {
      console.log("[v0] Final fallback found user:", finalUser.id)
      return finalUser.id
    }

    throw createError
  }
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
      console.log("[v0] API Keys: Using authenticated user ID:", user.id)
      return user.id
    } else {
      console.log("[v0] API Keys: No authenticated user, using default user")
    }
  } catch (error) {
    console.log("[v0] API Keys: Authentication check failed, using default user:", error)
  }

  // Fallback to default user
  const defaultUserId = await ensureDefaultUser()
  console.log("[v0] API Keys: Using default user ID:", defaultUserId)
  return defaultUserId
}

export async function PUT(request: NextRequest) {
  try {
    const { provider, key } = await request.json()

    let isValid = false
    let errorMessage = ""

    switch (provider) {
      case "openai":
        try {
          const response = await fetch("https://api.openai.com/v1/models", {
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
          })
          isValid = response.ok
          if (!isValid) {
            const error = await response.json()
            errorMessage = error.error?.message || "Invalid OpenAI API key"
          }
        } catch (error) {
          errorMessage = "Failed to connect to OpenAI API"
        }
        break

      case "claude":
        try {
          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": key,
              "Content-Type": "application/json",
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-3-haiku-20240307",
              max_tokens: 1,
              messages: [{ role: "user", content: "test" }],
            }),
          })
          isValid = response.ok || response.status === 400 // 400 is expected for minimal test
          if (!isValid && response.status !== 400) {
            const error = await response.json()
            errorMessage = error.error?.message || "Invalid Claude API key"
          }
        } catch (error) {
          errorMessage = "Failed to connect to Claude API"
        }
        break

      case "n8n":
        try {
          // For n8n, we'll just validate the key format since it's instance-specific
          isValid = key.length > 10 // Basic validation
          if (!isValid) {
            errorMessage = "Invalid n8n API key format"
          }
        } catch (error) {
          errorMessage = "Failed to validate n8n API key"
        }
        break

      default:
        errorMessage = "Unknown provider"
    }

    return NextResponse.json({
      isValid,
      errorMessage: isValid ? null : errorMessage,
    })
  } catch (error) {
    console.error("[v0] API key test exception:", error)
    return NextResponse.json(
      {
        isValid: false,
        errorMessage: "Failed to test API key",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { provider, key } = await request.json()

    const userId = await getUserId()

    const { error } = await supabaseAdmin.from("api_keys").upsert(
      {
        user_id: userId,
        provider,
        encrypted_key: key,
      },
      {
        onConflict: "user_id,provider",
      },
    )

    if (error) {
      console.error("[v0] API key save error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] API key save exception:", error)
    return NextResponse.json({ error: "Failed to save API key" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { provider } = await request.json()

    const userId = await getUserId()

    const { error } = await supabaseAdmin.from("api_keys").delete().eq("user_id", userId).eq("provider", provider)

    if (error) {
      console.error("[v0] API key delete error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] API key delete exception:", error)
    return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const userId = await getUserId()

    const { data, error } = await supabaseAdmin.from("api_keys").select("provider, encrypted_key").eq("user_id", userId)

    if (error) {
      console.error("[v0] API key fetch error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data,
      defaultUserId: userId,
    })
  } catch (error) {
    console.error("[v0] API key fetch exception:", error)
    return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 })
  }
}

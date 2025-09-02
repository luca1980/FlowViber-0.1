"use client"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Copy, Key, Eye, EyeOff, Globe } from "lucide-react"
import { useState, useEffect } from "react"
import { useToast } from "@/components/ui/toast"
import { createClient } from "@/lib/supabase/client"

interface ApiKeyConfig {
  provider: string
  key: string
  isConnected: boolean
  isLoading: boolean
  showKey: boolean
  error?: string
  showSuccessMessage?: boolean
}

interface N8nConfig {
  baseUrl: string
  isLoading: boolean
  error?: string
  showSuccessMessage?: boolean
}

interface RightPanelProps {
  generatedWorkflowJson?: string
}

const TEMP_USER_ID = "00000000-0000-0000-0000-000000000001"

export default function RightPanel({ generatedWorkflowJson }: RightPanelProps) {
  const { addToast, ToastContainer } = useToast()

  const [n8nConfig, setN8nConfig] = useState<N8nConfig>({
    baseUrl: "",
    isLoading: false,
    showSuccessMessage: false,
  })

  const [apiKeys, setApiKeys] = useState<Record<string, ApiKeyConfig>>({
    n8n: {
      provider: "n8n",
      key: "",
      isConnected: false,
      isLoading: false,
      showKey: false,
      showSuccessMessage: false,
    },
    openai: {
      provider: "openai",
      key: "",
      isConnected: false,
      isLoading: false,
      showKey: false,
      showSuccessMessage: false,
    },
    claude: {
      provider: "claude",
      key: "",
      isConnected: false,
      isLoading: false,
      showKey: false,
      showSuccessMessage: false,
    },
  })

  useEffect(() => {
    loadApiKeys()
    loadN8nConfig()
  }, [])

  const loadN8nConfig = async () => {
    try {
      const response = await fetch("/api/n8n-config")
      const result = await response.json()

      if (result.result?.n8nInstanceUrl) {
        setN8nConfig((prev) => ({ ...prev, baseUrl: result.result.n8nInstanceUrl }))
        return
      }
    } catch (error) {
      console.error("[v0] Failed to load n8n URL from API:", error)
    }

    // Fallback to environment variable or localStorage
    const savedBaseUrl = process.env.NEXT_PUBLIC_N8N_BASE_URL || localStorage.getItem("n8n_base_url") || ""
    setN8nConfig((prev) => ({ ...prev, baseUrl: savedBaseUrl }))
  }

  const saveN8nConfig = async () => {
    if (!n8nConfig.baseUrl.trim()) {
      addToast({
        type: "warning",
        title: "Base URL Required",
        description: "Please enter a valid n8n base URL.",
      })
      return
    }

    try {
      new URL(n8nConfig.baseUrl)
    } catch {
      addToast({
        type: "error",
        title: "Invalid URL",
        description: "Please enter a valid URL (e.g., https://your-n8n-instance.com)",
      })
      return
    }

    setN8nConfig((prev) => ({ ...prev, isLoading: true, error: undefined, showSuccessMessage: false }))

    try {
      console.log("[v0] Starting n8n URL save process")

      const response = await fetch("/api/n8n-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          n8nInstanceUrl: n8nConfig.baseUrl,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to save n8n configuration")
      }

      console.log("[v0] Successfully saved n8n URL via API")

      // Also save to localStorage as backup
      localStorage.setItem("n8n_base_url", n8nConfig.baseUrl)
      console.log("[v0] Saved n8n URL to localStorage")

      setN8nConfig((prev) => ({ ...prev, showSuccessMessage: true }))
      addToast({
        type: "success",
        title: "Base URL Saved",
        description: "n8n base URL saved successfully to database and localStorage.",
      })
    } catch (error) {
      console.error("[v0] n8n URL save error:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to save base URL"
      setN8nConfig((prev) => ({ ...prev, error: errorMessage }))
      addToast({
        type: "error",
        title: "Save Failed",
        description: `Failed to save n8n base URL: ${errorMessage}`,
      })
    } finally {
      setN8nConfig((prev) => ({ ...prev, isLoading: false }))
    }
  }

  const clearN8nConfig = async () => {
    try {
      const response = await fetch("/api/n8n-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          n8nInstanceUrl: null,
        }),
      })

      if (!response.ok) {
        console.error("[v0] Failed to clear n8n URL via API")
      }
    } catch (error) {
      console.error("[v0] Failed to clear n8n URL from database:", error)
    }

    localStorage.removeItem("n8n_base_url")
    setN8nConfig({
      baseUrl: "",
      isLoading: false,
      showSuccessMessage: false,
    })
    addToast({
      type: "success",
      title: "Base URL Cleared",
      description: "n8n base URL cleared successfully.",
    })
  }

  const updateApiKey = (provider: string, field: keyof ApiKeyConfig, value: any) => {
    setApiKeys((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [field]: value,
      },
    }))
  }

  const loadApiKeys = async () => {
    try {
      const response = await fetch("/api/api-keys")
      const result = await response.json()

      if (result.data) {
        const keysToTest: { provider: string; key: string }[] = []

        result.data.forEach((item: any) => {
          if (apiKeys[item.provider]) {
            updateApiKey(item.provider, "key", item.encrypted_key)
            keysToTest.push({ provider: item.provider, key: item.encrypted_key })
          }
        })

        for (const { provider, key } of keysToTest) {
          await testConnection(provider, key)
        }
      }
    } catch (error) {
      console.error("[v0] Failed to load API keys:", error)
    }
  }

  const saveApiKey = async (provider: string) => {
    const config = apiKeys[provider]
    if (!config.key.trim()) {
      addToast({
        type: "warning",
        title: "API Key Required",
        description: "Please enter an API key before saving.",
      })
      return
    }

    updateApiKey(provider, "isLoading", true)
    updateApiKey(provider, "error", undefined)
    updateApiKey(provider, "showSuccessMessage", false)

    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          key: config.key,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to save API key")
      }

      addToast({
        type: "success",
        title: "API Key Saved",
        description: `${provider.toUpperCase()} API key saved successfully.`,
      })

      await testConnection(provider, undefined, true)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to save API key"
      updateApiKey(provider, "error", errorMessage)
      addToast({
        type: "error",
        title: "Save Failed",
        description: `Failed to save ${provider.toUpperCase()} API key: ${errorMessage}`,
      })
      console.error("[v0] Failed to save API key:", error)
    } finally {
      updateApiKey(provider, "isLoading", false)
    }
  }

  const testConnection = async (provider: string, keyOverride?: string, showSuccessMessage = false) => {
    const config = apiKeys[provider]
    const keyToTest = keyOverride || config.key

    if (!keyToTest.trim()) {
      addToast({
        type: "warning",
        title: "API Key Required",
        description: "Please enter an API key before testing.",
      })
      return
    }

    updateApiKey(provider, "isLoading", true)
    updateApiKey(provider, "error", undefined)
    updateApiKey(provider, "showSuccessMessage", false)

    try {
      const response = await fetch("/api/api-keys", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          key: keyToTest,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.errorMessage || "Failed to test connection")
      }

      updateApiKey(provider, "isConnected", result.isValid)

      if (result.isValid) {
        if (showSuccessMessage) {
          updateApiKey(provider, "showSuccessMessage", true)
        }
        if (!keyOverride) {
          addToast({
            type: "success",
            title: "Connection Successful",
            description: `${provider.toUpperCase()} API key is working properly.`,
          })
        }
      } else {
        const errorMessage = result.errorMessage || "Connection test failed"
        updateApiKey(provider, "error", errorMessage)
        if (!keyOverride) {
          addToast({
            type: "error",
            title: "Connection Failed",
            description: `${provider.toUpperCase()} connection test failed: ${errorMessage}`,
          })
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Connection test failed"
      updateApiKey(provider, "error", errorMessage)
      updateApiKey(provider, "isConnected", false)
      if (!keyOverride) {
        addToast({
          type: "error",
          title: "Connection Failed",
          description: `${provider.toUpperCase()} connection test failed: ${errorMessage}`,
        })
      }
      console.error(`[v0] ${provider} connection test failed:`, error)
    } finally {
      updateApiKey(provider, "isLoading", false)
    }
  }

  const clearConfig = async (provider: string) => {
    if (provider === "n8n") {
      await clearN8nConfig()
      return
    }

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await supabase.from("profiles").update({ n8n_instance_url: null }).eq("id", user.id)
      }
    } catch (error) {
      console.error("[v0] Failed to clear n8n URL from database:", error)
    }

    localStorage.removeItem("n8n_base_url")
    setApiKeys((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        key: "",
        isConnected: false,
        error: undefined,
        showSuccessMessage: false,
      },
    }))
    addToast({
      type: "success",
      title: "API Key Cleared",
      description: `${provider.toUpperCase()} API key cleared successfully.`,
    })
  }

  const copyToClipboard = async () => {
    if (!generatedWorkflowJson) return

    try {
      await navigator.clipboard.writeText(generatedWorkflowJson)
      addToast({
        type: "success",
        title: "Copied to Clipboard",
        description: "Workflow JSON copied successfully.",
      })
    } catch (error) {
      addToast({
        type: "error",
        title: "Copy Failed",
        description: "Failed to copy workflow JSON to clipboard.",
      })
    }
  }

  const renderApiKeySection = (provider: string, title: string, description: string) => {
    const config = apiKeys[provider]

    return (
      <div className="bg-slate-700 rounded-lg p-4 border border-slate-600">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-slate-600 rounded flex items-center justify-center">
              <Key className="w-3 h-3 text-slate-400" />
            </div>
            <span className="font-medium text-slate-300">{title}</span>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded ${
              config.isConnected ? "bg-green-600 text-white" : "bg-slate-600 text-slate-300"
            }`}
          >
            {config.isConnected ? "Connected" : "Not Connected"}
          </span>
        </div>

        <p className="text-sm text-slate-400 mb-4">{description}</p>

        <div className="space-y-4">
          <div>
            <Label className="block text-sm font-medium text-slate-300 mb-2">API Key</Label>
            <div className="relative">
              <Input
                type={config.showKey ? "text" : "password"}
                value={config.key}
                onChange={(e) => updateApiKey(provider, "key", e.target.value)}
                placeholder={`Enter your ${title} API key`}
                className="bg-slate-800 border-slate-600 text-slate-300 pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-8 w-8 p-0"
                onClick={() => updateApiKey(provider, "showKey", !config.showKey)}
              >
                {config.showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => saveApiKey(provider)}
              disabled={config.isLoading || !config.key.trim()}
            >
              {config.isLoading ? "Testing..." : "Save & Test"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-slate-600 bg-transparent"
              onClick={() => clearConfig(provider)}
            >
              Clear
            </Button>
          </div>

          {config.isConnected && config.showSuccessMessage && (
            <div className="bg-green-900/20 border border-green-700 rounded p-3">
              <p className="text-sm text-green-400">✓ Connection successful! API key is working properly.</p>
            </div>
          )}

          {config.error && !config.isConnected && (
            <div className="bg-red-900/20 border border-red-700 rounded p-3">
              <p className="text-sm text-red-400">✗ {config.error}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderN8nBaseUrlSection = () => {
    return (
      <div className="bg-slate-700 rounded-lg p-4 border border-slate-600">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-slate-600 rounded flex items-center justify-center">
              <Globe className="w-3 h-3 text-slate-400" />
            </div>
            <span className="font-medium text-slate-300">n8n Instance URL</span>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded ${
              n8nConfig.baseUrl ? "bg-blue-600 text-white" : "bg-slate-600 text-slate-300"
            }`}
          >
            {n8nConfig.baseUrl ? "Configured" : "Not Configured"}
          </span>
        </div>

        <p className="text-sm text-slate-400 mb-4">
          Configure the base URL of your n8n instance for workflow deployment and management
        </p>

        <div className="space-y-4">
          <div>
            <Label className="block text-sm font-medium text-slate-300 mb-2">Base URL</Label>
            <Input
              type="url"
              value={n8nConfig.baseUrl}
              onChange={(e) => setN8nConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://your-n8n-instance.com"
              className="bg-slate-800 border-slate-600 text-slate-300"
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={saveN8nConfig}
              disabled={n8nConfig.isLoading || !n8nConfig.baseUrl.trim()}
            >
              {n8nConfig.isLoading ? "Saving..." : "Save"}
            </Button>
            <Button size="sm" variant="outline" className="border-slate-600 bg-transparent" onClick={clearN8nConfig}>
              Clear
            </Button>
          </div>

          {n8nConfig.showSuccessMessage && (
            <div className="bg-green-900/20 border border-green-700 rounded p-3">
              <p className="text-sm text-green-400">✓ Base URL saved successfully!</p>
            </div>
          )}

          {n8nConfig.error && (
            <div className="bg-red-900/20 border border-red-700 rounded p-3">
              <p className="text-sm text-red-400">✗ {n8nConfig.error}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="w-96 bg-slate-800 border-l border-slate-700 flex flex-col h-full">
      <ToastContainer />

      <Tabs defaultValue="json" className="flex flex-col h-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-700 m-4 mb-0">
          <TabsTrigger
            value="json"
            className="data-[state=active]:bg-slate-600 text-white data-[state=active]:text-white"
          >
            JSON
          </TabsTrigger>
          <TabsTrigger
            value="advanced"
            className="data-[state=active]:bg-slate-600 text-white data-[state=active]:text-white"
          >
            Advanced
          </TabsTrigger>
        </TabsList>

        <TabsContent value="json" className="flex-1 flex flex-col m-4 mt-4 h-0">
          <div className="mb-4 flex-shrink-0">
            <h3 className="font-semibold text-white mb-1">Generated Workflow JSON</h3>
            <p className="text-sm text-slate-400 mb-3">
              {generatedWorkflowJson ? "Workflow generated successfully" : "No workflow generated yet"}
            </p>
            {generatedWorkflowJson && (
              <div className="flex gap-2 mb-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-600 bg-transparent hover:bg-slate-700"
                  onClick={copyToClipboard}
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </Button>
              </div>
            )}
          </div>

          <div
            className="flex-1 bg-slate-900 rounded-lg p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800"
            style={{ maxHeight: "calc(100vh - 300px)" }}
          >
            {generatedWorkflowJson ? (
              <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed break-words">
                {generatedWorkflowJson}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                <p>JSON workflow will appear here</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="flex-1 m-4 mt-4 overflow-auto h-0">
          <div>
            <h3 className="font-semibold text-white mb-2">Advanced Settings</h3>
            <p className="text-sm text-slate-400 mb-6">Configure API keys and connections for workflow integrations.</p>

            <div className="space-y-6">
              {renderN8nBaseUrlSection()}

              {renderApiKeySection(
                "n8n",
                "n8n API Key",
                "Configure your n8n API key for workflow deployment and execution",
              )}

              {renderApiKeySection("openai", "OpenAI API", "Configure OpenAI API access for AI-powered workflow nodes")}

              {renderApiKeySection(
                "claude",
                "Claude API",
                "Configure Anthropic Claude API for advanced AI capabilities",
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

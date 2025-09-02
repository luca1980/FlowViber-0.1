"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[v0] ErrorBoundary caught:", error, errorInfo)

    // Log to your error tracking service
    if (typeof window !== "undefined") {
      // Could send to Sentry, LogRocket, etc.
      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      }

      // Store in localStorage for debugging
      const errors = JSON.parse(localStorage.getItem("flow_viber_errors") || "[]")
      errors.push(errorData)
      if (errors.length > 10) errors.shift() // Keep only last 10 errors
      localStorage.setItem("flow_viber_errors", JSON.stringify(errors))
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  handleGoHome = () => {
    window.location.href = "/"
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Something went wrong</h1>
                <p className="text-sm text-slate-400">An unexpected error occurred</p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-lg p-4 mb-4">
              <p className="text-sm text-slate-300 font-mono">{this.state.error?.message || "Unknown error"}</p>
              {process.env.NODE_ENV === "development" && (
                <details className="mt-3">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">Show details</summary>
                  <pre className="text-xs text-slate-500 mt-2 whitespace-pre-wrap">{this.state.error?.stack}</pre>
                </details>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={this.handleReset} className="flex-1 bg-blue-600 hover:bg-blue-700">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
              <Button onClick={this.handleGoHome} variant="outline" className="flex-1 border-slate-600 bg-transparent">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Wrap your app with this in layout.tsx:
// <ErrorBoundary>{children}</ErrorBoundary>

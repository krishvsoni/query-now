"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import ResponseGraph from "../components/ResponseGraph"

interface SavedGraph {
  messageId: string
  query: string
  timestamp: string
  nodeCount: number
  edgeCount: number
  knowledgeGraph: any
}

export default function KnowledgeGraphsPage() {
  const router = useRouter()
  const [savedGraphs, setSavedGraphs] = useState<SavedGraph[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGraph, setSelectedGraph] = useState<SavedGraph | null>(null)
  const [showGraph, setShowGraph] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    loadSavedGraphs()
  }, [])

  const loadSavedGraphs = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/chat/history")
      const data = await response.json()

      const graphMessages: SavedGraph[] = data
        .filter(
          (msg: any) =>
            msg.role === "assistant" && msg.metadata?.knowledgeGraph && msg.metadata.knowledgeGraph.nodes?.length > 0,
        )
        .map((msg: any) => ({
          messageId: msg.id,
          query: msg.content.slice(0, 100) + (msg.content.length > 100 ? "..." : ""),
          timestamp: msg.timestamp,
          nodeCount: msg.metadata.knowledgeGraph.nodes?.length || 0,
          edgeCount: msg.metadata.knowledgeGraph.edges?.length || 0,
          knowledgeGraph: msg.metadata.knowledgeGraph,
        }))

      setSavedGraphs(graphMessages)
    } catch (error) {
      console.error("Error loading saved graphs:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewGraph = (graph: SavedGraph) => {
    setSelectedGraph(graph)
    setShowGraph(true)
  }

  const filteredGraphs = savedGraphs.filter((graph) => graph.query.toLowerCase().includes(searchTerm.toLowerCase()))

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors duration-200 mb-6 group"
          >
            <svg
              className="w-5 h-5 transition-transform duration-200 group-hover:-translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Chat
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Response Graphs</h1>
              <p className="text-slate-600 mt-1 text-lg">Knowledge graphs generated from your chat conversations</p>
            </div>
          </div>
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-blue-900 mb-1">What are Response Graphs?</h4>
                <p className="text-sm text-blue-700 leading-relaxed">
                  These graphs are automatically extracted from the AI's answers to your questions. 
                  They visualize the key entities, concepts, and relationships mentioned in each response. 
                  Each graph is unique to its conversation context.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="mb-8">
          <div className="relative max-w-2xl">
            <svg
              className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search by query..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 transition-all duration-200 text-slate-900 placeholder-slate-400 shadow-sm hover:shadow-md"
            />
          </div>
        </div>
        {loading && (
          <div className="text-center py-20">
            <div className="relative inline-flex">
              <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <div
                className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-purple-400 rounded-full animate-spin"
                style={{ animationDirection: "reverse", animationDuration: "1s" }}
              ></div>
            </div>
            <p className="text-slate-600 mt-6 text-lg font-medium">Loading your graphs...</p>
          </div>
        )}
        {!loading && savedGraphs.length === 0 && (
          <div className="text-center py-20 bg-white rounded-3xl shadow-xl border border-slate-200">
            <div className="p-4 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl inline-block mb-6">
              <svg className="w-20 h-20 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-3">No Response Graphs Yet</h3>
            <p className="text-slate-600 mb-8 text-lg max-w-md mx-auto">
              Knowledge graphs are automatically generated from your chat responses. Start asking questions to see them here!
            </p>
            <button
              onClick={() => router.push("/chat")}
              className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl font-semibold text-lg transform hover:scale-105"
            >
              Go to Chat
            </button>
          </div>
        )}
        {!loading && filteredGraphs.length > 0 && (
          <>
            <div className="mb-4 text-sm text-slate-600">
              Found <span className="font-semibold text-slate-900">{filteredGraphs.length}</span> response graph{filteredGraphs.length !== 1 ? 's' : ''}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGraphs.map((graph) => (
              <div
                key={graph.messageId}
                className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-6 cursor-pointer border border-slate-200 hover:border-indigo-300 transform hover:-translate-y-1 group"
                onClick={() => handleViewGraph(graph)}
              >
                <div className="mb-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700 rounded-full font-semibold border border-purple-200">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  Chat Response
                </div>
                <div className="mb-5">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-base font-semibold text-slate-900 line-clamp-3 leading-snug group-hover:text-indigo-600 transition-colors">
                      {graph.query}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="font-medium">
                      {new Date(graph.timestamp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span>
                      {new Date(graph.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mb-5">
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg flex-1">
                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-sm"></div>
                    <span className="text-sm font-semibold text-blue-700">{graph.nodeCount}</span>
                    <span className="text-xs text-blue-600">nodes</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg flex-1">
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-sm"></div>
                    <span className="text-sm font-semibold text-emerald-700">{graph.edgeCount}</span>
                    <span className="text-xs text-emerald-600">edges</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleViewGraph(graph)
                  }}
                  className="w-full px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 font-semibold shadow-md hover:shadow-lg transform group-hover:scale-105 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                  Visualize Graph
                </button>
              </div>
            ))}
          </div>
          </>
        )}
        {!loading && searchTerm && filteredGraphs.length === 0 && (
          <div className="text-center py-20 bg-white rounded-3xl shadow-xl border border-slate-200">
            <div className="p-4 bg-slate-100 rounded-2xl inline-block mb-4">
              <svg className="w-16 h-16 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <p className="text-slate-600 text-lg">
              No graphs found matching <span className="font-semibold text-slate-900">"{searchTerm}"</span>
            </p>
          </div>
        )}
      </div>
      {selectedGraph && (
        <ResponseGraph
          isOpen={showGraph}
          onClose={() => {
            setShowGraph(false)
            setSelectedGraph(null)
          }}
          graphData={selectedGraph.knowledgeGraph}
          query={selectedGraph.query}
        />
      )}
    </div>
  )
}

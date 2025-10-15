"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import dynamic from 'next/dynamic'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-64">Loading graph...</div>
})

interface Node {
  id: string
  label: string
  type: string
  properties?: any
}

interface Edge {
  id: string
  source: string
  target: string
  label: string
  type?: string
  properties?: any
}

interface ResponseGraphProps {
  isOpen: boolean
  onClose: () => void
  graphData: { 
    nodes: Node[]; 
    edges: Edge[];
    metadata?: {
      cypherQuery?: string;
      entityCount?: number;
      relationshipCount?: number;
      source?: string;
    }
  }
  query?: string
}

interface GraphNode {
  id: string
  name: string
  type: string
  group: number
  size: number
  color: string
  description?: string
  properties?: any
}

interface GraphLink {
  source: string
  target: string
  type: string
  strength: number
  color: string
}

interface ProcessedGraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

function cleanGraphData(data: { nodes: Node[]; edges: Edge[] }): { nodes: Node[]; edges: Edge[] } {
  const seenNodeIds = new Set<string>()
  const seenEdgeIds = new Set<string>()
  
  const cleanNodes = data.nodes.filter(node => {
    if (!node || !node.id || seenNodeIds.has(node.id)) return false
    seenNodeIds.add(node.id)
    return true
  }).map(node => ({
    ...node,
    label: node.label || node.id,
    type: node.type || 'CONCEPT'
  }))
  
  const cleanEdges = data.edges.filter(edge => {
    if (!edge || !edge.source || !edge.target) return false
    const edgeKey = `${edge.source}-${edge.target}-${edge.label}`
    if (seenEdgeIds.has(edgeKey)) return false
    seenEdgeIds.add(edgeKey)
    return seenNodeIds.has(edge.source) && seenNodeIds.has(edge.target)
  }).map(edge => ({
    ...edge,
    label: edge.label || 'RELATED_TO',
    id: edge.id || `${edge.source}-${edge.target}`
  }))
  
  return { nodes: cleanNodes, edges: cleanEdges }
}

export default function ResponseGraph({ isOpen, onClose, graphData, query }: ResponseGraphProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [showLegend, setShowLegend] = useState(false)
  const [processedData, setProcessedData] = useState<ProcessedGraphData>({ nodes: [], links: [] })
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set())
  const [showCypherQuery, setShowCypherQuery] = useState(false)
  const fgRef = useRef<any>(null)

  const nodeTypeConfig = {
    PERSON: { color: '#3B82F6', size: 8 },
    ORGANIZATION: { color: '#8b5cf6', size: 10 },
    CONCEPT: { color: '#f59e0b', size: 6 },
    LOCATION: { color: '#10b981', size: 7 },
    EVENT: { color: '#ef4444', size: 9 },
    TECHNOLOGY: { color: '#06b6d4', size: 7 },
    PRODUCT: { color: '#84CC16', size: 6 },
    default: { color: '#6B7280', size: 5 }
  }

  useEffect(() => {
    if (graphData && isOpen) {
      const cleaned = cleanGraphData(graphData)
      
      console.log('[ResponseGraph] Processing graph data:', {
        originalNodes: graphData.nodes?.length || 0,
        originalEdges: graphData.edges?.length || 0,
        cleanedNodes: cleaned.nodes.length,
        cleanedEdges: cleaned.edges.length
      })

      const nodes: GraphNode[] = cleaned.nodes.map((node: Node) => {
        const config = nodeTypeConfig[node.type as keyof typeof nodeTypeConfig] || nodeTypeConfig.default
        return {
          id: node.id,
          name: node.label || node.id,
          type: node.type || 'CONCEPT',
          description: node.properties?.description || '',
          properties: node.properties,
          size: config.size,
          color: config.color,
          group: Object.keys(nodeTypeConfig).indexOf(node.type) || 0
        }
      })

      const links: GraphLink[] = cleaned.edges.map((edge: Edge) => ({
        source: edge.source,
        target: edge.target,
        type: edge.label || edge.type || 'RELATED_TO',
        color: '#94A3B8',
        strength: edge.properties?.confidence || 1
      }))

      setProcessedData({ nodes, links })
    }
  }, [graphData, isOpen])

  useEffect(() => {
    if (graphData && isOpen) {
      const cleaned = cleanGraphData(graphData)
      
      console.log('[ResponseGraph] Processing graph data:', {
        originalNodes: graphData.nodes?.length || 0,
        originalEdges: graphData.edges?.length || 0,
        cleanedNodes: cleaned.nodes.length,
        cleanedEdges: cleaned.edges.length
      })

      const nodes: GraphNode[] = cleaned.nodes.map((node: Node) => {
        const config = nodeTypeConfig[node.type as keyof typeof nodeTypeConfig] || nodeTypeConfig.default
        return {
          id: node.id,
          name: node.label || node.id,
          type: node.type || 'CONCEPT',
          description: node.properties?.description || '',
          properties: node.properties,
          size: config.size,
          color: config.color,
          group: Object.keys(nodeTypeConfig).indexOf(node.type) || 0
        }
      })

      const links: GraphLink[] = cleaned.edges.map((edge: Edge) => ({
        source: edge.source,
        target: edge.target,
        type: edge.label || edge.type || 'RELATED_TO',
        color: '#94A3B8',
        strength: edge.properties?.confidence || 1
      }))

      setProcessedData({ nodes, links })
    }
  }, [graphData, isOpen])

  const handleNodeClick = (node: any) => {
    setSelectedNode(node)
  }

  const handleNodeHover = (node: any | null) => {
    setHoveredNode(node ? node.id : null)
  }

  const paintNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name
    const fontSize = 12 / globalScale
    ctx.font = `${fontSize}px Sans-Serif`
    ctx.beginPath()
    ctx.arc(node.x, node.y, node.size, 0, 2 * Math.PI, false)
    if (highlightedNodes.has(node.id)) {
      ctx.fillStyle = '#fbbf24'
    } else {
      ctx.fillStyle = node.color
    }
    ctx.fill()
    if (hoveredNode === node.id || selectedNode?.id === node.id) {
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 2 / globalScale
      ctx.stroke()
    }
    if (highlightedNodes.has(node.id)) {
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 3 / globalScale
      ctx.stroke()
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = highlightedNodes.has(node.id) ? '#b45309' : '#333'
    ctx.fillText(label, node.x, node.y + node.size + fontSize)
  }

  const handleExport = (format: 'json' | 'png' | 'svg') => {
    if (format === 'json') {
      const dataStr = JSON.stringify(graphData, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `knowledge-graph-${Date.now()}.json`
      link.click()
      URL.revokeObjectURL(url)
    } else if (format === 'png' && fgRef.current) {
      const canvas = fgRef.current.renderer().domElement
      const link = document.createElement('a')
      link.download = `knowledge-graph-${Date.now()}.png`
      link.href = canvas.toDataURL()
      link.click()
    }
    setShowExportMenu(false)
  }

  const handleSearch = (term: string) => {
    setSearchTerm(term)
    if (term.trim()) {
      const matches = new Set(
        processedData.nodes
          .filter(n => 
            n.name.toLowerCase().includes(term.toLowerCase()) ||
            n.type.toLowerCase().includes(term.toLowerCase())
          )
          .map(n => n.id)
      )
      setHighlightedNodes(matches)
    } else {
      setHighlightedNodes(new Set())
    }
  }

  const handleTypeFilter = (type: string | null) => {
    setFilterType(type)
  }

  const getVisibleData = () => {
    if (!filterType) return processedData

    const visibleNodes = processedData.nodes.filter(n => n.type === filterType)
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id))
    const visibleLinks = processedData.links.filter(
      l => visibleNodeIds.has(l.source as string) && visibleNodeIds.has(l.target as string)
    )

    return { nodes: visibleNodes, links: visibleLinks }
  }

  const visibleData = getVisibleData()

  if (!isOpen) return null

  if (!processedData || processedData.nodes.length === 0) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 animate-in zoom-in-95 duration-300">
          <div className="text-center">
            <div className="p-4 bg-slate-100 rounded-2xl inline-block mb-4">
              <svg className="w-16 h-16 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-3">No Graph Data Available</h3>
            <p className="text-slate-600 mb-6">
              This response doesn't contain a knowledge graph visualization.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl h-[85vh] flex flex-col animate-in zoom-in-95 duration-300">
        <div className="flex items-start justify-between p-6 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-3xl">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Response Knowledge Graph</h2>
            </div>
            {query && (
              <p className="text-sm text-slate-600 ml-1 mt-2 font-medium">
                <span className="text-slate-500">Query:</span> {query}
              </p>
            )}
            <div className="flex items-center gap-3 mt-4 ml-1">
              <span className="inline-flex items-center gap-2 text-sm px-4 py-2 bg-blue-100 text-blue-700 rounded-xl font-semibold shadow-sm">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="6" />
                </svg>
                {processedData.nodes.length} Nodes
              </span>
              <span className="inline-flex items-center gap-2 text-sm px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-semibold shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 20 20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                {processedData.links.length} Relationships
              </span>
            </div>
            <div className="flex items-center gap-3 mt-4 ml-1">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search nodes..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full px-4 py-2 pl-10 bg-white text-black border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
                <svg className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <select
                value={filterType || ''}
                onChange={(e) => handleTypeFilter(e.target.value || null)}
                className="px-4 py-2 bg-white border text-black border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
              >
                <option value="">All Types</option>
                <option value="PERSON">Person</option>
                <option value="ORGANIZATION">Organization</option>
                <option value="LOCATION">Location</option>
                <option value="CONCEPT">Concept</option>
                <option value="EVENT">Event</option>
                <option value="TECHNOLOGY">Technology</option>
                <option value="PRODUCT">Product</option>
              </select>
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-black hover:bg-slate-50 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export
                </button>
                {showExportMenu && (
                  <div className="absolute top-full mt-2 right-0 bg-white text-black rounded-xl shadow-xl border border-slate-200 py-2 z-10 min-w-[150px]">
                    <button
                      onClick={() => handleExport('json')}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
                    >
                      Export as JSON
                    </button>
                    <button
                      onClick={() => handleExport('png')}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
                    >
                      Export as PNG
                    </button>
                  </div>
                )}
              </div>
              {graphData.metadata?.cypherQuery && (
                <button
                  onClick={() => setShowCypherQuery(!showCypherQuery)}
                  className="px-4 py-2 bg-indigo-50 border border-indigo-300 rounded-xl hover:bg-indigo-100 transition-colors text-sm font-medium flex items-center gap-2 text-indigo-700"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  {showCypherQuery ? 'Hide' : 'Show'} Cypher
                </button>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-white rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {showCypherQuery && graphData.metadata?.cypherQuery && (
          <div className="px-6 pb-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
            <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                  Neo4j Cypher Query
                </h3>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(graphData.metadata?.cypherQuery || '');
                  }}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded-lg transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
              </div>
              <pre className="text-xs text-cyan-300 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                {graphData.metadata.cypherQuery}
              </pre>
            </div>
          </div>
        )}
        <div className="flex-1 relative bg-gradient-to-br from-slate-50 to-slate-100">
          <ForceGraph2D
            ref={fgRef}
            graphData={visibleData}
            nodeLabel={(node: any) => `${node.name} (${node.type})`}
            nodeColor={(node: any) => node.color}
            nodeVal={(node: any) => node.size}
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
              ctx.fillStyle = color
              ctx.beginPath()
              ctx.arc(node.x, node.y, node.size * 1.5, 0, 2 * Math.PI, false)
              ctx.fill()
            }}
            linkColor={(link: any) => link.color}
            linkWidth={(link: any) => Math.sqrt(link.strength || 1) * 2}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.005}
            linkLabel={(link: any) => link.type}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            cooldownTicks={150}
            d3AlphaDecay={0.015}
            d3VelocityDecay={0.2}
            warmupTicks={100}
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            backgroundColor="#ffffff"
          />
          {showLegend && (
            <div className="absolute top-6 right-6 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-5 border border-slate-200 min-w-[200px]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 text-sm">Node Types</h3>
                <button
                  onClick={() => setShowLegend(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                  <div className="w-4 h-4 rounded-full bg-blue-500 shadow-sm"></div>
                  <span className="text-sm font-medium text-slate-700">Person</span>
                </div>
                <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-purple-50 transition-colors">
                  <div className="w-4 h-4 rounded-full bg-purple-500 shadow-sm"></div>
                  <span className="text-sm font-medium text-slate-700">Organization</span>
                </div>
                <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors">
                  <div className="w-4 h-4 rounded-full bg-emerald-500 shadow-sm"></div>
                  <span className="text-sm font-medium text-slate-700">Location</span>
                </div>
                <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-orange-50 transition-colors">
                  <div className="w-4 h-4 rounded-full bg-orange-500 shadow-sm"></div>
                  <span className="text-sm font-medium text-slate-700">Concept</span>
                </div>
                <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                  <div className="w-4 h-4 rounded-full bg-red-500 shadow-sm"></div>
                  <span className="text-sm font-medium text-slate-700">Event</span>
                </div>
                <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-cyan-50 transition-colors">
                  <div className="w-4 h-4 rounded-full bg-cyan-500 shadow-sm"></div>
                  <span className="text-sm font-medium text-slate-700">Technology</span>
                </div>
              </div>
            </div>
          )}
          {!showLegend && (
            <button
              onClick={() => setShowLegend(true)}
              className="absolute top-6 right-6 p-3 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 border border-slate-200"
              title="Show node types legend"
            >
              <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          )}
          {selectedNode && (
            <div className="absolute bottom-6 left-6 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 max-w-md border border-slate-200 animate-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full shadow-sm ${
                      selectedNode.type === "PERSON"
                        ? "bg-blue-500"
                        : selectedNode.type === "ORGANIZATION"
                          ? "bg-purple-500"
                          : selectedNode.type === "LOCATION"
                            ? "bg-emerald-500"
                            : selectedNode.type === "CONCEPT"
                              ? "bg-orange-500"
                              : selectedNode.type === "EVENT"
                                ? "bg-red-500"
                                : selectedNode.type === "TECHNOLOGY"
                                  ? "bg-cyan-500"
                                  : "bg-slate-500"
                    }`}
                  ></div>
                  <h3 className="font-bold text-slate-900 text-lg">{selectedNode.name}</h3>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mb-4 px-3 py-2 bg-slate-100 rounded-lg">
                <p className="text-sm text-slate-600">
                  Type: <span className="font-semibold text-slate-900">{selectedNode.type}</span>
                </p>
              </div>
              {selectedNode.description && (
                <div className="mb-4 px-3 py-2 bg-blue-50 rounded-lg">
                  <p className="text-sm text-slate-700">{selectedNode.description}</p>
                </div>
              )}
              {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                <div className="mb-4 space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Properties</h4>
                  <div className="space-y-1.5">
                    {Object.entries(selectedNode.properties).map(([key, value]) => (
                      <div key={key} className="text-sm px-3 py-2 bg-slate-50 rounded-lg">
                        <span className="font-semibold text-slate-700">{key}:</span>{" "}
                        <span className="text-slate-600">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="pt-4 border-t border-slate-200">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Relationships</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {processedData.links
                    .filter((link) => link.source === selectedNode.id || link.target === selectedNode.id)
                    .map((link, idx) => {
                      const otherNodeId = link.source === selectedNode.id ? link.target : link.source
                      const otherNode = processedData.nodes.find((n) => n.id === otherNodeId)
                      const isOutgoing = link.source === selectedNode.id
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-sm px-3 py-2 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg"
                        >
                          <span className={`font-semibold ${isOutgoing ? "text-emerald-600" : "text-blue-600"}`}>
                            {isOutgoing ? "→" : "←"}
                          </span>
                          <span className="text-slate-600 font-medium">{link.type}</span>
                          <span className="text-slate-900 font-semibold">{otherNode?.name || "Unknown"}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-slate-100 border-t border-slate-200 rounded-b-3xl">
          <div className="flex items-center justify-center gap-6 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                />
              </svg>
              <span className="font-medium">Click nodes for details</span>
            </div>
            <span className="text-slate-400">•</span>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                />
              </svg>
              <span className="font-medium">Zoom & pan enabled</span>
            </div>
            <span className="text-slate-400">•</span>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="font-medium">Interactive physics simulation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { 
  MagnifyingGlassIcon, 
  AdjustmentsHorizontalIcon,
  XMarkIcon,
  SparklesIcon,
  ArrowPathIcon,
  RectangleGroupIcon,
  CodeBracketIcon
} from '@heroicons/react/24/outline';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-64">Loading graph...</div>
});

interface Node {
  id: string;
  name: string;
  type: string;
  group: number;
  size?: number;
  color?: string;
  description?: string;
}

interface Link {
  source: string;
  target: string;
  type: string;
  strength?: number;
  color?: string;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

interface GraphVisualizationProps {
  isOpen: boolean;
  onClose: () => void;
  query?: string;
  documentIds?: string[];
  mode?: 'central' | 'document' | 'query';
  preloadedGraphData?: { nodes: any[]; edges: any[] }; 
}

export default function GraphVisualization({ 
  isOpen, 
  onClose, 
  query, 
  documentIds,
  mode = 'query',
  preloadedGraphData
}: GraphVisualizationProps) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNodeTypes, setSelectedNodeTypes] = useState<string[]>([]);
  const [filteredData, setFilteredData] = useState<GraphData>({ nodes: [], links: [] });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showAISearch, setShowAISearch] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState('');
  const [isAISearching, setIsAISearching] = useState(false);
  const [aiSearchResults, setAiSearchResults] = useState<Node[]>([]);
  const [showTraversal, setShowTraversal] = useState(false);
  const [traversalStart, setTraversalStart] = useState<string>('');
  const [traversalEnd, setTraversalEnd] = useState<string>('');
  const [traversalPath, setTraversalPath] = useState<{nodes: Node[], distance: number} | null>(null);
  const [showCypherBuilder, setShowCypherBuilder] = useState(false);
  const [customCypher, setCustomCypher] = useState('');
  const [cypherResults, setCypherResults] = useState<any>(null);
  const [selectedRelationType, setSelectedRelationType] = useState<string>('');
  const [showGeneratedCypher, setShowGeneratedCypher] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const fgRef = useRef<any>(null);

  const nodeTypeConfig = {
    PERSON: { color: '#3B82F6', size: 8 },
    ORGANIZATION: { color: '#10B981', size: 10 },
    CONCEPT: { color: '#8B5CF6', size: 6 },
    LOCATION: { color: '#F59E0B', size: 7 },
    EVENT: { color: '#EF4444', size: 9 },
    TECHNOLOGY: { color: '#06B6D4', size: 7 },
    PRODUCT: { color: '#84CC16', size: 6 },
    default: { color: '#6B7280', size: 5 }
  };

  const handleAISearch = useCallback(async () => {
    if (!aiSearchQuery.trim()) return;
    setIsAISearching(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Find nodes in this knowledge graph that match: "${aiSearchQuery}". Graph entities: ${graphData.nodes.map(n => `${n.name} (${n.type})`).join(', ')}`
          }]
        })
      });
      const data = await response.json();
      const foundNodes = graphData.nodes.filter(node => 
        data.message?.toLowerCase().includes(node.name.toLowerCase())
      );
      setAiSearchResults(foundNodes);
      setHighlightedNodes(new Set(foundNodes.map(n => n.id)));
      if (foundNodes.length > 0 && fgRef.current) {
        const firstNode: any = foundNodes[0];
        fgRef.current.centerAt(firstNode.x, firstNode.y, 1000);
        fgRef.current.zoom(2, 1000);
      }
    } catch (error) {
      console.error('AI search failed:', error);
    } finally {
      setIsAISearching(false);
    }
  }, [aiSearchQuery, graphData.nodes]);

  const findShortestPath = useCallback((startId: string, endId: string) => {
    const visited = new Set<string>();
    const queue: { nodeId: string; path: string[] }[] = [{ nodeId: startId, path: [startId] }];
    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;
      if (nodeId === endId) {
        const pathNodes = path.map(id => graphData.nodes.find(n => n.id === id)!).filter(Boolean);
        return { nodes: pathNodes, distance: path.length - 1 };
      }
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      const neighbors = graphData.links.filter(
        link => link.source === nodeId || link.target === nodeId
      );
      for (const link of neighbors) {
        const nextId = link.source === nodeId ? link.target : link.source;
        if (!visited.has(nextId)) {
          queue.push({ nodeId: nextId, path: [...path, nextId] });
        }
      }
    }
    return null;
  }, [graphData]);

  const handleTraversal = useCallback(() => {
    if (!traversalStart || !traversalEnd) return;
    const path = findShortestPath(traversalStart, traversalEnd);
    setTraversalPath(path);
    if (path) {
      const pathNodeIds = new Set(path.nodes.map(n => n.id));
      setHighlightedNodes(pathNodeIds);
      if (fgRef.current && path.nodes.length > 0) {
        const centerNode: any = path.nodes[Math.floor(path.nodes.length / 2)];
        fgRef.current.centerAt(centerNode.x, centerNode.y, 1000);
      }
    }
  }, [traversalStart, traversalEnd, findShortestPath]);

  const executeCypherQuery = useCallback(async () => {
    if (!customCypher.trim()) return;
    try {
      const response = await fetch('/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cypherQuery: customCypher })
      });
      const data = await response.json();
      setCypherResults(data);
    } catch (error) {
      console.error('Cypher query execution failed:', error);
    }
  }, [customCypher]);

  const relationshipTypes = Array.from(new Set(graphData.links.map(l => l.type)));

  const generateCypherQuery = useCallback(() => {
    const nodeStatements = filteredData.nodes.map((node, idx) => {
      return `CREATE (n${idx}:${node.type} {id: "${node.id}", name: "${node.name.replace(/"/g, '\\"')}", type: "${node.type}"})`;
    }).join('\n');
    const edgeStatements = filteredData.links.map(link => {
      const sourceIdx = filteredData.nodes.findIndex(n => n.id === link.source);
      const targetIdx = filteredData.nodes.findIndex(n => n.id === link.target);
      return `CREATE (n${sourceIdx})-[:${link.type}]->(n${targetIdx})`;
    }).join('\n');
    return `// Create Nodes\n${nodeStatements}\n\n// Create Relationships\n${edgeStatements}`;
  }, [filteredData]);

  const fetchGraphData = async () => {
    if (!isOpen) return;
    if (preloadedGraphData) {
      const processedData = processGraphData(preloadedGraphData);
      setGraphData(processedData);
      setFilteredData(processedData);
      const types = [...new Set(processedData.nodes.map(n => n.type))];
      setSelectedNodeTypes(types);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('mode', mode);
      if (query) params.append('query', query);
      if (documentIds && documentIds.length > 0) {
        documentIds.forEach(id => params.append('documentIds', id));
      }
      const response = await fetch(`/api/graph?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch graph data');
      }
      const data = await response.json();
      const processedData = processGraphData(data);
      setGraphData(processedData);
      setFilteredData(processedData);
      const types = [...new Set(processedData.nodes.map(n => n.type))];
      setSelectedNodeTypes(types);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  };

  const processGraphData = (rawData: any): GraphData => {
    const rawNodes = rawData.nodes || [];
    const rawLinks = rawData.links || rawData.edges || [];
    const nodeMap = new Map<string, any>();
    rawNodes.forEach((node: any) => {
      const normalizedId = node.id.toLowerCase().trim();
      if (nodeMap.has(normalizedId)) {
        const existing = nodeMap.get(normalizedId);
        const existingProps = Object.keys(existing.properties || {}).length;
        const newProps = Object.keys(node.properties || {}).length;
        if (newProps > existingProps) {
          nodeMap.set(normalizedId, node);
        }
      } else {
        nodeMap.set(normalizedId, node);
      }
    });
    const nodes = Array.from(nodeMap.values()).map((node: any) => {
      const config = nodeTypeConfig[node.type as keyof typeof nodeTypeConfig] || nodeTypeConfig.default;
      return {
        id: node.id,
        name: node.label || node.name || node.id,
        type: node.type || 'CONCEPT',
        description: node.properties?.description || node.description || '',
        size: config.size,
        color: config.color,
        group: Object.keys(nodeTypeConfig).indexOf(node.type) || 0
      };
    });
    const validNodeIds = new Set(nodes.map(n => n.id));
    const seenEdges = new Set<string>();
    const links = rawLinks
      .filter((link: any) => {
        const edgeKey = `${link.source}|${link.type || 'RELATED_TO'}|${link.target}`;
        if (seenEdges.has(edgeKey)) return false;
        if (!validNodeIds.has(link.source) || !validNodeIds.has(link.target)) return false;
        seenEdges.add(edgeKey);
        return true;
      })
      .map((link: any) => ({
        source: link.source,
        target: link.target,
        type: link.type || 'RELATED_TO',
        color: '#94A3B8',
        strength: link.properties?.strength || link.strength || 1
      }));
    return { nodes, links };
  };

  useEffect(() => {
    fetchGraphData();
  }, [isOpen, query, documentIds, mode, preloadedGraphData]);

  useEffect(() => {
    const filtered = {
      nodes: graphData.nodes.filter(node => {
        const matchesSearch = !searchTerm || 
          node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (node.description && node.description.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesType = selectedNodeTypes.length === 0 || selectedNodeTypes.includes(node.type);
        return matchesSearch && matchesType;
      }),
      links: graphData.links.filter(link => {
        const sourceNode = graphData.nodes.find(n => n.id === link.source);
        const targetNode = graphData.nodes.find(n => n.id === link.target);
        const matchesRelationType = !selectedRelationType || link.type === selectedRelationType;
        return sourceNode && targetNode && 
               (selectedNodeTypes.length === 0 || 
                (selectedNodeTypes.includes(sourceNode.type) && selectedNodeTypes.includes(targetNode.type))) &&
               matchesRelationType;
      })
    };
    setFilteredData(filtered);
  }, [searchTerm, selectedNodeTypes, graphData, selectedRelationType]);

  const handleNodeClick = (node: any) => {
    setSelectedNode(node);
  };

  const handleNodeHover = (node: any | null) => {
    setHoveredNode(node ? node.id : null);
  };

  const toggleNodeType = (type: string) => {
    setSelectedNodeTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };
  
  const paintNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name;
    const fontSize = 12 / globalScale;
    ctx.font = `${fontSize}px Sans-Serif`;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.size * 1.2, 0, 2 * Math.PI, false);
    if (highlightedNodes.has(node.id)) {
      ctx.fillStyle = '#fbbf24';
    } else {
      ctx.fillStyle = node.color;
    }
    ctx.fill();
    if (hoveredNode === node.id || selectedNode?.id === node.id) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2.5 / globalScale;
      ctx.stroke();
    }
    if (highlightedNodes.has(node.id)) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3 / globalScale;
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = highlightedNodes.has(node.id) ? '#b45309' : '#333';
    ctx.fillText(label, node.x, node.y + node.size + fontSize * 1.2);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Knowledge Graph
              {mode === 'central' && ' - All Documents'}
              {mode === 'document' && ' - Single Document'}
              {mode === 'query' && ' - Query Results'}
            </h2>
            {query && (
              <p className="text-sm text-gray-600">Related to: "{query}"</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center space-x-4 p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div className="flex items-center space-x-2">
            <AdjustmentsHorizontalIcon className="h-4 w-4 text-gray-500" />
            <div className="flex flex-wrap gap-1">
              {Object.keys(nodeTypeConfig).filter(type => type !== 'default').map(type => (
                <button
                  key={type}
                  onClick={() => toggleNodeType(type)}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    selectedNodeTypes.includes(type)
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                  style={{
                    borderColor: selectedNodeTypes.includes(type) 
                      ? nodeTypeConfig[type as keyof typeof nodeTypeConfig].color 
                      : undefined
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <select
            value={selectedRelationType}
            onChange={(e) => setSelectedRelationType(e.target.value)}
            className="px-3 py-2 border text-black border-gray-300 rounded-md text-sm"
          >
            <option value="">All Relations</option>
            {relationshipTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <button
            onClick={() => setShowAISearch(!showAISearch)}
            className="px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-md text-sm flex items-center gap-1 hover:from-purple-700 hover:to-pink-700"
          >
            <SparklesIcon className="h-4 w-4" />
            AI Search
          </button>
          <button
            onClick={() => setShowTraversal(!showTraversal)}
            className="px-3 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-md text-sm flex items-center gap-1 hover:from-green-700 hover:to-teal-700"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Traverse
          </button>
          <button
            onClick={() => setShowCypherBuilder(!showCypherBuilder)}
            className="px-3 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-md text-sm flex items-center gap-1 hover:from-blue-700 hover:to-cyan-700"
          >
            <CodeBracketIcon className="h-4 w-4" />
            Cypher
          </button>
          <button
            onClick={() => setShowGeneratedCypher(!showGeneratedCypher)}
            className="px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-md text-sm flex items-center gap-1 hover:from-indigo-700 hover:to-purple-700"
          >
            <CodeBracketIcon className="h-4 w-4" />
            View Query
          </button>
        </div>
        <div className="flex-1 relative">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">Loading graph...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-600 mb-2">{error}</p>
                <button
                  onClick={fetchGraphData}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : filteredData.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p>No graph data available</p>
                <p className="text-sm mt-1">Try uploading documents with entities and relationships</p>
              </div>
            </div>
          ) : (
            <>
              <ForceGraph2D
                ref={fgRef}
                graphData={filteredData}
                nodeLabel={(node: any) => `${node.name} (${node.type})`}
                nodeColor={(node: any) => node.color}
                nodeVal={(node: any) => node.size}
                nodeCanvasObject={paintNode}
                nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                  ctx.fillStyle = color;
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, node.size * 1.8, 0, 2 * Math.PI, false);
                  ctx.fill();
                }}
                linkColor={(link: any) => link.color}
                linkWidth={(link: any) => Math.sqrt(link.strength || 1) * 1.5}
                linkDirectionalParticles={2}
                linkDirectionalParticleWidth={2}
                linkDistance={100}
                linkStrength={0.3}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                cooldownTicks={200}
                d3AlphaDecay={0.01}
                d3VelocityDecay={0.25}
                warmupTicks={100}
                enableNodeDrag={true}
                enableZoomInteraction={true}
                enablePanInteraction={true}
                backgroundColor="#ffffff"
              />
              {showAISearch && (
                <div className="absolute top-4 right-4 bg-white rounded-lg shadow-2xl p-4 w-80 border border-gray-200 max-h-96 overflow-y-auto z-10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <SparklesIcon className="h-5 w-5 text-purple-600" />
                      AI Search
                    </h3>
                    <button onClick={() => setShowAISearch(false)} className="text-gray-400 hover:text-gray-600">
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Describe what you're looking for..."
                    value={aiSearchQuery}
                    onChange={(e) => setAiSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAISearch()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
                  />
                  <button
                    onClick={handleAISearch}
                    disabled={isAISearching}
                    className="w-full px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-md text-sm hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
                  >
                    {isAISearching ? 'Searching...' : 'Search'}
                  </button>
                  {aiSearchResults.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-700">Results:</p>
                      {aiSearchResults.map(node => (
                        <div
                          key={node.id}
                          onClick={() => setSelectedNode(node)}
                          className="p-2 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer text-sm"
                        >
                          <div className="font-medium">{node.name}</div>
                          <div className="text-xs text-gray-600">{node.type}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {showTraversal && (
                <div className="absolute top-4 right-4 bg-white rounded-lg shadow-2xl p-4 w-80 border border-gray-200 z-10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <ArrowPathIcon className="h-5 w-5 text-green-600" />
                      Path Finder
                    </h3>
                    <button onClick={() => setShowTraversal(false)} className="text-gray-400 hover:text-gray-600">
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">Start Node</label>
                      <select
                        value={traversalStart}
                        onChange={(e) => setTraversalStart(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="">Select...</option>
                        {graphData.nodes.map(node => (
                          <option key={node.id} value={node.id}>{node.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">End Node</label>
                      <select
                        value={traversalEnd}
                        onChange={(e) => setTraversalEnd(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="">Select...</option>
                        {graphData.nodes.map(node => (
                          <option key={node.id} value={node.id}>{node.name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleTraversal}
                      disabled={!traversalStart || !traversalEnd}
                      className="w-full px-3 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-md text-sm hover:from-green-700 hover:to-teal-700 disabled:opacity-50"
                    >
                      Find Path
                    </button>
                    {traversalPath && (
                      <div className="mt-3 p-3 bg-green-50 rounded-md">
                        <p className="text-xs font-semibold text-green-900 mb-1">
                          Distance: {traversalPath.distance} hops
                        </p>
                        <div className="space-y-1">
                          {traversalPath.nodes.map((node, idx) => (
                            <div key={idx} className="text-xs text-gray-700">
                              {idx > 0 && '→ '}{node.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {showCypherBuilder && (
                <div className="absolute top-4 right-4 bg-white rounded-lg shadow-2xl p-4 w-96 border border-gray-200 max-h-96 overflow-y-auto z-10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <CodeBracketIcon className="h-5 w-5 text-blue-600" />
                      Cypher Query
                    </h3>
                    <button onClick={() => setShowCypherBuilder(false)} className="text-gray-400 hover:text-gray-600">
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                  <textarea
                    value={customCypher}
                    onChange={(e) => setCustomCypher(e.target.value)}
                    placeholder="MATCH (n:Entity) RETURN n LIMIT 25"
                    className="w-full px-3 py-2 text-black border border-gray-300 rounded-md text-sm font-mono mb-2 h-32"
                  />
                  <button
                    onClick={executeCypherQuery}
                    className="w-full px-3 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-md text-sm hover:from-blue-700 hover:to-cyan-700"
                  >
                    Execute Query
                  </button>
                  {cypherResults && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-md max-h-48 overflow-y-auto">
                      <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                        {JSON.stringify(cypherResults, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              {showGeneratedCypher && (
                <div className="absolute top-4 left-4 bg-white rounded-lg shadow-2xl p-4 w-96 border border-gray-200 max-h-96 overflow-y-auto z-10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <CodeBracketIcon className="h-5 w-5 text-indigo-600" />
                      Generated Cypher Query
                    </h3>
                    <button onClick={() => setShowGeneratedCypher(false)} className="text-gray-400 hover:text-gray-600">
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-3 overflow-x-auto">
                    <button
                      onClick={() => navigator.clipboard.writeText(generateCypherQuery())}
                      className="mb-2 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded flex items-center gap-1"
                    >
                      Copy Query
                    </button>
                    <pre className="text-xs text-cyan-300 font-mono whitespace-pre-wrap">
                      {generateCypherQuery()}
                    </pre>
                  </div>
                  <div className="mt-3 text-xs text-gray-600">
                    <p><strong>Nodes:</strong> {filteredData.nodes.length}</p>
                    <p><strong>Relationships:</strong> {filteredData.links.length}</p>
                  </div>
                </div>
              )}
              {selectedNode && (
                <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-2xl p-4 w-80 border border-gray-200 z-10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{selectedNode.name}</h3>
                    <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600">
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700">Type:</span>
                      <span className="px-2 py-1 bg-gray-100 rounded-md text-gray-800">{selectedNode.type}</span>
                    </div>
                    {selectedNode.description && (
                      <div>
                        <span className="font-medium text-gray-700">Description:</span>
                        <p className="text-gray-600 mt-1">{selectedNode.description}</p>
                      </div>
                    )}
                    <div className="pt-2 border-t border-gray-200">
                      <span className="font-medium text-gray-700">Connections:</span>
                      <div className="mt-1 space-y-1">
                        {graphData.links
                          .filter(link => link.source === selectedNode.id || link.target === selectedNode.id)
                          .slice(0, 5)
                          .map((link, idx) => {
                            const otherNodeId = link.source === selectedNode.id ? link.target : link.source;
                            const otherNode = graphData.nodes.find(n => n.id === otherNodeId);
                            return (
                              <div key={idx} className="text-xs text-gray-600">
                                {link.type} → {otherNode?.name || 'Unknown'}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>{filteredData.nodes.length} nodes</span>
              <span>{filteredData.links.length} connections</span>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              {Object.entries(nodeTypeConfig).filter(([type]) => type !== 'default').map(([type, config]) => (
                <div key={type} className="flex items-center space-x-1">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="text-gray-600">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

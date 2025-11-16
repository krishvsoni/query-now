'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { MailMinus as MagnifyingGlass, Sliders, X, Sparkles, ArrowDownRight as ArrowsPointingOut, LucideBrackets as CodeBracket } from 'lucide-react';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
        <p className="text-sm text-muted-foreground">Loading graph...</p>
      </div>
    </div>
  )
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
  const [isMobile, setIsMobile] = useState(false);
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

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleAISearch = useCallback(async () => {
    if (!aiSearchQuery.trim()) return;
    setIsAISearching(true);
    try {
      // Perform intelligent search on graph nodes
      const query = aiSearchQuery.toLowerCase().trim();
      const foundNodes = graphData.nodes.filter(node => {
        // Search in name
        if (node.name.toLowerCase().includes(query)) return true;
        // Search in type
        if (node.type.toLowerCase().includes(query)) return true;
        // Search in description
        if (node.description && node.description.toLowerCase().includes(query)) return true;
        // Fuzzy match for typos (simple Levenshtein distance)
        const nameParts = node.name.toLowerCase().split(' ');
        const queryParts = query.split(' ');
        for (const namePart of nameParts) {
          for (const queryPart of queryParts) {
            if (namePart.includes(queryPart) || queryPart.includes(namePart)) {
              return true;
            }
          }
        }
        return false;
      });
      
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

  const relationshipTypes = useMemo(() => 
    Array.from(new Set(graphData.links.map(l => l.type))), 
    [graphData.links]
  );

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
    const filteredNodes = graphData.nodes.filter(node => {
      const matchesSearch = !searchTerm || 
        node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (node.description && node.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesType = selectedNodeTypes.length === 0 || selectedNodeTypes.includes(node.type);
      return matchesSearch && matchesType;
    });
    
    // Create a Set of filtered node IDs for fast lookup
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    
    const filteredLinks = graphData.links.filter(link => {
      // Get the actual node IDs (handle both string IDs and object references)
      const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
      const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
      
      const matchesRelationType = !selectedRelationType || link.type === selectedRelationType;
      
      // Only include links where both nodes exist in filtered set
      return filteredNodeIds.has(sourceId) && 
             filteredNodeIds.has(targetId) && 
             matchesRelationType;
    });
    
    setFilteredData({ nodes: filteredNodes, links: filteredLinks });
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
    ctx.fillStyle = highlightedNodes.has(node.id) ? '#fbbf24' : '#ffffff';
    ctx.fillText(label, node.x, node.y + node.size + fontSize * 1.2);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-6xl h-[90vh] bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
        
        <div className="border-b border-border bg-card p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">
                Knowledge Graph 
                {mode === 'central' && ' - All Documents'}
                {mode === 'document' && ' - Single Document'}
                {mode === 'query' && ' - Query Results'}
                <div> </div>
              </h2>
              {query && (
                <p className="text-xs sm:text-sm text-muted-foreground truncate mt-1">
                  Related to: "{query}"
                </p>
                
                
              )}
               <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"
                  title="Beta"
                  aria-label="Beta"
                >
                  BETA
                </span>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 flex items-center justify-center hover:bg-muted rounded-md transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Controls Section */}
        <div className="border-b border-border bg-muted/30 overflow-x-auto">
          <div className="p-3 sm:p-4 space-y-3">
            {/* Search Bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search nodes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 h-9 sm:h-10 text-sm bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>
            </div>

            {/* Filter Badges and Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
              {/* Node Type Filters */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5" /> Entity Types
                </label>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(nodeTypeConfig).filter(type => type !== 'default').map(type => (
                    <button
                      key={type}
                      onClick={() => toggleNodeType(type)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                        selectedNodeTypes.includes(type)
                          ? 'border-primary bg-primary/10 text-foreground font-medium'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/50'
                      }`}
                      style={{
                        backgroundColor: selectedNodeTypes.includes(type) 
                          ? nodeTypeConfig[type as keyof typeof nodeTypeConfig].color + '20'
                          : undefined,
                        borderColor: selectedNodeTypes.includes(type) 
                          ? nodeTypeConfig[type as keyof typeof nodeTypeConfig].color 
                          : undefined,
                        color: selectedNodeTypes.includes(type) 
                          ? nodeTypeConfig[type as keyof typeof nodeTypeConfig].color 
                          : undefined
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Relationship Type Filter */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Relations</label>
                <select
                  value={selectedRelationType}
                  onChange={(e) => setSelectedRelationType(e.target.value)}
                  className="w-full px-3 py-2 h-9 text-sm bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                >
                  <option value="">All Relations</option>
                  {relationshipTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* AI Search */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> AI Search
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Find entities..."
                    value={aiSearchQuery}
                    onChange={(e) => setAiSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAISearch()}
                    className="flex-1 px-3 py-2 h-9 text-sm bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                  <button
                    onClick={handleAISearch}
                    disabled={isAISearching}
                    className="px-3 h-9 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    {isAISearching ? (
                      <div className="animate-spin h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Path Finder */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <ArrowsPointingOut className="h-3.5 w-3.5" /> Path Finder
                </label>
                <div className="flex gap-2">
                  <select
                    value={traversalStart}
                    onChange={(e) => setTraversalStart(e.target.value)}
                    className="flex-1 px-3 py-2 h-9 text-sm bg-input border border-border rounded-md text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  >
                    <option value="">Start</option>
                    {graphData.nodes.slice(0, 20).map(node => (
                      <option key={node.id} value={node.id}>{node.name.substring(0, 15)}</option>
                    ))}
                  </select>
                  <select
                    value={traversalEnd}
                    onChange={(e) => setTraversalEnd(e.target.value)}
                    className="flex-1 px-3 py-2 h-9 text-sm bg-input border border-border rounded-md text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  >
                    <option value="">End</option>
                    {graphData.nodes.slice(0, 20).map(node => (
                      <option key={node.id} value={node.id}>{node.name.substring(0, 15)}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleTraversal}
                    disabled={!traversalStart || !traversalEnd}
                    className="px-2.5 h-9 bg-accent hover:bg-accent/90 disabled:opacity-50 text-accent-foreground rounded-md text-xs font-medium transition-colors"
                  >
                    Find
                  </button>
                </div>
              </div>
            </div>

            {/* Cypher Query Section */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <CodeBracket className="h-3.5 w-3.5" /> Cypher Query
              </label>
              <div className="flex gap-2">
                <textarea
                  value={customCypher}
                  onChange={(e) => setCustomCypher(e.target.value)}
                  placeholder="MATCH (n:Entity) RETURN n LIMIT 25"
                  className="flex-1 px-3 py-2 text-xs bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono h-16 resize-none"
                />
                <div className="flex flex-col gap-2">
                  <button
                    onClick={executeCypherQuery}
                    className="px-3 h-9 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    Execute
                  </button>
                  <button
                    onClick={() => setShowGeneratedCypher(!showGeneratedCypher)}
                    className="px-3 h-9 bg-muted hover:bg-muted/80 text-foreground rounded-md text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    View Query
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Graph Canvas */}
        <div className="flex-1 relative overflow-hidden bg-background">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Loading graph...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-sm text-destructive mb-2">{error}</p>
                <button 
                  onClick={fetchGraphData}
                  className="px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-md font-medium transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : filteredData.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">No graph data available</p>
                <p className="text-xs text-muted-foreground">Try uploading documents with entities and relationships</p>
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
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                cooldownTicks={200}
                d3AlphaDecay={0.01}
                d3VelocityDecay={0.25}
                warmupTicks={100}
                enableNodeDrag={true}
                enableZoomInteraction={true}
                enablePanInteraction={true}
                backgroundColor="transparent"
              />

              {/* Selected Node Details - Desktop Only */}
              {selectedNode && !isMobile && (
                <div className="absolute bottom-4 left-4 z-10 w-80 max-h-96 animate-fade-in">
                  <div className="bg-card border border-border rounded-lg shadow-lg p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-foreground truncate">{selectedNode.name}</h3>
                      <button
                        onClick={() => setSelectedNode(null)}
                        className="h-6 w-6 flex-shrink-0 flex items-center justify-center hover:bg-muted rounded-md transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Type</p>
                      <span className="inline-block px-2.5 py-1 bg-primary/10 text-primary rounded-md text-xs font-medium">
                        {selectedNode.type}
                      </span>
                    </div>

                    {selectedNode.description && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                        <p className="text-sm text-foreground line-clamp-3">{selectedNode.description}</p>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Connections</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {graphData.links
                          .filter(link => link.source === selectedNode.id || link.target === selectedNode.id)
                          .slice(0, 5)
                          .map((link, idx) => {
                            const otherNodeId = link.source === selectedNode.id ? link.target : link.source;
                            const otherNode = graphData.nodes.find(n => n.id === otherNodeId);
                            return (
                              <div key={idx} className="text-xs text-muted-foreground">
                                <span className="text-primary font-medium">{link.type}</span> → {otherNode?.name}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Path Results - Desktop Only */}
              {traversalPath && !isMobile && (
                <div className="absolute top-4 right-4 z-10 w-80 max-h-64 animate-fade-in">
                  <div className="bg-card border border-primary/50 bg-primary/5 rounded-lg shadow-lg p-4">
                    <div className="mb-3">
                      <h3 className="font-semibold text-foreground text-sm">Path Found</h3>
                      <p className="text-xs text-muted-foreground">Distance: {traversalPath.distance} hops</p>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {traversalPath.nodes.map((node, idx) => (
                        <div key={idx} className="text-xs text-foreground">
                          {idx > 0 && '↓ '}{node.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* AI Search Results - Desktop Only */}
              {aiSearchResults.length > 0 && !isMobile && (
                <div className="absolute top-4 left-4 z-10 w-80 max-h-64 animate-fade-in">
                  <div className="bg-card border border-primary/50 bg-primary/5 rounded-lg shadow-lg p-4">
                    <h3 className="font-semibold text-foreground text-sm mb-2">AI Search Results ({aiSearchResults.length})</h3>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {aiSearchResults.map(node => (
                        <button
                          key={node.id}
                          onClick={() => setSelectedNode(node)}
                          className="w-full p-2 bg-card hover:bg-muted rounded-md transition-colors text-left border border-border"
                        >
                          <p className="text-sm font-medium truncate text-foreground">{node.name}</p>
                          <p className="text-xs text-muted-foreground">{node.type}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Generated Cypher Query */}
              {showGeneratedCypher && (
                <div className="absolute inset-4 z-20 bg-card border-2 border-primary rounded-lg shadow-2xl p-4 overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <CodeBracket className="h-4 w-4 text-primary" />
                      Generated Cypher Query
                    </h3>
                    <button
                      onClick={() => setShowGeneratedCypher(false)}
                      className="h-6 w-6 flex items-center justify-center hover:bg-muted rounded-md transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-3 flex-1 overflow-auto mb-3">
                    <button
                      onClick={() => navigator.clipboard.writeText(generateCypherQuery())}
                      className="mb-2 px-2 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded font-medium transition-colors"
                    >
                      Copy Query
                    </button>
                    <pre className="text-xs text-cyan-300 font-mono whitespace-pre-wrap overflow-x-auto">
                      {generateCypherQuery()}
                    </pre>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-2">
                    <p><strong>Nodes:</strong> {filteredData.nodes.length}</p>
                    <p><strong>Relationships:</strong> {filteredData.links.length}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-border bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
            <div className="flex gap-4">
              <span>{filteredData.nodes.length} nodes</span>
              <span>{filteredData.links.length} connections</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(nodeTypeConfig)
                .filter(([type]) => type !== 'default')
                .slice(0, isMobile ? 3 : 7)
                .map(([type, config]) => (
                  <div key={type} className="flex items-center gap-1">
                    <div 
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: config.color }}
                    />
                    <span className="hidden sm:inline text-xs">{type}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

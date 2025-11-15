"use client";
import type React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { MagnifyingGlassIcon, FunnelIcon, XMarkIcon, SparklesIcon, CodeBracketIcon } from '@heroicons/react/24/outline';

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
          <p className="text-sm text-muted-foreground">Loading graph...</p>
        </div>
      </div>
    ),
  }
);

interface Node {
  id: string;
  label: string;
  type: string;
  properties?: any;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  label: string;
  type?: string;
  properties?: any;
}

interface ResponseGraphProps {
  isOpen: boolean;
  onClose: () => void;
  graphData: {
    nodes: Node[];
    edges: Edge[];
    metadata?: {
      cypherQuery?: string;
      entityCount?: number;
      relationshipCount?: number;
      source?: string;
    };
  };
  query?: string;
}

interface GraphNode {
  id: string;
  name: string;
  type: string;
  group: number;
  size: number;
  color: string;
  description?: string;
  properties?: any;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
  strength: number;
  color: string;
  properties?: any;
}

interface ProcessedGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface TraversalPath {
  nodes: GraphNode[];
  edges: GraphLink[];
  distance: number;
}

interface OntologyClass {
  name: string;
  properties: string[];
  relationships: string[];
}

function cleanGraphData(data: { nodes: Node[]; edges: Edge[] }): {
  nodes: Node[];
  edges: Edge[];
} {
  const seenNodeIds = new Set<string>();
  const seenEdgeIds = new Set<string>();
  const nodeIdMap = new Map<string, Node>();
  data.nodes.forEach((node) => {
    if (!node || !node.id) return;
    const normalizedId = node.id.toLowerCase().trim();
    if (nodeIdMap.has(normalizedId)) {
      const existing = nodeIdMap.get(normalizedId)!;
      const existingProps = Object.keys(existing.properties || {}).length;
      const newProps = Object.keys(node.properties || {}).length;
      const existingConf = existing.properties?.confidence || 0;
      const newConf = node.properties?.confidence || 0;
      if (newProps > existingProps || newConf > existingConf) {
        nodeIdMap.set(normalizedId, node);
      }
    } else {
      nodeIdMap.set(normalizedId, node);
    }
  });
  const cleanNodes = Array.from(nodeIdMap.values()).map((node) => ({
    ...node,
    label: node.label || node.id,
    type: node.type || "CONCEPT",
  }));
  cleanNodes.forEach((node) => seenNodeIds.add(node.id.toLowerCase().trim()));
  const cleanEdges = data.edges
    .filter((edge) => {
      if (!edge || !edge.source || !edge.target) return false;
      const normalizedSource = edge.source.toLowerCase().trim();
      const normalizedTarget = edge.target.toLowerCase().trim();
      const edgeKey = `${normalizedSource}|${edge.label || "RELATED_TO"}|${normalizedTarget}`;
      if (seenEdgeIds.has(edgeKey)) return false;
      if (!seenNodeIds.has(normalizedSource) || !seenNodeIds.has(normalizedTarget))
        return false;
      seenEdgeIds.add(edgeKey);
      return true;
    })
    .map((edge) => ({
      ...edge,
      label: edge.label || "RELATED_TO",
      id: edge.id || `${edge.source}-${edge.target}`,
    }));
  return { nodes: cleanNodes, edges: cleanEdges };
}

export default function ResponseGraph({
  isOpen,
  onClose,
  graphData,
  query,
}: ResponseGraphProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [processedData, setProcessedData] = useState<ProcessedGraphData>({
    nodes: [],
    links: [],
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [showCypherQuery, setShowCypherQuery] = useState(false);
  const [showAISearch, setShowAISearch] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [aiSearchResults, setAiSearchResults] = useState<GraphNode[]>([]);
  const [isAISearching, setIsAISearching] = useState(false);
  const [showTraversal, setShowTraversal] = useState(false);
  const [traversalStart, setTraversalStart] = useState<string>("");
  const [traversalEnd, setTraversalEnd] = useState<string>("");
  const [traversalPath, setTraversalPath] = useState<TraversalPath | null>(null);
  const [showOntology, setShowOntology] = useState(false);
  const [ontologyClasses, setOntologyClasses] = useState<OntologyClass[]>([]);
  const [selectedRelationType, setSelectedRelationType] = useState<string | null>(null);
  const [customCypherQuery, setCustomCypherQuery] = useState("");
  const [cypherResults, setCypherResults] = useState<any>(null);
  const [showGeneratedCypher, setShowGeneratedCypher] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const fgRef = useRef<any>(null);

  const nodeTypeConfig = {
    PERSON: { color: "#3B82F6", size: 8 },
    ORGANIZATION: { color: "#8b5cf6", size: 10 },
    CONCEPT: { color: "#f59e0b", size: 6 },
    LOCATION: { color: "#10b981", size: 7 },
    EVENT: { color: "#ef4444", size: 9 },
    TECHNOLOGY: { color: "#06b6d4", size: 7 },
    PRODUCT: { color: "#84CC16", size: 6 },
    default: { color: "#6B7280", size: 5 },
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
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `Find nodes in this knowledge graph that match: "${aiSearchQuery}". Graph entities: ${processedData.nodes
                .map((n) => `${n.name} (${n.type})`)
                .join(", ")}`,
            },
          ],
        }),
      });
      const data = await response.json();
      const foundNodes = processedData.nodes.filter((node) =>
        data.message?.toLowerCase().includes(node.name.toLowerCase())
      );
      setAiSearchResults(foundNodes);
      setHighlightedNodes(new Set(foundNodes.map((n) => n.id)));
      if (foundNodes.length > 0 && fgRef.current) {
        fgRef.current.centerAt(foundNodes[0].x, foundNodes[0].y, 1000);
        fgRef.current.zoom(2, 1000);
      }
    } catch (error) {
      console.error("AI search failed:", error);
    } finally {
      setIsAISearching(false);
    }
  }, [aiSearchQuery, processedData.nodes]);

  const findShortestPath = useCallback(
    (startId: string, endId: string): TraversalPath | null => {
      if (startId === endId) {
        const node = processedData.nodes.find((n) => n.id === startId);
        if (!node) return null;
        return { nodes: [node], edges: [], distance: 0 };
      }
      const visited = new Set<string>();
      const queue: {
        nodeId: string;
        path: string[];
        edges: GraphLink[];
      }[] = [{ nodeId: startId, path: [startId], edges: [] }];
      visited.add(startId);
      while (queue.length > 0) {
        const { nodeId, path, edges } = queue.shift()!;
        const neighbors = processedData.links.filter(
          (link) => {
            const linkSource =
              typeof link.source === "object" ? (link.source as any).id : link.source;
            const linkTarget =
              typeof link.target === "object" ? (link.target as any).id : link.target;
            return linkSource === nodeId || linkTarget === nodeId;
          }
        );
        for (const link of neighbors) {
          const linkSource =
            typeof link.source === "object" ? (link.source as any).id : link.source;
          const linkTarget =
            typeof link.target === "object" ? (link.target as any).id : link.target;
          const nextId = linkSource === nodeId ? linkTarget : linkSource;
          if (!visited.has(nextId)) {
            visited.add(nextId);
            const newPath = [...path, nextId];
            const newEdges = [...edges, link];
            if (nextId === endId) {
              const pathNodes = newPath
                .map((id) => processedData.nodes.find((n) => n.id === id)!)
                .filter(Boolean);
              return {
                nodes: pathNodes,
                edges: newEdges,
                distance: newPath.length - 1,
              };
            }
            queue.push({
              nodeId: nextId,
              path: newPath,
              edges: newEdges,
            });
          }
        }
      }
      return null;
    },
    [processedData]
  );

  const handleTraversal = useCallback(() => {
    if (!traversalStart || !traversalEnd) return;
    const path = findShortestPath(traversalStart, traversalEnd);
    setTraversalPath(path);
    if (path) {
      const pathNodeIds = new Set(path.nodes.map((n) => n.id));
      setHighlightedNodes(pathNodeIds);
      if (fgRef.current && path.nodes.length > 0) {
        const centerNode = path.nodes[Math.floor(path.nodes.length / 2)];
        fgRef.current.centerAt(centerNode.x, centerNode.y, 1000);
      }
    }
  }, [traversalStart, traversalEnd, findShortestPath]);

  const executeCypherQuery = useCallback(async () => {
    if (!customCypherQuery.trim()) return;
    try {
      const response = await fetch("/api/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cypherQuery: customCypherQuery,
        }),
      });
      const data = await response.json();
      setCypherResults(data);
    } catch (error) {
      console.error("Cypher query execution failed:", error);
    }
  }, [customCypherQuery]);

  const getFilteredByRelation = useCallback(() => {
    if (!selectedRelationType) return processedData;
    const filteredLinks = processedData.links.filter(
      (l) => l.type === selectedRelationType
    );
    const nodeIds = new Set<string>();
    filteredLinks.forEach((link) => {
      const linkSource =
        typeof link.source === "object" ? (link.source as any).id : link.source;
      const linkTarget =
        typeof link.target === "object" ? (link.target as any).id : link.target;
      nodeIds.add(linkSource);
      nodeIds.add(linkTarget);
    });
    const filteredNodes = processedData.nodes.filter((n) => nodeIds.has(n.id));
    return { nodes: filteredNodes, links: filteredLinks };
  }, [selectedRelationType, processedData]);

  const relationshipTypes = Array.from(
    new Set(processedData.links.map((l) => l.type))
  );

  const getVisibleData = () => {
    let data = processedData;
    if (selectedRelationType) {
      data = getFilteredByRelation();
    }
    if (filterType) {
      const visibleNodes = data.nodes.filter((n) => n.type === filterType);
      const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
      const visibleLinks = data.links.filter((l) => {
        const linkSource =
          typeof l.source === "object" ? (l.source as any).id : l.source;
        const linkTarget =
          typeof l.target === "object" ? (l.target as any).id : l.target;
        return (
          visibleNodeIds.has(linkSource) && visibleNodeIds.has(linkTarget)
        );
      });
      data = { nodes: visibleNodes, links: visibleLinks };
    }
    return data;
  };

  const generateCurrentCypherQuery = useCallback(() => {
    const visibleData = getVisibleData();
    const nodeStatements = visibleData.nodes
      .map((node, idx) => {
        const props = Object.entries(node.properties || {})
          .filter(
            ([_, v]) =>
              v !== null && v !== undefined && typeof v !== "object"
          )
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(", ");
        return `CREATE (n${idx}:${node.type} {id: "${node.id}", label: "${
          node.name.replace(/"/g, '\\"')
        }"${props ? ", " + props : ""}})`;
      })
      .join("\n");
    const edgeStatements = visibleData.links
      .map((link) => {
        const sourceIdx = visibleData.nodes.findIndex(
          (n) => n.id === link.source
        );
        const targetIdx = visibleData.nodes.findIndex(
          (n) => n.id === link.target
        );
        const props =
          link.properties && Object.keys(link.properties).length > 0
            ? " {" +
              Object.entries(link.properties)
                .filter(
                  ([_, v]) =>
                    v !== null && v !== undefined && typeof v !== "object"
                )
                .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                .join(", ") +
              "}"
            : "";
        return `CREATE (n${sourceIdx})-[:${link.type}${props}]->(n${targetIdx})`;
      })
      .join("\n");
    return `// Generated Cypher Query for Current Graph State\n// Nodes: ${
      visibleData.nodes.length
    }, Relationships: ${
      visibleData.links.length
    }\n\n${nodeStatements}\n\n${edgeStatements}`;
  }, [processedData, selectedRelationType, filterType]);

  useEffect(() => {
    if (graphData && isOpen) {
      const cleaned = cleanGraphData(graphData);
      const nodes: GraphNode[] = cleaned.nodes.map((node: Node, index: number) => {
        const config =
          nodeTypeConfig[node.type as keyof typeof nodeTypeConfig] ||
          nodeTypeConfig.default;
        
        const angle = (index / cleaned.nodes.length) * 2 * Math.PI;
        const radius = 100 + Math.random() * 200;
        
        return {
          id: node.id,
          name: node.label || node.id,
          type: node.type || "CONCEPT",
          description: node.properties?.description || "",
          properties: node.properties,
          size: config.size,
          color: config.color,
          group: Object.keys(nodeTypeConfig).indexOf(node.type) || 0,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
        };
      });
      const links: GraphLink[] = cleaned.edges.map((edge: Edge) => ({
        source: edge.source,
        target: edge.target,
        type: edge.label || edge.type || "RELATED_TO",
        color: "#94A3B8",
        strength: 0.3,
      }));
      setProcessedData({ nodes, links });
    }
  }, [graphData, isOpen]);

  useEffect(() => {
    if (processedData.nodes.length > 0) {
      const ontologyMap = new Map<string, OntologyClass>();
      processedData.nodes.forEach((node) => {
        if (!ontologyMap.has(node.type)) {
          ontologyMap.set(node.type, {
            name: node.type,
            properties: [],
            relationships: [],
          });
        }
        const ontClass = ontologyMap.get(node.type)!;
        if (node.properties) {
          Object.keys(node.properties).forEach((prop) => {
            if (!ontClass.properties.includes(prop)) {
              ontClass.properties.push(prop);
            }
          });
        }
      });
      processedData.links.forEach((link) => {
        const linkSource =
          typeof link.source === "object" ? (link.source as any).id : link.source;
        const linkTarget =
          typeof link.target === "object" ? (link.target as any).id : link.target;
        const sourceNode = processedData.nodes.find((n) => n.id === linkSource);
        const targetNode = processedData.nodes.find((n) => n.id === linkTarget);
        if (sourceNode && targetNode) {
          const ontClass = ontologyMap.get(sourceNode.type);
          const relationshipStr = `${link.type} → ${targetNode.type}`;
          if (ontClass && !ontClass.relationships.includes(relationshipStr)) {
            ontClass.relationships.push(relationshipStr);
          }
        }
      });
      setOntologyClasses(Array.from(ontologyMap.values()));
    }
  }, [processedData]);

  const handleNodeClick = (node: any) => {
    setSelectedNode(node);
  };

  const handleNodeHover = (node: any | null) => {
    setHoveredNode(node ? node.id : null);
  };

  const paintNode = (
    node: any,
    ctx: CanvasRenderingContext2D,
    globalScale: number
  ) => {
    const label = node.name;
    const fontSize = 12 / globalScale;
    const nodeRadius = node.size * 1.2;
    
    ctx.font = `${fontSize}px Sans-Serif`;
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI, false);
    
    if (highlightedNodes.has(node.id)) {
      ctx.fillStyle = "#fbbf24";
    } else {
      ctx.fillStyle = node.color;
    }
    ctx.fill();
    
    if (hoveredNode === node.id || selectedNode?.id === node.id) {
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2.5 / globalScale;
      ctx.stroke();
    }
    
    if (highlightedNodes.has(node.id)) {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 3 / globalScale;
      ctx.stroke();
    }
    
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = highlightedNodes.has(node.id) ? "#fbbf24" : "#ffffff";
    ctx.fillText(label, node.x, node.y + node.size + fontSize * 1.2);
  };

  const handleExport = (format: "json" | "png" | "svg") => {
    if (format === "json") {
      const dataStr = JSON.stringify(graphData, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `knowledge-graph-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === "png" && fgRef.current) {
      const canvas = fgRef.current.renderer().domElement;
      const link = document.createElement("a");
      link.download = `knowledge-graph-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
    setShowExportMenu(false);
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (term.trim()) {
      const matches = new Set(
        processedData.nodes
          .filter(
            (n) =>
              n.name.toLowerCase().includes(term.toLowerCase()) ||
              n.type.toLowerCase().includes(term.toLowerCase())
          )
          .map((n) => n.id)
      );
      setHighlightedNodes(matches);
    } else {
      setHighlightedNodes(new Set());
    }
  };

  const handleTypeFilter = (type: string | null) => {
    setFilterType(type);
  };

  const visibleData = getVisibleData();

  if (!isOpen) return null;
  if (!processedData || processedData.nodes.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
        <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-2xl p-8">
          <div className="text-center">
            <div className="p-4 bg-muted/50 rounded-2xl inline-block mb-4">
              <svg
                className="w-16 h-16 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-3">
              No Graph Data Available
            </h3>
            <p className="text-muted-foreground mb-6">
              This response doesn't contain a knowledge graph visualization.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-xl hover:opacity-90 transition-all duration-200 shadow-lg hover:shadow-xl font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-6xl h-[90vh] bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="border-b border-border bg-card p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">
                Response Knowledge Graph
              </h2>
              {query && (
                <p className="text-xs sm:text-sm text-muted-foreground truncate mt-1">
                  Related to: "{query}"
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 flex items-center justify-center hover:bg-muted rounded-md transition-colors"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        {/* Controls Section */}
        <div className="border-b border-border bg-muted/30 overflow-x-auto">
          <div className="p-3 sm:p-4 space-y-3">
            {/* Search Bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search nodes..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 h-9 sm:h-10 text-sm bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>
            </div>

            {/* Filter Badges and Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {/* Node Type Filters */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <FunnelIcon className="h-3.5 w-3.5" /> Entity Types
                </label>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(nodeTypeConfig)
                    .filter((type) => type !== "default")
                    .map((type) => (
                      <button
                        key={type}
                        onClick={() => handleTypeFilter(type === filterType ? null : type)}
                        className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                          filterType === type
                            ? "border-primary bg-primary/10 text-foreground font-medium"
                            : "border-border bg-card text-muted-foreground hover:border-primary/50"
                        }`}
                        style={{
                          backgroundColor: filterType === type 
                            ? nodeTypeConfig[type as keyof typeof nodeTypeConfig].color + '20'
                            : undefined,
                          borderColor: filterType === type 
                            ? nodeTypeConfig[type as keyof typeof nodeTypeConfig].color 
                            : undefined,
                          color: filterType === type 
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
                  value={selectedRelationType || ""}
                  onChange={(e) => setSelectedRelationType(e.target.value || null)}
                  className="w-full px-3 py-2 h-9 text-sm bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                >
                  <option value="">All Relations</option>
                  {relationshipTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* AI Search */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <SparklesIcon className="h-3.5 w-3.5" /> AI Search
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Find entities..."
                    value={aiSearchQuery}
                    onChange={(e) => setAiSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleAISearch()}
                    className="flex-1 px-3 py-2 h-9 text-sm bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                  <button
                    onClick={handleAISearch}
                    disabled={isAISearching}
                    className="px-3 h-9 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    {isAISearching ? (
                      <div className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
                    ) : (
                      <SparklesIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Export and Cypher Query Section */}
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="px-3 h-9 border border-border rounded-md hover:bg-muted transition-colors text-foreground text-sm flex items-center gap-1"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export
                </button>
                {showExportMenu && (
                  <div className="absolute top-full right-0 mt-2 bg-card rounded-md shadow-lg border border-border py-2 z-10 min-w-[150px]">
                    <button
                      onClick={() => handleExport("json")}
                      className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      Export as JSON
                    </button>
                    <button
                      onClick={() => handleExport("png")}
                      className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      Export as PNG
                    </button>
                  </div>
                )}
              </div>
              {graphData.metadata?.cypherQuery && (
                <button
                  onClick={() => setShowCypherQuery(!showCypherQuery)}
                  className="px-3 h-9 bg-muted hover:bg-muted/80 text-foreground rounded-md text-xs font-medium transition-colors"
                >
                  {showCypherQuery ? "Hide" : "Show"} Query
                </button>
              )}
              <button
                onClick={() => setShowGeneratedCypher(!showGeneratedCypher)}
                className="px-3 h-9 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-xs font-medium transition-colors flex items-center gap-1"
              >
                <CodeBracketIcon className="h-3.5 w-3.5" />
                View Generated
              </button>
            </div>
          </div>
        </div>
        {showCypherQuery && graphData.metadata?.cypherQuery && (
          <div className="px-6 pb-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
            <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-cyan-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                    />
                  </svg>
                  Neo4j Cypher Query
                </h3>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      graphData.metadata?.cypherQuery || ""
                    );
                  }}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded-lg transition-colors flex items-center gap-1"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
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
        
        {/* Graph Canvas */}
        <div className="flex-1 relative overflow-hidden bg-background">
          {showGeneratedCypher && (
            <div className="absolute inset-4 z-20 bg-card border-2 border-primary rounded-lg shadow-2xl p-4 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <CodeBracketIcon className="h-4 w-4 text-primary" />
                  Generated Cypher Query
                </h3>
                <button
                  onClick={() => setShowGeneratedCypher(false)}
                  className="h-6 w-6 flex items-center justify-center hover:bg-muted rounded-md transition-colors"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="bg-slate-900 rounded-lg p-3 flex-1 overflow-auto mb-3">
                <button
                  onClick={() => navigator.clipboard.writeText(generateCurrentCypherQuery())}
                  className="mb-2 px-2 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded font-medium transition-colors"
                >
                  Copy Query
                </button>
                <pre className="text-xs text-cyan-300 font-mono whitespace-pre-wrap overflow-x-auto">
                  {generateCurrentCypherQuery()}
                </pre>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-2">
                <p><strong>Nodes:</strong> {visibleData.nodes.length}</p>
                <p><strong>Relationships:</strong> {visibleData.links.length}</p>
              </div>
            </div>
          )}
          <ForceGraph2D
            ref={fgRef}
            graphData={visibleData}
            nodeLabel={(node: any) => `${node.name} (${node.type})`}
            nodeColor={(node: any) => node.color}
            nodeVal={(node: any) => node.size}
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(
              node: any,
              color: string,
              ctx: CanvasRenderingContext2D
            ) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, node.size * 1.8, 0, 2 * Math.PI, false);
              ctx.fill();
            }}
            linkColor={(link: any) => link.color}
            linkWidth={(link: any) => Math.sqrt(link.strength || 1) * 1.5}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.005}
            linkLabel={(link: any) => link.type}
            d3AlphaMin={0.001}
            d3AlphaDecay={0.01}
            d3VelocityDecay={0.25}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            cooldownTicks={200}
            warmupTicks={100}
            onEngineStop={() => {
              if (fgRef.current) {
                fgRef.current.zoomToFit(100, 80);
              }
            }}
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            backgroundColor="transparent"
          />
          {showLegend && (
            <div className="absolute top-6 right-6 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-5 border border-slate-200 min-w-[200px]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 text-sm">Node Types</h3>
                <button
                  onClick={() => setShowLegend(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="space-y-2.5">
                {Object.entries(nodeTypeConfig)
                  .filter(([type]) => type !== "default")
                  .map(([type, config]) => (
                    <div
                      key={type}
                      className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <div
                        className="w-4 h-4 rounded-full shadow-sm"
                        style={{ backgroundColor: config.color }}
                      ></div>
                      <span className="text-sm font-medium text-slate-700">
                        {type}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {!showLegend && (
            <button
              onClick={() => setShowLegend(true)}
              className="absolute top-6 right-6 p-3 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 border border-slate-200"
              title="Show node types legend"
            >
              <svg
                className="w-5 h-5 text-slate-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          )}
          
          {/* Selected Node Details - Desktop Only */}
          {!isMobile && selectedNode && (
            <div className="absolute bottom-4 left-4 z-10 w-80 max-h-96 animate-fade-in">
              <div className="bg-card border border-border rounded-lg shadow-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground truncate">{selectedNode.name}</h3>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="h-6 w-6 flex-shrink-0 flex items-center justify-center hover:bg-muted rounded-md transition-colors"
                  >
                    <XMarkIcon className="h-4 w-4" />
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
                    {processedData.links
                      .filter((link) => link.source === selectedNode.id || link.target === selectedNode.id)
                      .slice(0, 5)
                      .map((link, idx) => {
                        const otherNodeId = link.source === selectedNode.id ? link.target : link.source;
                        const otherNode = processedData.nodes.find((n) => n.id === otherNodeId);
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
          
        </div>
        
        {/* Footer */}
        <div className="border-t border-border bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
            <div className="flex gap-4">
              <span>{visibleData.nodes.length} nodes</span>
              <span>{visibleData.links.length} connections</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(nodeTypeConfig)
                .filter(([type]) => type !== "default")
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

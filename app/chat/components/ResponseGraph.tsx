"use client";
import type React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-64">
        Loading graph...
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
  const fgRef = useRef<any>(null);

  const nodeTypeConfig = {
    PERSON: { color: "#3B82F6", size: 5 },
    ORGANIZATION: { color: "#8b5cf6", size: 6 },
    CONCEPT: { color: "#f59e0b", size: 4 },
    LOCATION: { color: "#10b981", size: 5 },
    EVENT: { color: "#ef4444", size: 5 },
    TECHNOLOGY: { color: "#06b6d4", size: 5 },
    PRODUCT: { color: "#84CC16", size: 4 },
    default: { color: "#6B7280", size: 4 },
  };

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
    ctx.fillStyle = highlightedNodes.has(node.id) ? "#b45309" : "#333";
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
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-8">
          <div className="text-center">
            <div className="p-4 bg-slate-100 rounded-2xl inline-block mb-4">
              <svg
                className="w-16 h-16 text-slate-400"
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
            <h3 className="text-2xl font-bold text-slate-900 mb-3">
              No Graph Data Available
            </h3>
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
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Response Knowledge Graph
            </h2>
            {query && (
              <p className="text-sm text-gray-600">
                Related to: "{query}"
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
          >
            <svg
              className="w-5 h-5"
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
        <div className="flex items-center space-x-4 p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex-1 relative">
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"
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
              placeholder="Search nodes..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div className="flex items-center space-x-2">
            <svg
              className="h-4 w-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
              />
            </svg>
            <div className="flex flex-wrap gap-1">
              {Object.keys(nodeTypeConfig)
                .filter((type) => type !== "default")
                .map((type) => (
                  <button
                    key={type}
                    onClick={() => handleTypeFilter(type === filterType ? null : type)}
                    className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                      filterType === type
                        ? "bg-blue-100 border-blue-300 text-blue-700"
                        : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                    style={{
                      borderColor:
                        filterType === type
                          ? nodeTypeConfig[type as keyof typeof nodeTypeConfig].color
                          : undefined,
                    }}
                  >
                    {type}
                  </button>
                ))}
            </div>
          </div>
          <select
            value={selectedRelationType || ""}
            onChange={(e) => setSelectedRelationType(e.target.value || null)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">All Relations</option>
            {relationshipTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowAISearch(!showAISearch)}
            className="px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-md text-sm flex items-center gap-1 hover:from-purple-700 hover:to-pink-700"
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
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            AI Search
          </button>
          <button
            onClick={() => setShowTraversal(!showTraversal)}
            className="px-3 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-md text-sm flex items-center gap-1 hover:from-green-700 hover:to-teal-700"
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
                d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Traverse
          </button>
          <button
            onClick={() => setShowOntology(!showOntology)}
            className="px-3 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-md text-sm flex items-center gap-1 hover:from-orange-700 hover:to-red-700"
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
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            Ontology
          </button>
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm flex items-center gap-1 hover:bg-gray-50"
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
              <div className="absolute top-full right-0 mt-2 bg-white rounded-md shadow-lg border border-gray-200 py-2 z-10 min-w-[150px]">
                <button
                  onClick={() => handleExport("json")}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                >
                  Export as JSON
                </button>
                <button
                  onClick={() => handleExport("png")}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                >
                  Export as PNG
                </button>
              </div>
            )}
          </div>
          {graphData.metadata?.cypherQuery && (
            <button
              onClick={() => setShowCypherQuery(!showCypherQuery)}
              className="px-3 py-2 bg-indigo-50 border border-indigo-300 rounded-md hover:bg-indigo-100 transition-colors text-sm flex items-center gap-1 text-indigo-700"
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
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
              {showCypherQuery ? "Hide" : "Show"} Cypher
            </button>
          )}
          <button
            onClick={() => setShowGeneratedCypher(!showGeneratedCypher)}
            className="px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-md text-sm flex items-center gap-1 hover:from-indigo-700 hover:to-purple-700"
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
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
            View Query
          </button>
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
        <div className="flex-1 relative">
          {showGeneratedCypher && (
            <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-5 w-[500px] border border-purple-200 max-h-[500px] overflow-y-auto z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-purple-900 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-purple-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                  Current State Cypher Query
                </h3>
                <button
                  onClick={() => setShowGeneratedCypher(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg
                    className="w-5 h-5"
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
              <div className="bg-slate-900 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-cyan-400">
                    Neo4j Cypher
                  </span>
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(generateCurrentCypherQuery())
                    }
                    className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded flex items-center gap-1"
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
                <pre className="text-xs text-cyan-300 font-mono whitespace-pre-wrap max-h-[350px] overflow-y-auto">
                  {generateCurrentCypherQuery()}
                </pre>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div className="bg-blue-50 rounded-lg p-2">
                  <div className="font-semibold text-blue-900">Nodes</div>
                  <div className="text-blue-700 text-lg">
                    {visibleData.nodes.length}
                  </div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2">
                  <div className="font-semibold text-emerald-900">
                    Relationships
                  </div>
                  <div className="text-emerald-700 text-lg">
                    {visibleData.links.length}
                  </div>
                </div>
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
            linkDistance={100}
            linkStrength={0.3}
            d3AlphaMin={0.001}
            d3AlphaDecay={0.01}
            d3VelocityDecay={0.25}
            chargeStrength={-300}
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
                  <h3 className="font-bold text-slate-900 text-lg">
                    {selectedNode.name}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  <svg
                    className="w-5 h-5"
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
              <div className="mb-4 px-3 py-2 bg-slate-100 rounded-lg">
                <p className="text-sm text-slate-600">
                  Type:{" "}
                  <span className="font-semibold text-slate-900">
                    {selectedNode.type}
                  </span>
                </p>
              </div>
              {selectedNode.description && (
                <div className="mb-4 px-3 py-2 bg-blue-50 rounded-lg">
                  <p className="text-sm text-slate-700">
                    {selectedNode.description}
                  </p>
                </div>
              )}
              {selectedNode.properties &&
                Object.keys(selectedNode.properties).length > 0 && (
                  <div className="mb-4 space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Properties
                    </h4>
                    <div className="space-y-1.5">
                      {Object.entries(selectedNode.properties).map(
                        ([key, value]) => (
                          <div
                            key={key}
                            className="text-sm px-3 py-2 bg-slate-50 rounded-lg"
                          >
                            <span className="font-semibold text-slate-700">
                              {key}:
                            </span>{" "}
                            <span className="text-slate-600">
                              {String(value)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              <div className="pt-4 border-t border-slate-200">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Relationships
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {processedData.links
                    .filter(
                      (link) =>
                        link.source === selectedNode.id ||
                        link.target === selectedNode.id
                    )
                    .map((link, idx) => {
                      const otherNodeId =
                        link.source === selectedNode.id
                          ? link.target
                          : link.source;
                      const otherNode = processedData.nodes.find(
                        (n) => n.id === otherNodeId
                      );
                      const isOutgoing = link.source === selectedNode.id;
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-sm px-3 py-2 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg"
                        >
                          <span
                            className={`font-semibold ${
                              isOutgoing ? "text-emerald-600" : "text-blue-600"
                            }`}
                          >
                            {isOutgoing ? "→" : "←"}
                          </span>
                          <span className="text-slate-600 font-medium">
                            {link.type}
                          </span>
                          <span className="text-slate-900 font-semibold">
                            {otherNode?.name || "Unknown"}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
          {showAISearch && (
            <div className="absolute top-24 right-6 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 w-96 border border-slate-200 max-h-[500px] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-purple-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                  AI Semantic Search
                </h3>
                <button
                  onClick={() => setShowAISearch(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg
                    className="w-5 h-5"
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
              <div className="space-y-4">
                <div>
                  <input
                    type="text"
                    placeholder="e.g., 'Find all companies related to AI'"
                    value={aiSearchQuery}
                    onChange={(e) => setAiSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleAISearch()}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <button
                  onClick={handleAISearch}
                  disabled={isAISearching}
                  className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAISearching ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Searching...
                    </>
                  ) : (
                    "Search with AI"
                  )}
                </button>
                {aiSearchResults.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className="text-sm font-semibold text-slate-700">
                      Results ({aiSearchResults.length})
                    </h4>
                    {aiSearchResults.map((node) => (
                      <div
                        key={node.id}
                        onClick={() => setSelectedNode(node)}
                        className="p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                      >
                        <div className="font-semibold text-slate-900">
                          {node.name}
                        </div>
                        <div className="text-xs text-slate-600">{node.type}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {showTraversal && (
            <div className="absolute top-24 right-6 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 w-96 border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Path Finder
                </h3>
                <button
                  onClick={() => setShowTraversal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg
                    className="w-5 h-5"
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
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">
                    Start Node
                  </label>
                  <select
                    value={traversalStart}
                    onChange={(e) => setTraversalStart(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="">Select start node...</option>
                    {processedData.nodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">
                    End Node
                  </label>
                  <select
                    value={traversalEnd}
                    onChange={(e) => setTraversalEnd(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="">Select end node...</option>
                    {processedData.nodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleTraversal}
                  disabled={!traversalStart || !traversalEnd}
                  className="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:from-green-700 hover:to-teal-700 disabled:opacity-50"
                >
                  Find Shortest Path
                </button>
                {traversalPath && (
                  <div className="mt-4 p-4 bg-green-50 rounded-lg">
                    <div className="text-sm font-semibold text-green-900 mb-2">
                      Path Found! Distance: {traversalPath.distance}
                    </div>
                    <div className="space-y-1">
                      {traversalPath.nodes.map((node, idx) => (
                        <div key={idx} className="text-sm text-slate-700">
                          {idx > 0 && (
                            <span className="text-green-600 mr-2">→</span>
                          )}
                          {node.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {showOntology && (
            <div className="absolute top-24 right-6 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 w-96 border border-slate-200 max-h-[500px] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-orange-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                    />
                  </svg>
                  Visual Ontology
                </h3>
                <button
                  onClick={() => setShowOntology(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg
                    className="w-5 h-5"
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
              <div className="space-y-4">
                {ontologyClasses.map((ontClass) => (
                  <div
                    key={ontClass.name}
                    className="p-4 bg-gradient-to-br from-orange-50 to-red-50 rounded-lg border border-orange-200"
                  >
                    <h4 className="font-bold text-orange-900 mb-2">
                      {ontClass.name}
                    </h4>
                    {ontClass.properties.length > 0 && (
                      <div className="mb-2">
                        <div className="text-xs font-semibold text-slate-600 mb-1">
                          Properties:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {ontClass.properties.map((prop) => (
                            <span
                              key={prop}
                              className="text-xs px-2 py-1 bg-white rounded-md text-slate-700"
                            >
                              {prop}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {ontClass.relationships.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-slate-600 mb-1">
                          Relationships:
                        </div>
                        <div className="space-y-1">
                          {ontClass.relationships.map((rel, idx) => (
                            <div
                              key={idx}
                              className="text-xs px-2 py-1 bg-white rounded-md text-slate-700"
                            >
                              {rel}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>{visibleData.nodes.length} nodes</span>
              <span>{visibleData.links.length} connections</span>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              {Object.entries(nodeTypeConfig)
                .filter(([type]) => type !== "default")
                .map(([type, config]) => (
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

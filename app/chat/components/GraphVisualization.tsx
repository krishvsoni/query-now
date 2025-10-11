'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { 
  MagnifyingGlassIcon, 
  AdjustmentsHorizontalIcon,
  XMarkIcon 
} from '@heroicons/react/24/outline';

// Dynamically import react-force-graph-2d to avoid SSR issues
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
}

export default function GraphVisualization({ 
  isOpen, 
  onClose, 
  query, 
  documentIds 
}: GraphVisualizationProps) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNodeTypes, setSelectedNodeTypes] = useState<string[]>([]);
  const [filteredData, setFilteredData] = useState<GraphData>({ nodes: [], links: [] });
  const fgRef = useRef<any>(null);

  // Node type configurations
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

  const fetchGraphData = async () => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      if (documentIds && documentIds.length > 0) {
        documentIds.forEach(id => params.append('documentIds', id));
      }

      const response = await fetch(`/api/graph?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch graph data');
      }

      const data = await response.json();
      
      // Process and enhance the graph data
      const processedData = processGraphData(data);
      setGraphData(processedData);
      setFilteredData(processedData);

      // Get unique node types for filtering
      const types = [...new Set(processedData.nodes.map(n => n.type))];
      setSelectedNodeTypes(types);

    } catch (err) {
      console.error('Error fetching graph data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  };

  const processGraphData = (rawData: any): GraphData => {
    const nodes = rawData.nodes?.map((node: any) => {
      const config = nodeTypeConfig[node.type as keyof typeof nodeTypeConfig] || nodeTypeConfig.default;
      return {
        ...node,
        size: config.size,
        color: config.color,
        group: Object.keys(nodeTypeConfig).indexOf(node.type) || 0
      };
    }) || [];

    const links = rawData.links?.map((link: any) => ({
      ...link,
      color: '#94A3B8',
      strength: link.strength || 1
    })) || [];

    return { nodes, links };
  };

  useEffect(() => {
    fetchGraphData();
  }, [isOpen, query, documentIds]);

  useEffect(() => {
    // Filter data based on search term and selected node types
    const filtered = {
      nodes: graphData.nodes.filter(node => {
        const matchesSearch = !searchTerm || 
          node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (node.description && node.description.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesType = selectedNodeTypes.includes(node.type);
        
        return matchesSearch && matchesType;
      }),
      links: graphData.links.filter(link => {
        const sourceNode = graphData.nodes.find(n => n.id === link.source);
        const targetNode = graphData.nodes.find(n => n.id === link.target);
        
        return sourceNode && targetNode && 
               selectedNodeTypes.includes(sourceNode.type) && 
               selectedNodeTypes.includes(targetNode.type);
      })
    };

    setFilteredData(filtered);
  }, [searchTerm, selectedNodeTypes, graphData]);

  const handleNodeClick = (node: any) => {
    console.log('Node clicked:', node);
    // You could open a details panel or highlight related nodes
  };

  const handleNodeHover = (node: any | null) => {
    // Highlight connected nodes
    if (fgRef.current) {
      const highlightNodes = new Set();
      const highlightLinks = new Set();

      if (node) {
        highlightNodes.add(node.id);
        
        filteredData.links.forEach(link => {
          if (link.source === node.id || link.target === node.id) {
            highlightLinks.add(link);
            highlightNodes.add(typeof link.source === 'string' ? link.source : link.source);
            highlightNodes.add(typeof link.target === 'string' ? link.target : link.target);
          }
        });
      }

      fgRef.current.nodeColor((n: Node) => 
        !node || highlightNodes.has(n.id) ? n.color : '#D1D5DB'
      );
      
      fgRef.current.linkColor((link: Link) =>
        !node || highlightLinks.has(link) ? link.color : '#E5E7EB'
      );
    }
  };

  const toggleNodeType = (type: string) => {
    setSelectedNodeTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Knowledge Graph</h2>
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

        {/* Controls */}
        <div className="flex items-center space-x-4 p-4 border-b border-gray-200 bg-gray-50">
          {/* Search */}
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

          {/* Node type filters */}
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
        </div>

        {/* Graph */}
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
            <ForceGraph2D
              ref={fgRef}
              graphData={filteredData}
              nodeLabel={(node: any) => `${node.name} (${node.type})`}
              nodeColor={(node: any) => node.color}
              nodeVal={(node: any) => node.size}
              linkColor={(link: any) => link.color}
              linkWidth={(link: any) => Math.sqrt(link.strength || 1)}
              onNodeClick={handleNodeClick}
              onNodeHover={(node: any) => handleNodeHover(node)}
              cooldownTicks={100}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
              enableZoomInteraction={true}
              enablePanInteraction={true}
              backgroundColor="#ffffff"
            />
          )}
        </div>

        {/* Legend */}
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

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { XMarkIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline';

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
}

interface ResponseGraphProps {
    isOpen: boolean;
    onClose: () => void;
    graphData: { nodes: Node[]; edges: Edge[] };
    query?: string;
}

export default function ResponseGraph({ isOpen, onClose, graphData, query }: ResponseGraphProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
    const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
    const [isDragging, setIsDragging] = useState(false);
    const [draggedNode, setDraggedNode] = useState<string | null>(null);
    const animationFrameRef = useRef<number>();

    useEffect(() => {
        if (!isOpen || !graphData || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const container = containerRef.current;
        if (container) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        }

        const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        graphData.nodes.forEach((node, index) => {
            const angle = (index / graphData.nodes.length) * 2 * Math.PI;
            const radius = Math.min(canvas.width, canvas.height) * 0.3;
            positions.set(node.id, {
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
                vx: 0,
                vy: 0
            });
        });

        const simulate = () => {
            const damping = 0.9;
            const springStrength = 0.01;
            const repulsionStrength = 5000;
            const centerForce = 0.001;

            positions.forEach((pos1, id1) => {
                let fx = 0;
                let fy = 0;

                positions.forEach((pos2, id2) => {
                    if (id1 === id2) return;
                    const dx = pos1.x - pos2.x;
                    const dy = pos1.y - pos2.y;
                    const distSq = dx * dx + dy * dy + 0.1;
                    const dist = Math.sqrt(distSq);
                    const force = repulsionStrength / distSq;
                    fx += (dx / dist) * force;
                    fy += (dy / dist) * force;
                });

                graphData.edges.forEach(edge => {
                    if (edge.source === id1 || edge.target === id1) {
                        const otherId = edge.source === id1 ? edge.target : edge.source;
                        const otherPos = positions.get(otherId);
                        if (otherPos) {
                            const dx = otherPos.x - pos1.x;
                            const dy = otherPos.y - pos1.y;
                            fx += dx * springStrength;
                            fy += dy * springStrength;
                        }
                    }
                });

                fx += (centerX - pos1.x) * centerForce;
                fy += (centerY - pos1.y) * centerForce;

                pos1.vx = (pos1.vx + fx) * damping;
                pos1.vy = (pos1.vy + fy) * damping;

                if (!isDragging || draggedNode !== id1) {
                    pos1.x += pos1.vx;
                    pos1.y += pos1.vy;
                }

                const padding = 50;
                pos1.x = Math.max(padding, Math.min(canvas.width - padding, pos1.x));
                pos1.y = Math.max(padding, Math.min(canvas.height - padding, pos1.y));
            });
        };

        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 2;
            graphData.edges.forEach(edge => {
                const sourcePos = positions.get(edge.source);
                const targetPos = positions.get(edge.target);
                if (sourcePos && targetPos) {
                    ctx.beginPath();
                    ctx.moveTo(sourcePos.x, sourcePos.y);
                    ctx.lineTo(targetPos.x, targetPos.y);
                    ctx.stroke();

                    const midX = (sourcePos.x + targetPos.x) / 2;
                    const midY = (sourcePos.y + targetPos.y) / 2;
                    ctx.fillStyle = '#64748b';
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(edge.label, midX, midY - 5);
                }
            });

            graphData.nodes.forEach(node => {
                const pos = positions.get(node.id);
                if (!pos) return;

                const isSelected = selectedNode?.id === node.id;
                const isHovered = hoveredNode?.id === node.id;
                const radius = isSelected || isHovered ? 35 : 30;

                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);

                const colors: Record<string, string> = {
                    PERSON: '#3b82f6',
                    ORGANIZATION: '#8b5cf6',
                    LOCATION: '#10b981',
                    CONCEPT: '#f59e0b',
                    EVENT: '#ef4444',
                    TECHNOLOGY: '#06b6d4',
                    default: '#6b7280'
                };
                ctx.fillStyle = colors[node.type] || colors.default;
                ctx.fill();

                if (isSelected || isHovered) {
                    ctx.strokeStyle = '#1f2937';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const label = node.label.length > 15 ? node.label.substring(0, 12) + '...' : node.label;
                ctx.fillText(label, pos.x, pos.y);

                ctx.fillStyle = '#1f2937';
                ctx.font = '9px sans-serif';
                ctx.fillText(node.type, pos.x, pos.y + radius + 12);
            });
        };

        const animate = () => {
            simulate();
            render();
            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animate();

        const finalPositions = new Map<string, { x: number; y: number }>();
        positions.forEach((pos, id) => {
            finalPositions.set(id, { x: pos.x, y: pos.y });
        });
        setNodePositions(finalPositions);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isOpen, graphData, isDragging, draggedNode, selectedNode, hoveredNode]);

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        let clickedNode: Node | null = null;
        graphData.nodes.forEach(node => {
            const pos = nodePositions.get(node.id);
            if (pos) {
                const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
                if (dist < 30) {
                    clickedNode = node;
                }
            }
        });

        setSelectedNode(clickedNode);
    };

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (isDragging && draggedNode) {
            setNodePositions(prev => {
                const updated = new Map(prev);
                updated.set(draggedNode, { x, y });
                return updated;
            });
            return;
        }

        let hovered: Node | null = null;
        graphData.nodes.forEach(node => {
            const pos = nodePositions.get(node.id);
            if (pos) {
                const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
                if (dist < 30) {
                    hovered = node;
                }
            }
        });

        setHoveredNode(hovered);
        canvas.style.cursor = hovered ? 'pointer' : 'default';
    };

    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        graphData.nodes.forEach(node => {
            const pos = nodePositions.get(node.id);
            if (pos) {
                const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
                if (dist < 30) {
                    setIsDragging(true);
                    setDraggedNode(node.id);
                }
            }
        });
    };

    const handleCanvasMouseUp = () => {
        setIsDragging(false);
        setDraggedNode(null);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Response Knowledge Graph</h2>
                        {query && (
                            <p className="text-sm text-gray-600 mt-1">Query: {query}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                            {graphData.nodes.length} nodes, {graphData.edges.length} relationships
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
                    >
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>
                <div ref={containerRef} className="flex-1 relative bg-gray-50">
                    <canvas
                        ref={canvasRef}
                        onClick={handleCanvasClick}
                        onMouseMove={handleCanvasMouseMove}
                        onMouseDown={handleCanvasMouseDown}
                        onMouseUp={handleCanvasMouseUp}
                        onMouseLeave={handleCanvasMouseUp}
                        className="w-full h-full"
                    />
                    <div className="absolute top-4 right-4 bg-white rounded-lg shadow p-3 text-xs">
                        <h3 className="font-semibold mb-2">Node Types</h3>
                        <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                <span>Person</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                                <span>Organization</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                <span>Location</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                                <span>Concept</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
                                <span>Technology</span>
                            </div>
                        </div>
                    </div>
                    {selectedNode && (
                        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-sm">
                            <div className="flex items-start justify-between mb-2">
                                <h3 className="font-semibold text-gray-900">{selectedNode.label}</h3>
                                <button
                                    onClick={() => setSelectedNode(null)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">
                                Type: <span className="font-medium">{selectedNode.type}</span>
                            </p>
                            {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                                <div className="text-xs text-gray-500 space-y-1">
                                    {Object.entries(selectedNode.properties).map(([key, value]) => (
                                        <div key={key}>
                                            <span className="font-medium">{key}:</span> {String(value)}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="mt-3 pt-3 border-t border-gray-200">
                                <h4 className="text-xs font-semibold text-gray-700 mb-2">Relationships</h4>
                                <div className="space-y-1 text-xs text-gray-600">
                                    {graphData.edges
                                        .filter(edge => edge.source === selectedNode.id || edge.target === selectedNode.id)
                                        .map((edge, idx) => {
                                            const otherNodeId = edge.source === selectedNode.id ? edge.target : edge.source;
                                            const otherNode = graphData.nodes.find(n => n.id === otherNodeId);
                                            return (
                                                <div key={idx}>
                                                    {edge.source === selectedNode.id ? '→' : '←'} {edge.label} {otherNode?.label || 'Unknown'}
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-600 text-center">
                    Click on nodes to see details • Drag nodes to reposition • The graph shows entities and relationships from this specific response
                </div>
            </div>
        </div>
    );
}

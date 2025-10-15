export interface GraphNode {
    id: string;
    label: string;
    type: string;
    properties?: Record<string, any>;
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    label: string;
    type?: string;
    properties?: Record<string, any>;
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export function calculateGraphStats(graph: GraphData) {
    const stats = {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        nodeTypes: new Map<string, number>(),
        edgeTypes: new Map<string, number>(),
        avgDegree: 0,
        maxDegree: 0,
        isolatedNodes: 0,
        connectedComponents: 0,
        density: 0
    };

    graph.nodes.forEach(node => {
        const type = node.type || 'UNKNOWN';
        stats.nodeTypes.set(type, (stats.nodeTypes.get(type) || 0) + 1);
    });

    const nodeDegrees = new Map<string, number>();
    graph.edges.forEach(edge => {
        const type = edge.label || edge.type || 'UNKNOWN';
        stats.edgeTypes.set(type, (stats.edgeTypes.get(type) || 0) + 1);

        nodeDegrees.set(edge.source, (nodeDegrees.get(edge.source) || 0) + 1);
        nodeDegrees.set(edge.target, (nodeDegrees.get(edge.target) || 0) + 1);
    });

    if (nodeDegrees.size > 0) {
        const degrees = Array.from(nodeDegrees.values());
        stats.avgDegree = degrees.reduce((a, b) => a + b, 0) / degrees.length;
        stats.maxDegree = Math.max(...degrees);
    }

    stats.isolatedNodes = graph.nodes.filter(
        node => !nodeDegrees.has(node.id) || nodeDegrees.get(node.id) === 0
    ).length;

    const maxPossibleEdges = (graph.nodes.length * (graph.nodes.length - 1)) / 2;
    stats.density = maxPossibleEdges > 0 ? graph.edges.length / maxPossibleEdges : 0;

    stats.connectedComponents = calculateConnectedComponents(graph);

    return stats;
}

function calculateConnectedComponents(graph: GraphData): number {
    const visited = new Set<string>();
    const adjacency = buildAdjacencyMap(graph);
    let componentCount = 0;

    function dfs(nodeId: string) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        const neighbors = adjacency.get(nodeId) || [];
        neighbors.forEach(neighbor => dfs(neighbor));
    }

    graph.nodes.forEach(node => {
        if (!visited.has(node.id)) {
            dfs(node.id);
            componentCount++;
        }
    });

    return componentCount;
}

function buildAdjacencyMap(graph: GraphData): Map<string, string[]> {
    const adjacency = new Map<string, string[]>();

    graph.nodes.forEach(node => {
        adjacency.set(node.id, []);
    });

    graph.edges.forEach(edge => {
        if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
        if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
        adjacency.get(edge.source)!.push(edge.target);
        adjacency.get(edge.target)!.push(edge.source);
    });

    return adjacency;
}

export function findShortestPath(
    graph: GraphData,
    sourceId: string,
    targetId: string
): { path: GraphNode[]; edges: GraphEdge[] } | null {
    if (sourceId === targetId) {
        const node = graph.nodes.find(n => n.id === sourceId);
        return node ? { path: [node], edges: [] } : null;
    }

    const adjacency = buildAdjacencyMap(graph);
    const queue: string[] = [sourceId];
    const visited = new Set<string>([sourceId]);
    const parent = new Map<string, string>();

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === targetId) {
            const path: GraphNode[] = [];
            const edges: GraphEdge[] = [];
            let node = targetId;

            while (node !== sourceId) {
                const nodeData = graph.nodes.find(n => n.id === node);
                if (nodeData) path.unshift(nodeData);

                const prev = parent.get(node)!;
                const edge = graph.edges.find(
                    e => (e.source === prev && e.target === node) || 
                             (e.source === node && e.target === prev)
                );
                if (edge) edges.unshift(edge);

                node = prev;
            }

            const sourceNode = graph.nodes.find(n => n.id === sourceId);
            if (sourceNode) path.unshift(sourceNode);

            return { path, edges };
        }

        const neighbors = adjacency.get(current) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                parent.set(neighbor, current);
                queue.push(neighbor);
            }
        }
    }

    return null;
}

export function findNodesWithinDistance(
    graph: GraphData,
    nodeId: string,
    maxDistance: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const adjacency = buildAdjacencyMap(graph);
    const distances = new Map<string, number>();
    const queue: { id: string; distance: number }[] = [{ id: nodeId, distance: 0 }];
    distances.set(nodeId, 0);

    while (queue.length > 0) {
        const { id: current, distance } = queue.shift()!;
        if (distance >= maxDistance) continue;

        const neighbors = adjacency.get(current) || [];
        for (const neighbor of neighbors) {
            if (!distances.has(neighbor)) {
                distances.set(neighbor, distance + 1);
                queue.push({ id: neighbor, distance: distance + 1 });
            }
        }
    }

    const nodeIds = new Set(distances.keys());
    const nodes = graph.nodes.filter(n => nodeIds.has(n.id));
    const edges = graph.edges.filter(
        e => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return { nodes, edges };
}

export function calculateNodeImportance(graph: GraphData): Map<string, number> {
    const importance = new Map<string, number>();
    const degrees = new Map<string, number>();

    graph.edges.forEach(edge => {
        degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
        degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    });

    const maxDegree = Math.max(...Array.from(degrees.values()), 1);

    graph.nodes.forEach(node => {
        const degree = degrees.get(node.id) || 0;
        importance.set(node.id, degree / maxDegree);
    });

    return importance;
}

export function filterByConnectivity(
    graph: GraphData,
    minConnections: number = 2
): GraphData {
    const degrees = new Map<string, number>();

    graph.edges.forEach(edge => {
        degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
        degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    });

    const connectedNodeIds = new Set(
        Array.from(degrees.entries())
            .filter(([_, degree]) => degree >= minConnections)
            .map(([id]) => id)
    );

    return {
        nodes: graph.nodes.filter(n => connectedNodeIds.has(n.id)),
        edges: graph.edges.filter(
            e => connectedNodeIds.has(e.source) && connectedNodeIds.has(e.target)
        )
    };
}

export function groupNodesByType(graph: GraphData): Map<string, GraphNode[]> {
    const groups = new Map<string, GraphNode[]>();

    graph.nodes.forEach(node => {
        const type = node.type || 'UNKNOWN';
        if (!groups.has(type)) {
            groups.set(type, []);
        }
        groups.get(type)!.push(node);
    });

    return groups;
}

export function exportGraph(graph: GraphData, format: 'json' | 'csv' | 'cypher'): string {
    switch (format) {
        case 'json':
            return JSON.stringify(graph, null, 2);

        case 'csv':
            const nodesCsv = [
                'id,label,type',
                ...graph.nodes.map(n => `"${n.id}","${n.label}","${n.type}"`)
            ].join('\n');
            
            const edgesCsv = [
                'source,target,type',
                ...graph.edges.map(e => `"${e.source}","${e.target}","${e.label}"`)
            ].join('\n');
            
            return `NODES:\n${nodesCsv}\n\nEDGES:\n${edgesCsv}`;

        case 'cypher':
            const nodeStatements = graph.nodes.map(
                n => `CREATE (n${n.id.replace(/[^a-zA-Z0-9]/g, '')}:${n.type} {id: "${n.id}", label: "${n.label}"})`
            );
            
            const edgeStatements = graph.edges.map(
                e => `MATCH (a {id: "${e.source}"}), (b {id: "${e.target}"}) CREATE (a)-[:${e.label}]->(b)`
            );
            
            return [...nodeStatements, ...edgeStatements].join(';\n') + ';';

        default:
            return JSON.stringify(graph);
    }
}

export function mergeGraphs(...graphs: GraphData[]): GraphData {
    const nodeMap = new Map<string, GraphNode>();
    const edgeSet = new Set<string>();
    const edges: GraphEdge[] = [];

    graphs.forEach(graph => {
        graph.nodes.forEach(node => {
            if (!nodeMap.has(node.id)) {
                nodeMap.set(node.id, node);
            }
        });

        graph.edges.forEach(edge => {
            const edgeKey = `${edge.source}|${edge.label}|${edge.target}`;
            if (!edgeSet.has(edgeKey)) {
                edgeSet.add(edgeKey);
                edges.push(edge);
            }
        });
    });

    return {
        nodes: Array.from(nodeMap.values()),
        edges
    };
}

export function validateGraph(graph: GraphData): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
} {
    const errors: string[] = [];
    const warnings: string[] = [];

    const nodeIds = new Set<string>();
    graph.nodes.forEach(node => {
        if (!node.id) {
            errors.push('Node missing ID');
        } else if (nodeIds.has(node.id)) {
            errors.push(`Duplicate node ID: ${node.id}`);
        } else {
            nodeIds.add(node.id);
        }
    });

    graph.edges.forEach(edge => {
        if (!nodeIds.has(edge.source)) {
            errors.push(`Edge references non-existent source: ${edge.source}`);
        }
        if (!nodeIds.has(edge.target)) {
            errors.push(`Edge references non-existent target: ${edge.target}`);
        }
    });

    const connectedNodes = new Set<string>();
    graph.edges.forEach(edge => {
        connectedNodes.add(edge.source);
        connectedNodes.add(edge.target);
    });

    const isolatedCount = graph.nodes.filter(n => !connectedNodes.has(n.id)).length;
    if (isolatedCount > 0) {
        warnings.push(`Graph has ${isolatedCount} isolated nodes`);
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

import { generateEmbedding } from './openai';
import { GraphProcessor } from './graph-processor';
import { getSession } from './neo4j';

export interface GraphNode {
    id: string;
    label: string;
    type: string;
    properties: Record<string, any>;
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    label: string;
    type?: string;
    properties?: Record<string, any>;
}

export interface ResponseGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    metadata: {
        entityCount: number;
        relationshipCount: number;
        createdAt: string;
        scope: 'query' | 'document' | 'user';
        source: 'llm_extraction' | 'knowledge_base' | 'hybrid';
        cypherQuery?: string;
    };
}

export class ResponseGraphGenerator {
    private graphProcessor: GraphProcessor;

    constructor() {
        this.graphProcessor = new GraphProcessor();
    }

    async extractGraphFromResponse(
        query: string,
        response: string,
        toolResults?: any[],
        userId?: string
    ): Promise<ResponseGraph> {
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];
        const nodeMap = new Map<string, GraphNode>();
        const edgeSet = new Set<string>();
        let cypherQuery = '';
        
        if (toolResults && toolResults.length > 0 && userId) {
            const neo4jGraph = await this.extractFromNeo4j(toolResults, userId, query);
            if (neo4jGraph) {
                cypherQuery = neo4jGraph.cypherQuery;
                neo4jGraph.nodes.forEach(node => {
                    nodeMap.set(node.id, node);
                });
                neo4jGraph.edges.forEach(edge => {
                    const edgeKey = `${edge.source}|${edge.label}|${edge.target}`;
                    if (!edgeSet.has(edgeKey)) {
                        edges.push(edge);
                        edgeSet.add(edgeKey);
                    }
                });
            }
        }
        
        const entities = await this.extractEntities(response);
        const relationships = await this.extractRelationships(response, entities);
        
        const queryLower = query.toLowerCase();
        const responseLower = response.toLowerCase();
        
        entities.forEach((entity) => {
            const isRelevant = responseLower.includes(entity.name.toLowerCase()) ||
                              queryLower.includes(entity.name.toLowerCase());
            
            if (isRelevant) {
                const nodeId = this.generateNodeId(entity.name, entity.type);
                if (!nodeMap.has(nodeId)) {
                    const node: GraphNode = {
                        id: nodeId,
                        label: entity.name,
                        type: entity.type,
                        properties: {
                            description: entity.description || '',
                            confidence: entity.confidence || 0.8,
                            mentions: entity.mentions || 1,
                            extractedFrom: 'llm_response',
                            relevanceScore: this.calculateRelevance(entity.name, query, response)
                        }
                    };
                    nodeMap.set(nodeId, node);
                } else {
                    const existing = nodeMap.get(nodeId)!;
                    existing.properties.mentions = (existing.properties.mentions || 0) + (entity.mentions || 1);
                    existing.properties.confidence = Math.max(
                        existing.properties.confidence || 0,
                        entity.confidence || 0
                    );
                }
            }
        });
        relationships.forEach((rel) => {
            const sourceId = this.generateNodeId(rel.source, rel.sourceType);
            const targetId = this.generateNodeId(rel.target, rel.targetType);
            
            if (sourceId === targetId) return;
            
            const edgeKey = `${sourceId}|${rel.type}|${targetId}`;
            if (!nodeMap.has(sourceId)) {
                nodeMap.set(sourceId, {
                    id: sourceId,
                    label: rel.source,
                    type: rel.sourceType,
                    properties: {
                        extractedFrom: 'llm_response',
                        confidence: 0.7,
                        relevanceScore: this.calculateRelevance(rel.source, query, response)
                    }
                });
            }
            if (!nodeMap.has(targetId)) {
                nodeMap.set(targetId, {
                    id: targetId,
                    label: rel.target,
                    type: rel.targetType,
                    properties: {
                        extractedFrom: 'llm_response',
                        confidence: 0.7,
                        relevanceScore: this.calculateRelevance(rel.target, query, response)
                    }
                });
            }
            if (!edgeSet.has(edgeKey)) {
                const edge: GraphEdge = {
                    id: `edge_${edges.length}`,
                    source: sourceId,
                    target: targetId,
                    label: rel.type,
                    properties: {
                        confidence: rel.confidence || 0.7,
                        extractedFrom: 'llm_response'
                    }
                };
                edges.push(edge);
                edgeSet.add(edgeKey);
            }
        });
        if (nodeMap.size > 0) {
            const queryNode: GraphNode = {
                id: 'query_node',
                label: this.truncateText(query, 50),
                type: 'QUERY',
                properties: {
                    fullQuery: query,
                    timestamp: new Date().toISOString()
                }
            };
            nodeMap.set('query_node', queryNode);
            const sortedNodes = Array.from(nodeMap.entries())
                .filter(([id]) => id !== 'query_node')
                .sort((a, b) => {
                    const scoreA = (a[1].properties.confidence || 0) * 
                                  (a[1].properties.mentions || 1) * 
                                  (a[1].properties.relevanceScore || 0.5);
                    const scoreB = (b[1].properties.confidence || 0) * 
                                  (b[1].properties.mentions || 1) * 
                                  (b[1].properties.relevanceScore || 0.5);
                    return scoreB - scoreA;
                })
                .slice(0, 3);
            sortedNodes.forEach(([id]) => {
                const edgeKey = `query_node|RELATES_TO|${id}`;
                if (!edgeSet.has(edgeKey)) {
                    edges.push({
                        id: `edge_query_${id}`,
                        source: 'query_node',
                        target: id,
                        label: 'RELATES_TO',
                        properties: { confidence: 0.9 }
                    });
                    edgeSet.add(edgeKey);
                }
            });
        }
        const finalNodes = Array.from(nodeMap.values());
        return {
            nodes: finalNodes,
            edges,
            metadata: {
                entityCount: finalNodes.length,
                relationshipCount: edges.length,
                createdAt: new Date().toISOString(),
                scope: 'query',
                source: cypherQuery ? 'hybrid' : 'llm_extraction',
                cypherQuery: cypherQuery || this.generateCypherQuery(finalNodes, edges)
            }
        };
    }

    private async extractFromNeo4j(
        toolResults: any[],
        userId: string,
        query: string
    ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; cypherQuery: string } | null> {
        const session = await getSession();
        try {
            const entityIds = new Set<string>();
            const nodeMap = new Map<string, GraphNode>();
            const edges: GraphEdge[] = [];
            toolResults.forEach((result) => {
                if (result.tool === 'entity_search' && Array.isArray(result.data)) {
                    result.data.forEach((item: any) => {
                        if (item.entity?.id) {
                            entityIds.add(item.entity.id);
                        }
                    });
                }
            });
            if (entityIds.size === 0) {
                return null;
            }
            const cypherQuery = `
                MATCH (u:User {id: $userId})-[:OWNS]->(d:Document)-[:CONTAINS]->(e:Entity)
                WHERE e.id IN $entityIds
                WITH e, d
                OPTIONAL MATCH (e)-[r]-(related:Entity)
                WHERE related.id IN $entityIds
                RETURN e, d.fileName as fileName, collect(distinct {
                    type: type(r),
                    target: related,
                    properties: properties(r)
                }) as relationships
                LIMIT 50
            `;
            const result = await session.run(cypherQuery, {
                userId,
                entityIds: Array.from(entityIds).slice(0, 20)
            });
            result.records.forEach((record) => {
                const entity = record.get('e').properties;
                const fileName = record.get('fileName');
                const relationships = record.get('relationships');
                const nodeId = entity.id || this.generateNodeId(entity.name, entity.type);
                if (!nodeMap.has(nodeId)) {
                    nodeMap.set(nodeId, {
                        id: nodeId,
                        label: entity.name || nodeId,
                        type: entity.type || 'ENTITY',
                        properties: {
                            ...entity,
                            fileName,
                            source: 'neo4j'
                        }
                    });
                }
                if (Array.isArray(relationships)) {
                    relationships.forEach((rel: any) => {
                        if (rel.target && rel.type) {
                            const targetId = rel.target.properties?.id || 
                                                         this.generateNodeId(rel.target.properties?.name, rel.target.properties?.type);
                            if (!nodeMap.has(targetId)) {
                                nodeMap.set(targetId, {
                                    id: targetId,
                                    label: rel.target.properties?.name || targetId,
                                    type: rel.target.properties?.type || 'ENTITY',
                                    properties: {
                                        ...rel.target.properties,
                                        source: 'neo4j'
                                    }
                                });
                            }
                            edges.push({
                                id: `edge_${nodeId}_${targetId}`,
                                source: nodeId,
                                target: targetId,
                                label: rel.type,
                                properties: {
                                    ...rel.properties,
                                    source: 'neo4j'
                                }
                            });
                        }
                    });
                }
            });
            return {
                nodes: Array.from(nodeMap.values()),
                edges,
                cypherQuery
            };
        } catch (error) {
            console.error('[Neo4j Graph Extract] Error:', error);
            return null;
        } finally {
            await session.close();
        }
    }

    private generateCypherQuery(nodes: GraphNode[], edges: GraphEdge[]): string {
        const nodeStatements = nodes.map(node => {
            const props = Object.entries(node.properties)
                .filter(([_, v]) => v !== null && v !== undefined && typeof v !== 'object')
                .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                .join(', ');
            return `CREATE (n_${this.sanitizeId(node.id)}:${node.type} {id: "${node.id}", label: "${this.escapeString(node.label)}"${props ? ', ' + props : ''}})`;
        });
        const edgeStatements = edges.map(edge => {
            const props = edge.properties && Object.keys(edge.properties).length > 0
                ? ' {' + Object.entries(edge.properties)
                        .filter(([_, v]) => v !== null && v !== undefined && typeof v !== 'object')
                        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                        .join(', ') + '}'
                : '';
            return `CREATE (n_${this.sanitizeId(edge.source)})-[:${edge.label}${props}]->(n_${this.sanitizeId(edge.target)})`;
        });
        return [...nodeStatements, ...edgeStatements].join('\n');
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_');
    }

    private escapeString(str: string): string {
        return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
    }

    private async extractEntities(text: string): Promise<Array<{
        name: string;
        type: string;
        description?: string;
        confidence?: number;
        mentions?: number;
    }>> {
        const entities: Array<any> = [];
        const entityMap = new Map<string, any>();
        const capitalizedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g;
        const matches = text.matchAll(capitalizedPattern);
        for (const match of matches) {
            const name = match[1].trim();
            if (this.isCommonWord(name)) continue;
            const type = this.classifyEntity(name, text);
            if (entityMap.has(name)) {
                entityMap.get(name).mentions++;
            } else {
                entityMap.set(name, {
                    name,
                    type,
                    mentions: 1,
                    confidence: 0.75
                });
            }
        }
        const quotedPattern = /"([^"]{2,50})"|'([^']{2,50})'/g;
        const quotedMatches = text.matchAll(quotedPattern);
        for (const match of quotedMatches) {
            const name = (match[1] || match[2]).trim();
            if (!entityMap.has(name) && name.length > 2) {
                entityMap.set(name, {
                    name,
                    type: 'CONCEPT',
                    mentions: 1,
                    confidence: 0.85
                });
            } else if (entityMap.has(name)) {
                entityMap.get(name).confidence = Math.max(entityMap.get(name).confidence, 0.85);
                entityMap.get(name).mentions++;
            }
        }
        const technicalPattern = /\b([A-Z]{2,})\b/g;
        const technicalMatches = text.matchAll(technicalPattern);
        for (const match of technicalMatches) {
            const name = match[1];
            if (name.length >= 2 && name.length <= 10 && !entityMap.has(name)) {
                entityMap.set(name, {
                    name,
                    type: 'TECHNOLOGY',
                    mentions: 1,
                    confidence: 0.7
                });
            }
        }
        const bulletPattern = /^[\s]*[-•*]\s+([A-Z][^\n]{10,100})/gm;
        const bulletMatches = text.matchAll(bulletPattern);
        for (const match of matches) {
            const content = match[1].trim();
            const words = content.split(/\s+/);
            const entityName = words.slice(0, Math.min(4, words.length)).join(' ');
            if (entityName.length > 5 && !entityMap.has(entityName)) {
                entityMap.set(entityName, {
                    name: entityName,
                    type: 'CONCEPT',
                    mentions: 1,
                    confidence: 0.75
                });
            }
        }
        const numberPattern = /\b((?:19|20)\d{2})\b|\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(percent|%|dollars?|\$|users?|people|million|billion|thousand)\b/gi;
        const numberMatches = text.matchAll(numberPattern);
        for (const match of numberMatches) {
            const value = match[0].trim();
            if (!entityMap.has(value) && value.length > 2) {
                entityMap.set(value, {
                    name: value,
                    type: 'METRIC',
                    mentions: 1,
                    confidence: 0.8
                });
            }
        }
        return Array.from(entityMap.values())
            .filter(e => e.mentions >= 1 && e.name.length > 2 && e.name.length < 100)
            .sort((a, b) => {
                const scoreA = b.mentions * b.confidence;
                const scoreB = a.mentions * a.confidence;
                return scoreB - scoreA;
            })
            .slice(0, 25);
    }

    private isCommonWord(word: string): boolean {
        const commonWords = new Set([
            'The', 'This', 'That', 'These', 'Those', 'They', 'There', 'Their',
            'When', 'Where', 'What', 'Which', 'Who', 'Why', 'How',
            'Some', 'Many', 'Most', 'All', 'Each', 'Every', 'Any',
            'First', 'Second', 'Third', 'Last', 'Next', 'Previous',
            'However', 'Therefore', 'Moreover', 'Furthermore', 'Additionally',
            'Also', 'Thus', 'Hence', 'Consequently'
        ]);
        return commonWords.has(word);
    }

    private classifyEntity(name: string, context: string): string {
        const lowerName = name.toLowerCase();
        const lowerContext = context.toLowerCase();
        if (/(company|corporation|inc|llc|ltd|organization|agency|department)/i.test(context) ||
                /(microsoft|google|apple|amazon|facebook|meta)/i.test(lowerName)) {
            return 'ORGANIZATION';
        }
        if (/(mr\.|mrs\.|dr\.|professor|ceo|president|director|founded by|created by)/i.test(context)) {
            return 'PERSON';
        }
        if (/(city|country|state|region|located in|based in)/i.test(context) ||
                /(america|europe|asia|africa|california|new york|london|paris)/i.test(lowerName)) {
            return 'LOCATION';
        }
        if (/(technology|software|platform|system|framework|language|tool)/i.test(context) ||
                /(api|sdk|database|server|cloud|ai|ml)/i.test(lowerName)) {
            return 'TECHNOLOGY';
        }
        if (/(event|conference|launch|release|announcement|meeting)/i.test(context) ||
                /\b(19|20)\d{2}\b/.test(name)) {
            return 'EVENT';
        }
        if (/(product|service|application|app|version)/i.test(context)) {
            return 'PRODUCT';
        }
        return 'CONCEPT';
    }

    private async extractRelationships(
        text: string,
        entities: Array<any>
    ): Promise<Array<{
        source: string;
        target: string;
        type: string;
        sourceType: string;
        targetType: string;
        confidence?: number;
    }>> {
        const relationships: Array<any> = [];
        const relationshipSet = new Set<string>();
        const relationshipPatterns = [
            { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:is|was|are|were)\s+(?:a|an|the)?\s*([a-z]+(?:\s+[a-z]+){0,2})/g, type: 'IS_A' },
            { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:owns|owned|has|have|possesses)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g, type: 'OWNS' },
            { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:created|developed|built|founded|established|designed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g, type: 'CREATED' },
            { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:works?\s+(?:at|for)|employed\s+by|part\s+of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g, type: 'WORKS_AT' },
            { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:located\s+in|based\s+in|from|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g, type: 'LOCATED_IN' },
            { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:uses|use|utilizing|leverages|employs)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g, type: 'USES' },
            { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:leads|manages|directs|heads)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g, type: 'LEADS' },
            { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:belongs\s+to|member\s+of|part\s+of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g, type: 'BELONGS_TO' },
            { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:and|with|alongside|together\s+with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g, type: 'RELATED_TO' },
            { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:provides|offers|supplies|delivers)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g, type: 'PROVIDES' },
            { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:acquired|purchased|bought)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g, type: 'ACQUIRED' },
            { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:partnered\s+with|collaborates\s+with|works\s+with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g, type: 'PARTNERS_WITH' },
        ];
        const entityNames = new Set(entities.map(e => e.name));
        for (const { pattern, type } of relationshipPatterns) {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                const source = match[1].trim();
                const target = match[2].trim();
                if (!source || !target || source === target || source.length < 3 || target.length < 3) continue;
                const sourceInEntities = entityNames.has(source);
                const targetInEntities = entityNames.has(target);
                if (sourceInEntities || targetInEntities || (this.isValidEntityName(source) && this.isValidEntityName(target))) {
                    const sourceEntity = entities.find(e => e.name === source);
                    const targetEntity = entities.find(e => e.name === target);
                    const relKey = `${source}|${type}|${target}`;
                    if (!relationshipSet.has(relKey)) {
                        relationships.push({
                            source,
                            target,
                            type,
                            sourceType: sourceEntity?.type || this.classifyEntity(source, text),
                            targetType: targetEntity?.type || this.classifyEntity(target, text),
                            confidence: (sourceInEntities && targetInEntities) ? 0.85 : 0.7
                        });
                        relationshipSet.add(relKey);
                    }
                }
            }
        }
        this.extractProximityRelationships(text, entities, relationships, relationshipSet);
        return relationships.slice(0, 40);
    }

    private extractProximityRelationships(
        text: string,
        entities: Array<any>,
        relationships: Array<any>,
        relationshipSet: Set<string>
    ): void {
        const sentences = text.split(/[.!?]+/);
        sentences.forEach(sentence => {
            const entitiesInSentence: Array<any> = [];
            entities.forEach(entity => {
                if (sentence.includes(entity.name)) {
                    entitiesInSentence.push(entity);
                }
            });
            if (entitiesInSentence.length >= 2 && entitiesInSentence.length <= 4) {
                for (let i = 0; i < entitiesInSentence.length; i++) {
                    for (let j = i + 1; j < entitiesInSentence.length; j++) {
                        const source = entitiesInSentence[i].name;
                        const target = entitiesInSentence[j].name;
                        const relKey = `${source}|MENTIONED_WITH|${target}`;
                        if (!relationshipSet.has(relKey) && relationships.length < 40) {
                            relationships.push({
                                source,
                                target,
                                type: 'MENTIONED_WITH',
                                sourceType: entitiesInSentence[i].type,
                                targetType: entitiesInSentence[j].type,
                                confidence: 0.6
                            });
                            relationshipSet.add(relKey);
                        }
                    }
                }
            }
        });
    }

    private isValidEntityName(name: string): boolean {
        if (!/^[A-Z]/.test(name)) return false;
        if (this.isCommonWord(name)) return false;
        if (name.length < 3 || name.length > 60) return false;
        return true;
    }

    private processToolResults(
        toolResults: any[],
        nodeMap: Map<string, GraphNode>,
        edgeSet: Set<string>,
        edges: GraphEdge[]
    ): void {
        toolResults.forEach((result) => {
            if (result.tool === 'entity_search' && Array.isArray(result.data)) {
                result.data.forEach((item: any) => {
                    if (item.entity) {
                        const nodeId = this.generateNodeId(item.entity.name, item.entity.type);
                        if (!nodeMap.has(nodeId)) {
                            nodeMap.set(nodeId, {
                                id: nodeId,
                                label: item.entity.name,
                                type: item.entity.type || 'CONCEPT',
                                properties: {
                                    ...item.entity.properties,
                                    source: 'knowledge_base'
                                }
                            });
                        }
                    }
                });
            }
            if (result.tool === 'relationship_path' && Array.isArray(result.data)) {
                result.data.forEach((path: any) => {
                    if (path.nodes && path.relationships) {
                        path.nodes.forEach((node: any) => {
                            const nodeId = node.id || this.generateNodeId(node.name, node.type);
                            if (!nodeMap.has(nodeId)) {
                                nodeMap.set(nodeId, {
                                    id: nodeId,
                                    label: node.name || node.label,
                                    type: node.type || 'CONCEPT',
                                    properties: node.properties || {}
                                });
                            }
                        });
                        path.relationships.forEach((rel: any) => {
                            const edgeKey = `${rel.source}|${rel.type}|${rel.target}`;
                            if (!edgeSet.has(edgeKey)) {
                                edges.push({
                                    id: `edge_${edges.length}`,
                                    source: rel.source,
                                    target: rel.target,
                                    label: rel.type,
                                    properties: rel.properties || {}
                                });
                                edgeSet.add(edgeKey);
                            }
                        });
                    }
                });
            }
        });
    }

    private generateNodeId(name: string, type: string): string {
        return `${type.toLowerCase()}_${name.toLowerCase().replace(/\s+/g, '_')}`;
    }

    private calculateRelevance(entityName: string, query: string, response: string): number {
        const queryLower = query.toLowerCase();
        const responseLower = response.toLowerCase();
        const entityLower = entityName.toLowerCase();
        
        let score = 0;
        
        if (queryLower.includes(entityLower)) {
            score += 0.5;
        }
        
        const mentions = (responseLower.match(new RegExp(entityLower, 'g')) || []).length;
        score += Math.min(mentions * 0.1, 0.4);
        
        const firstMention = responseLower.indexOf(entityLower);
        if (firstMention >= 0 && firstMention < responseLower.length / 3) {
            score += 0.1;
        }
        
        return Math.min(score, 1);
    }

    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    async enhanceGraph(
        graph: ResponseGraph,
        userId: string,
        query: string
    ): Promise<ResponseGraph> {
        const enhancedNodes = await Promise.all(
            graph.nodes.map(async (node) => {
                const textToEmbed = `${node.label} ${node.type} ${node.properties.description || ''}`;
                const embedding = await generateEmbedding(textToEmbed);
                return {
                    ...node,
                    properties: {
                        ...node.properties,
                        embedding
                    }
                };
            })
        );
        const inferredEdges: GraphEdge[] = [];
        for (let i = 0; i < enhancedNodes.length; i++) {
            for (let j = i + 1; j < enhancedNodes.length; j++) {
                const similarity = this.cosineSimilarity(
                    enhancedNodes[i].properties.embedding,
                    enhancedNodes[j].properties.embedding
                );
                if (similarity > 0.7 && !this.edgeExists(graph.edges, enhancedNodes[i].id, enhancedNodes[j].id)) {
                    inferredEdges.push({
                        id: `inferred_${i}_${j}`,
                        source: enhancedNodes[i].id,
                        target: enhancedNodes[j].id,
                        label: 'SIMILAR_TO',
                        properties: {
                            confidence: similarity,
                            inferred: true
                        }
                    });
                }
            }
        }
        return {
            nodes: enhancedNodes,
            edges: [...graph.edges, ...inferredEdges],
            metadata: {
                ...graph.metadata,
                relationshipCount: graph.edges.length + inferredEdges.length,
                source: 'hybrid'
            }
        };
    }

    private edgeExists(edges: GraphEdge[], source: string, target: string): boolean {
        return edges.some(
            edge => 
                (edge.source === source && edge.target === target) ||
                (edge.source === target && edge.target === source)
        );
    }

    private cosineSimilarity(vec1: number[], vec2: number[]): number {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }
        const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
        return denominator === 0 ? 0 : dotProduct / denominator;
    }

    filterRelevantNodes(graph: ResponseGraph, maxNodes: number = 15): ResponseGraph {
        if (graph.nodes.length <= maxNodes) return graph;
        
        const nodeScores = new Map<string, number>();
        graph.nodes.forEach(node => {
            const connectionCount = graph.edges.filter(
                e => e.source === node.id || e.target === node.id
            ).length;
            const confidence = node.properties.confidence || 0.5;
            const relevance = node.properties.relevanceScore || 0.5;
            const mentions = node.properties.mentions || 1;
            
            const score = (connectionCount * 0.4) + 
                         (confidence * 0.2) + 
                         (relevance * 0.3) + 
                         (Math.min(mentions, 5) * 0.02);
            
            nodeScores.set(node.id, score);
        });
        
        const topNodeIds = new Set(
            Array.from(nodeScores.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, maxNodes)
                .map(([id]) => id)
        );
        
        const queryNode = graph.nodes.find(n => n.type === 'QUERY');
        if (queryNode) {
            topNodeIds.add(queryNode.id);
        }
        
        const filteredNodes = graph.nodes.filter(n => topNodeIds.has(n.id));
        const filteredEdges = graph.edges.filter(
            e => topNodeIds.has(e.source) && topNodeIds.has(e.target)
        );
        
        return {
            nodes: filteredNodes,
            edges: filteredEdges,
            metadata: {
                ...graph.metadata,
                entityCount: filteredNodes.length,
                relationshipCount: filteredEdges.length
            }
        };
    }
}

export const responseGraphGenerator = new ResponseGraphGenerator();

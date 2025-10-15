import { getSession } from './neo4j';
import { generateEmbedding } from './openai';
import { pipeline } from './redis';

export interface Entity {
  id: string;
  name: string;
  type: string;
  description?: string;
  properties?: Record<string, any>;
  embedding?: number[];
  confidence?: number;
  aliases?: string[];
  canonicalId?: string;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: string;
  properties?: Record<string, any>;
  confidence?: number;
  weight?: number;
}

export interface KnowledgeGraph {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    properties: Record<string, any>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    properties: Record<string, any>;
  }>;
  metadata: {
    entityCount: number;
    relationshipCount: number;
    createdAt: string;
    scope: 'user' | 'document' | 'query';
  };
}

export class GraphProcessor {
  private similarityThreshold = 0.85;

  async resolveEntities(userId: string, entities: Entity[]): Promise<Entity[]> {
    console.log(`Resolving ${entities.length} entities for user ${userId}`);
    const cacheKey = `entity-resolution:${userId}`;
    const cached = await pipeline.getCachedGraphData(userId, cacheKey);
    if (cached) {
      return cached;
    }
    const session = await getSession();
    const resolvedEntities: Entity[] = [];
    try {
      for (const entity of entities) {
        if (!entity.embedding) {
          const embeddingText = `${entity.name} ${entity.type} ${entity.description || ''}`;
          entity.embedding = await generateEmbedding(embeddingText);
        }
        const similarEntities = await this.findSimilarEntities(
          session,
          userId,
          entity.name,
          entity.type,
          entity.embedding
        );
        if (similarEntities.length > 0) {
          const merged = await this.mergeEntities(session, entity, similarEntities[0]);
          resolvedEntities.push(merged);
        } else {
          resolvedEntities.push(entity);
        }
      }
      await pipeline.cacheGraphData(userId, cacheKey, resolvedEntities, 3600);
      return resolvedEntities;
    } finally {
      await session.close();
    }
  }

  private async findSimilarEntities(
    session: any,
    userId: string,
    name: string,
    type: string,
    embedding: number[]
  ): Promise<any[]> {
    const nameResult = await session.run(
      `
      MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e:Entity)
      WHERE e.type = $type AND (
        toLower(e.name) = toLower($name) OR
        $name IN e.aliases OR
        e.name =~ '(?i).*' + $name + '.*'
      )
      RETURN e, e.embedding as embedding
      LIMIT 5
      `,
      { userId, name, type }
    );
    const candidates = nameResult.records.map(r => ({
      entity: r.get('e').properties,
      embedding: r.get('embedding')
    }));
    const similar = candidates.filter(candidate => {
      if (!candidate.embedding) return false;
      const similarity = this.cosineSimilarity(embedding, candidate.embedding);
      return similarity >= this.similarityThreshold;
    });
    return similar.map(s => s.entity);
  }

  private async mergeEntities(session: any, newEntity: Entity, existingEntity: any): Promise<Entity> {
    const canonicalId = existingEntity.id || existingEntity.canonicalId || newEntity.id;
    const mergedProperties = {
      ...existingEntity.properties,
      ...newEntity.properties,
      aliases: [...(existingEntity.aliases || []), newEntity.name].filter((v, i, a) => a.indexOf(v) === i),
      lastUpdated: new Date().toISOString()
    };
    await session.run(
      `
      MATCH (e:Entity {id: $existingId})
      SET e += $properties
      RETURN e
      `,
      { existingId: existingEntity.id, properties: mergedProperties }
    );
    if (newEntity.id !== existingEntity.id) {
      await session.run(
        `
        MERGE (e:Entity {id: $newId})
        SET e.canonicalId = $canonicalId, e.isDuplicate = true
        `,
        { newId: newEntity.id, canonicalId }
      );
    }
    return {
      ...newEntity,
      id: canonicalId,
      canonicalId,
      properties: mergedProperties
    };
  }

  async deduplicateRelationships(userId: string): Promise<number> {
    const session = await getSession();
    try {
      const result = await session.run(
        `
        MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e1:Entity)
        MATCH (e1)-[r]->(e2:Entity)
        WITH e1, e2, type(r) as relType, collect(r) as rels
        WHERE size(rels) > 1
        WITH e1, e2, relType, rels, head(rels) as keepRel
        FOREACH (r in tail(rels) | DELETE r)
        RETURN count(*) as dedupCount
        `,
        { userId }
      );
      const count = result.records[0]?.get('dedupCount')?.toNumber() || 0;
      console.log(`Deduplicated ${count} relationships`);
      return count;
    } finally {
      await session.close();
    }
  }

  async buildCentralKnowledgeGraph(userId: string): Promise<KnowledgeGraph> {
    console.log(`Building central knowledge graph for user ${userId}`);
    const cacheKey = `central-kg:${userId}`;
    const cached = await pipeline.getCachedGraphData(userId, cacheKey);
    if (cached) {
      return cached;
    }
    const session = await getSession();
    try {
      const entityResult = await session.run(
        `
        MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e:Entity)
        WHERE e.isDuplicate IS NULL OR e.isDuplicate <> true
        RETURN e.id as entityId, e.name as name, e.type as type, e.description as description, e
        LIMIT 500
        `,
        { userId }
      );
      console.log(`[Graph Processor] Found ${entityResult.records.length} entities for user ${userId}`);
      const relResult = await session.run(
        `
        MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e1:Entity)
        MATCH (e1)-[r]->(e2:Entity)
        WHERE (e1.isDuplicate IS NULL OR e1.isDuplicate <> true) 
          AND (e2.isDuplicate IS NULL OR e2.isDuplicate <> true)
        RETURN e1.id as sourceId, e2.id as targetId, e1, r, e2, type(r) as relType
        LIMIT 1000
        `,
        { userId }
      );
      console.log(`[Graph Processor] Found ${relResult.records.length} relationships for user ${userId}`);
      const nodes = entityResult.records.map(record => {
        const entityId = record.get('entityId');
        const name = record.get('name');
        const type = record.get('type');
        const description = record.get('description');
        const entity = record.get('e');
        const props = entity.properties;
        return {
          id: entityId,
          label: name || entityId,
          type: type || 'CONCEPT',
          properties: {
            ...props,
            id: entityId,
            name: name || entityId,
            description: description || ''
          }
        };
      });
      const edges = relResult.records.map((record, idx) => {
        const sourceId = record.get('sourceId');
        const targetId = record.get('targetId');
        const rel = record.get('r');
        const relType = record.get('relType');
        return {
          id: `rel-${idx}`,
          source: sourceId,
          target: targetId,
          type: relType,
          properties: rel.properties || {}
        };
      });
      console.log(`[Graph Processor] Central KG built: ${nodes.length} nodes, ${edges.length} edges`);
      const knowledgeGraph: KnowledgeGraph = {
        nodes,
        edges,
        metadata: {
          entityCount: nodes.length,
          relationshipCount: edges.length,
          createdAt: new Date().toISOString(),
          scope: 'user'
        }
      };
      await pipeline.cacheGraphData(userId, cacheKey, knowledgeGraph, 1800);
      return knowledgeGraph;
    } finally {
      await session.close();
    }
  }

  async buildDocumentKnowledgeGraph(userId: string, documentId: string): Promise<KnowledgeGraph> {
    const session = await getSession();
    try {
      const entityResult = await session.run(
        `
        MATCH (u:User {id: $userId})-[:OWNS]->(d:Document {id: $documentId})-[:CONTAINS]->(e:Entity)
        WHERE e.isDuplicate IS NULL OR e.isDuplicate <> true
        RETURN e.id as entityId, e.name as name, e.type as type, e.description as description, e
        `,
        { userId, documentId }
      );
      console.log(`[Graph Processor] Found ${entityResult.records.length} entities for document ${documentId}`);
      const relResult = await session.run(
        `
        MATCH (u:User {id: $userId})-[:OWNS]->(d:Document {id: $documentId})-[:CONTAINS]->(e1:Entity)
        MATCH (e1)-[r]->(e2:Entity)
        WHERE (e1.isDuplicate IS NULL OR e1.isDuplicate <> true)
          AND (e2.isDuplicate IS NULL OR e2.isDuplicate <> true)
        RETURN e1.id as sourceId, e2.id as targetId, e1, r, e2, type(r) as relType
        `,
        { userId, documentId }
      );
      console.log(`[Graph Processor] Found ${relResult.records.length} relationships for document ${documentId}`);
      const nodes = entityResult.records.map(record => {
        const entityId = record.get('entityId');
        const name = record.get('name');
        const type = record.get('type');
        const description = record.get('description');
        const entity = record.get('e');
        const props = entity.properties;
        return {
          id: entityId,
          label: name || entityId,
          type: type || 'CONCEPT',
          properties: {
            ...props,
            id: entityId,
            name: name || entityId,
            description: description || ''
          }
        };
      });
      const edges = relResult.records.map((record, idx) => {
        const sourceId = record.get('sourceId');
        const targetId = record.get('targetId');
        const rel = record.get('r');
        const relType = record.get('relType');
        return {
          id: `rel-${idx}`,
          source: sourceId,
          target: targetId,
          type: relType,
          properties: rel.properties || {}
        };
      });
      console.log(`[Graph Processor] Document KG built for ${documentId}: ${nodes.length} nodes, ${edges.length} edges`);
      return {
        nodes,
        edges,
        metadata: {
          entityCount: nodes.length,
          relationshipCount: edges.length,
          createdAt: new Date().toISOString(),
          scope: 'document'
        }
      };
    } finally {
      await session.close();
    }
  }

  async buildQueryKnowledgeGraph(
    userId: string,
    query: string,
    relevantEntityIds: string[]
  ): Promise<KnowledgeGraph> {
    const session = await getSession();
    try {
      let result;
      
      if (relevantEntityIds.length > 0) {
        result = await session.run(
          `
          MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e:Entity)
          WHERE e.id IN $entityIds AND (e.isDuplicate IS NULL OR e.isDuplicate <> true)
          OPTIONAL MATCH path = (e)-[r*1..2]-(connected:Entity)
          WHERE (connected.isDuplicate IS NULL OR connected.isDuplicate <> true)
          AND (connected.id IN $entityIds OR length(path) = 1)
          WITH e, collect(distinct {
            rel: relationships(path)[0], 
            node: connected, 
            relType: type(relationships(path)[0])
          }) as connections
          RETURN e, connections
          `,
          { userId, entityIds: relevantEntityIds }
        );
      } else {
        const keywords = query.toLowerCase()
          .split(/\s+/)
          .filter(word => word.length > 3)
          .filter(word => !['what', 'where', 'when', 'which', 'who', 'how', 'does', 'about', 'the', 'this', 'that', 'with', 'from', 'have', 'been'].includes(word))
          .slice(0, 5);
        
        result = await session.run(
          `
          MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e:Entity)
          WHERE (e.isDuplicate IS NULL OR e.isDuplicate <> true)
          AND (
            any(keyword IN $keywords WHERE toLower(e.name) CONTAINS keyword)
            OR any(keyword IN $keywords WHERE toLower(e.description) CONTAINS keyword)
          )
          WITH e LIMIT 10
          OPTIONAL MATCH (e)-[r]-(connected:Entity)
          WHERE (connected.isDuplicate IS NULL OR connected.isDuplicate <> true)
          AND (
            any(keyword IN $keywords WHERE toLower(connected.name) CONTAINS keyword)
            OR any(keyword IN $keywords WHERE toLower(connected.description) CONTAINS keyword)
            OR id(e) < id(connected)
          )
          WITH e, collect(distinct {rel: r, node: connected, relType: type(r)}) as connections
          LIMIT 15
          RETURN e, connections
          `,
          { userId, keywords }
        );
      }
      
      console.log(`[Graph Processor] Query graph: Found ${result.records.length} entities with connections`);
      
      const nodes: any[] = [];
      const edges: any[] = [];
      const seenNodes = new Set<string>();
      const seenEdges = new Set<string>();
      
      result.records.forEach(record => {
        const entity = record.get('e');
        const connections = record.get('connections') || [];
        const props = entity.properties;
        
        console.log('[Graph Processor] Processing entity:', props.name, '(', props.type, ')');
        
        if (!seenNodes.has(props.id)) {
          nodes.push({
            id: props.id,
            label: props.name || props.id,
            type: props.type || 'CONCEPT',
            properties: {
              ...props,
              name: props.name || props.id,
              description: props.description || ''
            }
          });
          seenNodes.add(props.id);
        }
        
        connections.forEach((conn: any) => {
          if (conn.node && conn.rel) {
            const connProps = conn.node.properties;
            const connectedId = connProps.id;
            
            if (!seenNodes.has(connectedId)) {
              nodes.push({
                id: connectedId,
                label: connProps.name || connectedId,
                type: connProps.type || 'CONCEPT',
                properties: {
                  ...connProps,
                  name: connProps.name || connectedId,
                  description: connProps.description || ''
                }
              });
              seenNodes.add(connectedId);
            }
            
            const edgeKey = `${props.id}-${conn.relType}-${connectedId}`;
            const reverseEdgeKey = `${connectedId}-${conn.relType}-${props.id}`;
            
            if (!seenEdges.has(edgeKey) && !seenEdges.has(reverseEdgeKey)) {
              const relProps = conn.rel.properties || {};
              const confidence = relProps.confidence !== undefined ? relProps.confidence : 0.8;
              
              edges.push({
                id: edgeKey,
                source: props.id,
                target: connectedId,
                type: conn.relType,
                properties: {
                  ...relProps,
                  confidence: confidence
                }
              });
              seenEdges.add(edgeKey);
            }
          }
        });
      });
      
      console.log(`[Graph Processor] Query KG built: ${nodes.length} nodes, ${edges.length} edges`);
      
      return {
        nodes,
        edges,
        metadata: {
          entityCount: nodes.length,
          relationshipCount: edges.length,
          createdAt: new Date().toISOString(),
          scope: 'query'
        }
      };
    } finally {
      await session.close();
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async getGraphStatistics(userId: string): Promise<{
    totalEntities: number;
    totalRelationships: number;
    entityTypes: Record<string, number>;
    relationshipTypes: Record<string, number>;
  }> {
    const session = await getSession();
    try {
      const statsResult = await session.run(
        `
        MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e:Entity)
        WHERE e.isDuplicate IS NULL OR e.isDuplicate <> true
        WITH count(e) as entityCount, collect(e.type) as types
        MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e1:Entity)-[r]->(e2:Entity)
        WHERE (e1.isDuplicate IS NULL OR e1.isDuplicate <> true)
          AND (e2.isDuplicate IS NULL OR e2.isDuplicate <> true)
        RETURN entityCount, types, count(r) as relCount, collect(type(r)) as relTypes
        `,
        { userId }
      );
      console.log(`[Graph Processor] Statistics query completed`);
      const record = statsResult.records[0];
      const entityCount = record?.get('entityCount')?.toNumber() || 0;
      const relCount = record?.get('relCount')?.toNumber() || 0;
      const types = record?.get('types') || [];
      const relTypes = record?.get('relTypes') || [];
      const entityTypes: Record<string, number> = {};
      types.forEach((type: string) => {
        entityTypes[type] = (entityTypes[type] || 0) + 1;
      });
      const relationshipTypes: Record<string, number> = {};
      relTypes.forEach((type: string) => {
        relationshipTypes[type] = (relationshipTypes[type] || 0) + 1;
      });
      return {
        totalEntities: entityCount,
        totalRelationships: relCount,
        entityTypes,
        relationshipTypes
      };
    } finally {
      await session.close();
    }
  }
}

export const graphProcessor = new GraphProcessor();

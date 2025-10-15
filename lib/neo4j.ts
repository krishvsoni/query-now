import neo4j, { Driver, Session } from 'neo4j-driver';

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!)
    );
  }
  return driver;
}

export async function getSession(): Promise<Session> {
  const driver = getDriver();
  return driver.session({ database: process.env.NEO4J_DATABASE });
}

export async function createUserDocumentNode(
  userId: string,
  documentId: string,
  fileName: string,
  metadata: any = {}
) {
  const session = await getSession();
  try {
    const flatMetadata: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== null && value !== undefined) {
        if (typeof value === 'object') {
          flatMetadata[key] = JSON.stringify(value);
        } else {
          flatMetadata[key] = value as string | number | boolean;
        }
      }
    }
    const result = await session.run(
      `
      MERGE (u:User {id: $userId})
      MERGE (d:Document {id: $documentId})
      SET d.fileName = $fileName, 
          d.pageCount = $pageCount,
          d.wordCount = $wordCount,
          d.fileSize = $fileSize,
          d.extractedAt = $extractedAt,
          d.fileId = $fileId,
          d.status = $status,
          d.processingStage = $processingStage,
          d.uploadedAt = $uploadedAt,
          d.createdAt = datetime()
      MERGE (u)-[:OWNS]->(d)
      RETURN d
      `,
      { 
        userId, 
        documentId, 
        fileName,
        pageCount: flatMetadata.pageCount || 0,
        wordCount: flatMetadata.wordCount || 0,
        fileSize: flatMetadata.fileSize || 0,
        extractedAt: flatMetadata.extractedAt || new Date().toISOString(),
        fileId: flatMetadata.fileId || '',
        status: flatMetadata.status || 'uploaded',
        processingStage: flatMetadata.processingStage || 'pending',
        uploadedAt: flatMetadata.uploadedAt || new Date().toISOString()
      }
    );
    return result.records[0]?.get('d');
  } finally {
    await session.close();
  }
}

export async function createEntity(
  documentId: string,
  entityId: string,
  entityType: string,
  properties: any,
  embedding?: number[]
) {
  const session = await getSession();
  try {
    console.log(`[Neo4j] Creating entity: ${entityId} (${entityType}) with name: ${properties.name || 'N/A'}`);
    const flatProperties: Record<string, string | number | boolean> = {};
    if (properties && typeof properties === 'object') {
      for (const [key, value] of Object.entries(properties)) {
        if (value !== null && value !== undefined) {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            flatProperties[key] = value;
          } else if (typeof value === 'object') {
            flatProperties[key] = JSON.stringify(value);
          } else {
            flatProperties[key] = String(value);
          }
        }
      }
    }
    const queryParams: any = { 
      documentId, 
      entityId, 
      entityType, 
      name: properties.name || properties.entity || entityId,
      description: properties.description || ''
    };
    Object.entries(flatProperties).forEach(([key, value]) => {
      if (key !== 'name' && key !== 'description') {
        queryParams[`prop_${key}`] = value;
      }
    });
    if (embedding) {
      queryParams.embedding = embedding;
    }
    const additionalProps = Object.keys(flatProperties)
      .filter(key => key !== 'name' && key !== 'description')
      .map(key => `e.\`${key}\` = $prop_${key}`)
      .join(', ');
    const result = await session.run(
      `
      MATCH (d:Document {id: $documentId})
      MERGE (e:Entity {id: $entityId})
      SET e.type = $entityType, 
          e.name = $name,
          e.description = $description
      ${additionalProps ? `, ${additionalProps}` : ''}
      ${embedding ? ', e.embedding = $embedding' : ''}
      MERGE (d)-[:CONTAINS]->(e)
      RETURN e
      `,
      queryParams
    );
    if (result.records.length > 0) {
      console.log(`[Neo4j] ✓ Entity created: ${entityId}`);
    } else {
      console.warn(`[Neo4j] ⚠ Entity creation returned no records (document may not exist: ${documentId})`);
    }
    return result.records[0]?.get('e');
  } catch (error) {
    console.error(`[Neo4j] ✗ Failed to create entity ${entityId}:`, error instanceof Error ? error.message : error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function createRelationship(
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: string,
  properties: any = {}
) {
  const session = await getSession();
  try {
    const sanitizedType = relationshipType
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'RELATED_TO';
    console.log(`[Neo4j] Creating relationship: ${sourceEntityId} -[${sanitizedType}]-> ${targetEntityId}`);
    const flatProperties: Record<string, string | number | boolean> = {};
    if (properties && typeof properties === 'object') {
      for (const [key, value] of Object.entries(properties)) {
        if (value !== null && value !== undefined) {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            flatProperties[key] = value;
          } else if (typeof value === 'object') {
            flatProperties[key] = JSON.stringify(value);
          } else {
            flatProperties[key] = String(value);
          }
        }
      }
    }
    const result = await session.run(
      `
      MATCH (source:Entity {id: $sourceEntityId})
      MATCH (target:Entity {id: $targetEntityId})
      MERGE (source)-[r:\`${sanitizedType}\`]->(target)
      SET r += $properties
      RETURN r
      `,
      { sourceEntityId, targetEntityId, properties: flatProperties }
    );
    if (result.records.length > 0) {
      console.log(`[Neo4j] ✓ Relationship created: ${sanitizedType}`);
    } else {
      console.warn(`[Neo4j] ⚠ Relationship creation returned no records (entities may not exist)`);
    }
    return result.records[0]?.get('r');
  } catch (error) {
    console.error(`[Neo4j] ✗ Failed to create relationship:`, error instanceof Error ? error.message : error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function searchEntities(
  userId: string,
  query: string,
  documentIds?: string[]
) {
  const session = await getSession();
  try {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['what', 'where', 'when', 'which', 'who', 'how', 'does', 'about', 'the', 'and', 'with', 'from', 'that', 'this', 'can', 'you', 'provide'].includes(word));
    console.log(`[Neo4j Entity Search] Searching for keywords: ${keywords.join(', ')}`);
    let cypher = `
      MATCH (u:User {id: $userId})-[:OWNS]->(d:Document)-[:CONTAINS]->(e:Entity)
      WHERE (e.isDuplicate IS NULL OR e.isDuplicate <> true)
    `;
    const params: any = { userId };
    if (documentIds && documentIds.length > 0) {
      cypher += ` AND d.id IN $documentIds`;
      params.documentIds = documentIds;
    }
    if (keywords.length > 0) {
      cypher += `
      AND (
        ${keywords.map((_, i) => `toLower(e.name) CONTAINS $keyword${i}`).join(' OR ')}
        OR ${keywords.map((_, i) => `toLower(e.description) CONTAINS $keyword${i}`).join(' OR ')}
      )
      WITH e, d,
        size([keyword IN $keywords WHERE toLower(e.name) CONTAINS keyword]) * 2 +
        size([keyword IN $keywords WHERE toLower(e.description) CONTAINS keyword]) +
        CASE WHEN any(keyword IN $keywords WHERE toLower(e.name) = keyword) THEN 20 ELSE 0 END +
        CASE WHEN size(split(toLower(e.name), ' ')) <= 2 THEN 3 ELSE 0 END
        as relevance
      WHERE relevance > 0
      `;
      keywords.forEach((keyword, i) => {
        params[`keyword${i}`] = keyword.toLowerCase();
      });
      params.keywords = keywords;
      cypher += `
      RETURN e, d.fileName as fileName, d.id as documentId, relevance
      ORDER BY relevance DESC, e.name ASC
      LIMIT 15
      `;
    } else {
      cypher += ` RETURN e, d.fileName as fileName, d.id as documentId, 1 as relevance LIMIT 15`;
    }
    const result = await session.run(cypher, params);
    const entities = result.records.map(record => ({
      entity: record.get('e').properties,
      fileName: record.get('fileName'),
      documentId: record.get('documentId'),
      relevance: record.get('relevance')?.toNumber() || 1
    }));
    console.log(`[Neo4j Entity Search] Found ${entities.length} entities (sorted by relevance)`);
    if (entities.length > 0) {
      console.log('[Neo4j Entity Search] Top entities:', entities.slice(0, 5).map(e => `${e.entity.name} (relevance: ${e.relevance})`).join(', '));
    }
    return entities;
  } finally {
    await session.close();
  }
}

export async function getEntityRelationships(entityId: string, depth: number = 1) {
  const session = await getSession();
  try {
    const query = `
      MATCH (e:Entity {id: $entityId})-[r*1..${depth}]-(related:Entity)
      RETURN e, r, related
    `;
    const result = await session.run(query, { entityId });
    return result.records.map(record => ({
      source: record.get('e').properties,
      relationships: record.get('r'),
      target: record.get('related').properties
    }));
  } finally {
    await session.close();
  }
}

export async function getUserDocuments(userId: string) {
  const session = await getSession();
  try {
    const result = await session.run(
      `
      MATCH (u:User {id: $userId})-[:OWNS]->(d:Document)
      RETURN d
      ORDER BY d.createdAt DESC
      `,
      { userId }
    );
    return result.records.map(record => record.get('d').properties);
  } finally {
    await session.close();
  }
}

export async function updateDocumentStatus(
  documentId: string,
  status: string,
  processingStage: string,
  additionalData?: Record<string, any>
) {
  const session = await getSession();
  try {
    const updateFields = {
      documentId,
      status,
      processingStage,
      updatedAt: new Date().toISOString(),
      wordCount: additionalData?.wordCount || null,
      pageCount: additionalData?.pageCount || null,
      ...additionalData
    };
    const result = await session.run(
      `
      MATCH (d:Document {id: $documentId})
      SET d.status = $status,
          d.processingStage = $processingStage,
          d.updatedAt = $updatedAt
      ${updateFields.wordCount !== null ? ', d.wordCount = $wordCount' : ''}
      ${updateFields.pageCount !== null ? ', d.pageCount = $pageCount' : ''}
      RETURN d
      `,
      updateFields
    );
    return result.records[0]?.get('d').properties;
  } finally {
    await session.close();
  }
}

export async function deleteUserDocument(userId: string, documentId: string) {
  const session = await getSession();
  try {
    await session.run(
      `
      MATCH (u:User {id: $userId})-[:OWNS]->(d:Document {id: $documentId})
      DETACH DELETE d
      `,
      { userId, documentId }
    );
    return true;
  } finally {
    await session.close();
  }
}

export async function executeCypherQuery(
  query: string,
  parameters: Record<string, any> = {}
): Promise<any[]> {
  const session = await getSession();
  try {
    let cleanQuery = query.trim();
    if (cleanQuery.startsWith('```cypher') || cleanQuery.startsWith('```')) {
      cleanQuery = cleanQuery.replace(/^```(?:cypher)?\n?/i, '').replace(/\n?```\s*$/i, '');
    }
    console.log('[Neo4j] Executing Cypher query:', cleanQuery.substring(0, 100) + '...');
    const result = await session.run(cleanQuery, parameters);
    return result.records.map(record => {
      const obj: Record<string, any> = {};
      record.keys.forEach((key) => {
        obj[String(key)] = record.get(key);
      });
      return obj;
    });
  } finally {
    await session.close();
  }
}

export async function findPathBetweenEntities(
  userId: string,
  entity1Name: string,
  entity2Name: string,
  maxDepth: number = 5
): Promise<any[]> {
  const session = await getSession();
  try {
    const result = await session.run(
      `
      MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e1:Entity)
      MATCH (u)-[:OWNS]->(:Document)-[:CONTAINS]->(e2:Entity)
      WHERE (toLower(e1.name) CONTAINS toLower($entity1) OR e1.id = $entity1)
        AND (toLower(e2.name) CONTAINS toLower($entity2) OR e2.id = $entity2)
        AND e1 <> e2
        AND NOT e1.isDuplicate = true AND NOT e2.isDuplicate = true
      MATCH path = shortestPath((e1)-[*1..${maxDepth}]-(e2))
      RETURN path, length(path) as pathLength
      ORDER BY pathLength
      LIMIT 5
      `,
      { userId, entity1: entity1Name, entity2: entity2Name }
    );
    return result.records.map(record => {
      const path = record.get('path');
      const pathLength = record.get('pathLength').toNumber();
      return {
        length: pathLength,
        nodes: path.segments.map((seg: any) => seg.start.properties),
        relationships: path.segments.map((seg: any) => ({
          type: seg.relationship.type,
          properties: seg.relationship.properties
        }))
      };
    });
  } finally {
    await session.close();
  }
}

export async function traverseGraph(
  userId: string,
  startEntityIds: string[],
  depth: number = 2,
  filters?: {
    entityTypes?: string[];
    relationshipTypes?: string[];
    minConnections?: number;
  }
): Promise<{
  entities: any[];
  relationships: any[];
  paths: any[];
}> {
  const session = await getSession();
  try {
    let cypher = `
      MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(start:Entity)
      WHERE start.id IN $startEntityIds AND NOT start.isDuplicate = true
      MATCH path = (start)-[r*1..$depth]-(connected:Entity)
      WHERE NOT connected.isDuplicate = true
    `;
    if (filters?.entityTypes && filters.entityTypes.length > 0) {
      cypher += ` AND connected.type IN $entityTypes`;
    }
    if (filters?.relationshipTypes && filters.relationshipTypes.length > 0) {
      cypher += ` AND ALL(rel IN r WHERE type(rel) IN $relationshipTypes)`;
    }
    cypher += `
      RETURN start, connected, r, path
      LIMIT 100
    `;
    const params: any = { userId, startEntityIds, depth };
    if (filters?.entityTypes) params.entityTypes = filters.entityTypes;
    if (filters?.relationshipTypes) params.relationshipTypes = filters.relationshipTypes;
    const result = await session.run(cypher, params);
    const entities = new Map<string, any>();
    const relationships: any[] = [];
    const paths: any[] = [];
    result.records.forEach(record => {
      const start = record.get('start');
      const connected = record.get('connected');
      const rels = record.get('r');
      const path = record.get('path');
      entities.set(start.properties.id, start.properties);
      entities.set(connected.properties.id, connected.properties);
      rels.forEach((rel: any) => {
        relationships.push({
          type: rel.type,
          properties: rel.properties,
          start: rel.start,
          end: rel.end
        });
      });
      paths.push({
        length: path.length,
        nodes: path.segments.map((seg: any) => seg.start.properties.id),
        edges: path.segments.map((seg: any) => seg.relationship.type)
      });
    });
    return {
      entities: Array.from(entities.values()),
      relationships,
      paths
    };
  } finally {
    await session.close();
  }
}

export async function getEntityNeighborhood(
  entityId: string,
  radius: number = 2
): Promise<{
  center: any;
  neighbors: Array<{
    entity: any;
    distance: number;
    path: string[];
  }>;
}> {
  const session = await getSession();
  try {
    const query = `
      MATCH (center:Entity {id: $entityId})
      WHERE NOT center.isDuplicate = true
      OPTIONAL MATCH path = (center)-[*1..${radius}]-(neighbor:Entity)
      WHERE NOT neighbor.isDuplicate = true AND neighbor <> center
      RETURN center, 
             collect(DISTINCT {
               entity: neighbor,
               distance: length(path),
               pathNodes: [n IN nodes(path) | n.name]
             }) as neighbors
    `;
    const result = await session.run(query, { entityId });
    if (result.records.length === 0) {
      throw new Error('Entity not found');
    }
    const record = result.records[0];
    const center = record.get('center').properties;
    const neighbors = record.get('neighbors')
      .filter((n: any) => n.entity !== null)
      .map((n: any) => ({
        entity: n.entity.properties,
        distance: n.distance?.toNumber() || 0,
        path: n.pathNodes || []
      }));
    return { center, neighbors };
  } finally {
    await session.close();
  }
}

export async function findGraphHubs(
  userId: string,
  limit: number = 10
): Promise<Array<{
  entity: any;
  connectionCount: number;
  incomingCount: number;
  outgoingCount: number;
}>> {
  const session = await getSession();
  try {
    const result = await session.run(
      `
      MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e:Entity)
      WHERE NOT e.isDuplicate = true
      OPTIONAL MATCH (e)-[r_out]->(other_out:Entity)
      WHERE NOT other_out.isDuplicate = true
      OPTIONAL MATCH (e)<-[r_in]-(other_in:Entity)
      WHERE NOT other_in.isDuplicate = true
      WITH e, 
           count(DISTINCT r_out) as outgoing,
           count(DISTINCT r_in) as incoming
      WITH e, outgoing, incoming, (outgoing + incoming) as total
      WHERE total > 0
      RETURN e, total, incoming, outgoing
      ORDER BY total DESC
      LIMIT $limit
      `,
      { userId, limit }
    );
    return result.records.map(record => ({
      entity: record.get('e').properties,
      connectionCount: record.get('total').toNumber(),
      incomingCount: record.get('incoming').toNumber(),
      outgoingCount: record.get('outgoing').toNumber()
    }));
  } finally {
    await session.close();
  }
}

export async function detectCommunities(
  userId: string
): Promise<Array<{
  communityId: number;
  entities: any[];
  size: number;
}>> {
  const session = await getSession();
  try {
    const result = await session.run(
      `
      MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e:Entity)
      WHERE NOT e.isDuplicate = true
      OPTIONAL MATCH path = (e)-[*1..3]-(connected:Entity)
      WHERE NOT connected.isDuplicate = true
      WITH e, collect(DISTINCT connected) as community
      RETURN e, community
      LIMIT 50
      `,
      { userId }
    );
    const communities = new Map<string, Set<any>>();
    result.records.forEach((record, idx) => {
      const entity = record.get('e').properties;
      const communityMembers = record.get('community');
      const communityId = `comm-${idx}`;
      if (!communities.has(communityId)) {
        communities.set(communityId, new Set());
      }
      communities.get(communityId)!.add(entity);
      communityMembers.forEach((member: any) => {
        if (member) {
          communities.get(communityId)!.add(member.properties);
        }
      });
    });
    return Array.from(communities.entries()).map(([id, entities], idx) => ({
      communityId: idx,
      entities: Array.from(entities),
      size: entities.size
    }));
  } finally {
    await session.close();
  }
}

export async function calculateCentrality(
  userId: string,
  entityIds?: string[]
): Promise<Array<{
  entity: any;
  degreeCentrality: number;
  betweennessCentrality?: number;
}>> {
  const session = await getSession();
  try {
    let cypher = `
      MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e:Entity)
      WHERE NOT e.isDuplicate = true
    `;
    if (entityIds && entityIds.length > 0) {
      cypher += ` AND e.id IN $entityIds`;
    }
    cypher += `
      OPTIONAL MATCH (e)-[r]-(other:Entity)
      WHERE NOT other.isDuplicate = true
      WITH e, count(DISTINCT r) as degree
      RETURN e, degree
      ORDER BY degree DESC
      LIMIT 50
    `;
    const params: any = { userId };
    if (entityIds) params.entityIds = entityIds;
    const result = await session.run(cypher, params);
    return result.records.map(record => ({
      entity: record.get('e').properties,
      degreeCentrality: record.get('degree').toNumber()
    }));
  } finally {
    await session.close();
  }
}

export async function semanticGraphSearch(
  userId: string,
  embedding: number[],
  topK: number = 10,
  entityTypes?: string[]
): Promise<Array<{
  entity: any;
  similarity: number;
}>> {
  const session = await getSession();
  try {
    let cypher = `
      MATCH (u:User {id: $userId})-[:OWNS]->(:Document)-[:CONTAINS]->(e:Entity)
      WHERE NOT e.isDuplicate = true AND e.embedding IS NOT NULL
    `;
    if (entityTypes && entityTypes.length > 0) {
      cypher += ` AND e.type IN $entityTypes`;
    }
    cypher += `
      RETURN e, e.embedding as embedding
      LIMIT 100
    `;
    const params: any = { userId };
    if (entityTypes) params.entityTypes = entityTypes;
    const result = await session.run(cypher, params);
    const similarities = result.records
      .map(record => {
        const entity = record.get('e').properties;
        const entityEmbedding = record.get('embedding');
        if (!entityEmbedding) return null;
        const similarity = cosineSimilarity(embedding, entityEmbedding);
        return { entity, similarity };
      })
      .filter((item): item is { entity: any; similarity: number } => item !== null)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
    return similarities;
  } finally {
    await session.close();
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function debugGraphData(userId: string) {
  const session = await getSession();
  try {
    const entityResult = await session.run(
      `
      MATCH (u:User {id: $userId})-[:OWNS]->(d:Document)-[:CONTAINS]->(e:Entity)
      RETURN count(e) as entityCount, collect(DISTINCT e.type) as types, collect(e.name)[0..5] as sampleNames
      `,
      { userId }
    );
    const relResult = await session.run(
      `
      MATCH (u:User {id: $userId})-[:OWNS]->(d:Document)-[:CONTAINS]->(e1:Entity)-[r]->(e2:Entity)
      RETURN count(r) as relCount, collect(DISTINCT type(r)) as relTypes
      `,
      { userId }
    );
    const entityCount = entityResult.records[0]?.get('entityCount')?.toNumber() || 0;
    const types = entityResult.records[0]?.get('types') || [];
    const sampleNames = entityResult.records[0]?.get('sampleNames') || [];
    const relCount = relResult.records[0]?.get('relCount')?.toNumber() || 0;
    const relTypes = relResult.records[0]?.get('relTypes') || [];
    console.log(`[Neo4j Debug] User ${userId} graph data:`, {
      entityCount,
      relationshipCount: relCount,
      entityTypes: types,
      relationshipTypes: relTypes,
      sampleEntityNames: sampleNames
    });
    return {
      entityCount,
      relationshipCount: relCount,
      entityTypes: types,
      relationshipTypes: relTypes,
      sampleEntityNames: sampleNames
    };
  } finally {
    await session.close();
  }
}

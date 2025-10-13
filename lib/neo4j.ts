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
    const result = await session.run(
      `
      MATCH (d:Document {id: $documentId})
      MERGE (e:Entity {id: $entityId})
      SET e.type = $entityType, e.properties = $properties
      ${embedding ? ', e.embedding = $embedding' : ''}
      MERGE (d)-[:CONTAINS]->(e)
      RETURN e
      `,
      { documentId, entityId, entityType, properties, embedding }
    );
    
    return result.records[0]?.get('e');
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
    const result = await session.run(
      `
      MATCH (source:Entity {id: $sourceEntityId})
      MATCH (target:Entity {id: $targetEntityId})
      MERGE (source)-[r:${relationshipType}]->(target)
      SET r += $properties
      RETURN r
      `,
      { sourceEntityId, targetEntityId, properties }
    );
    
    return result.records[0]?.get('r');
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
    let cypher = `
      MATCH (u:User {id: $userId})-[:OWNS]->(d:Document)-[:CONTAINS]->(e:Entity)
      WHERE (e.properties.name CONTAINS $query OR 
             e.properties.description CONTAINS $query OR
             e.type CONTAINS $query)
    `;
    
    const params: any = { userId, query };
    
    if (documentIds && documentIds.length > 0) {
      cypher += ` AND d.id IN $documentIds`;
      params.documentIds = documentIds;
    }
    
    cypher += ` RETURN e, d.fileName as fileName, d.id as documentId LIMIT 20`;
    
    const result = await session.run(cypher, params);
    
    return result.records.map(record => ({
      entity: record.get('e').properties,
      fileName: record.get('fileName'),
      documentId: record.get('documentId')
    }));
  } finally {
    await session.close();
  }
}

export async function getEntityRelationships(entityId: string, depth: number = 1) {
  const session = await getSession();
  
  try {
    const result = await session.run(
      `
      MATCH (e:Entity {id: $entityId})-[r*1..$depth]-(related:Entity)
      RETURN e, r, related
      `,
      { entityId, depth }
    );
    
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
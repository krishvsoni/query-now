import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { searchEntities, getEntityRelationships } from '@/lib/neo4j';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(true);
    const { searchParams } = new URL(request.url);
    
    const query = searchParams.get('query') || '';
    const documentIds = searchParams.getAll('documentIds');

    const entityResults = await searchEntities(user.id, query, documentIds.length > 0 ? documentIds : undefined);
    
    const nodes: any[] = [];
    const links: any[] = [];
    const processedEntities = new Set<string>();

    for (const entityResult of entityResults) {
      const entity = entityResult.entity;
      
      if (!processedEntities.has(entity.id)) {
        nodes.push({
          id: entity.id,
          name: entity.name || entity.id,
          type: entity.type || 'CONCEPT',
          description: entity.description,
          documentId: entityResult.documentId,
          fileName: entityResult.fileName
        });
        
        processedEntities.add(entity.id);

        try {
          const relationships = await getEntityRelationships(entity.id, 1);
          
          for (const rel of relationships) {
            const sourceId = rel.source.id;
            const targetId = rel.target.id;
            
            if (!processedEntities.has(targetId)) {
              nodes.push({
                id: targetId,
                name: rel.target.name || targetId,
                type: rel.target.type || 'CONCEPT',
                description: rel.target.description
              });
              processedEntities.add(targetId);
            }
            
            const relationshipType = rel.relationships[0]?.type || 'RELATED';
            const linkId = `${sourceId}-${targetId}-${relationshipType}`;
            
            if (!links.find(l => l.id === linkId)) {
              links.push({
                id: linkId,
                source: sourceId,
                target: targetId,
                type: relationshipType,
                strength: rel.relationships[0]?.properties?.strength || 1
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching relationships for entity ${entity.id}:`, error);
        }
      }
    }

    if (!query && nodes.length < 20) {
    }

    return NextResponse.json({
      nodes: nodes.slice(0, 100),
      links: links.slice(0, 200),
      metadata: {
        totalEntities: nodes.length,
        totalRelationships: links.length,
        documentCount: new Set(entityResults.map(r => r.documentId)).size
      }
    });

  } catch (error) {
    console.error('Graph API error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch graph data',
      nodes: [],
      links: []
    }, { status: 500 });
  }
}

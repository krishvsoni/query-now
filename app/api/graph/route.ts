import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { searchEntities, getEntityRelationships } from '@/lib/neo4j';
import { graphProcessor } from '@/lib/graph-processor';
import { ontologyManager } from '@/lib/ontology-manager';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(true);
    const { searchParams } = new URL(request.url);
    
    const mode = searchParams.get('mode') || 'central'; // central, document, query
    const query = searchParams.get('query') || '';
    const documentId = searchParams.get('documentId');
    const documentIds = searchParams.getAll('documentIds');
    const entityIds = searchParams.getAll('entityIds');

    let knowledgeGraph;
    
    // Mode: Central Knowledge Graph (all user data)
    if (mode === 'central') {
      knowledgeGraph = await graphProcessor.buildCentralKnowledgeGraph(user.id);
      
      // Also get statistics
      const stats = await graphProcessor.getGraphStatistics(user.id);
      
      return NextResponse.json({
        nodes: knowledgeGraph.nodes,
        edges: knowledgeGraph.edges,
        metadata: {
          ...knowledgeGraph.metadata,
          statistics: stats
        }
      });
    }
    
    // Mode: Document-specific Knowledge Graph
    if (mode === 'document' && documentId) {
      knowledgeGraph = await graphProcessor.buildDocumentKnowledgeGraph(user.id, documentId);
      
      return NextResponse.json({
        nodes: knowledgeGraph.nodes,
        edges: knowledgeGraph.edges,
        metadata: knowledgeGraph.metadata
      });
    }
    
    // Mode: Query-specific Knowledge Graph
    if (mode === 'query' && (query || entityIds.length > 0)) {
      let relevantEntityIds = entityIds;
      
      // If query provided, find relevant entities first
      if (query && relevantEntityIds.length === 0) {
        const entityResults = await searchEntities(
          user.id, 
          query, 
          documentIds.length > 0 ? documentIds : undefined
        );
        relevantEntityIds = entityResults.slice(0, 10).map(r => r.entity.id);
      }
      
      if (relevantEntityIds.length > 0) {
        knowledgeGraph = await graphProcessor.buildQueryKnowledgeGraph(
          user.id,
          query,
          relevantEntityIds
        );
        
        return NextResponse.json({
          nodes: knowledgeGraph.nodes,
          edges: knowledgeGraph.edges,
          metadata: knowledgeGraph.metadata
        });
      }
    }
    
    // Fallback: Legacy mode for backward compatibility
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

    return NextResponse.json({
      nodes: nodes.slice(0, 100),
      links: links.slice(0, 200),
      metadata: {
        totalEntities: nodes.length,
        totalRelationships: links.length,
        documentCount: new Set(entityResults.map(r => r.documentId)).size,
        scope: 'legacy'
      }
    });

  } catch (error) {
    console.error('Graph API error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch graph data',
      nodes: [],
      edges: [],
      links: []
    }, { status: 500 });
  }
}

/**
 * POST - Manage ontology and graph operations
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(true);
    const body = await request.json();
    const { action, ...params } = body;
    
    switch (action) {
      // Get ontology
      case 'get_ontology':
        const ontology = await ontologyManager.getOntology(user.id);
        return NextResponse.json({ ontology });
      
      // Get visual ontology
      case 'get_visual_ontology':
        const visualOntology = await ontologyManager.getVisualOntology(user.id);
        return NextResponse.json(visualOntology);
      
      // Add entity type
      case 'add_entity_type':
        const newEntityType = await ontologyManager.addEntityType(
          user.id,
          params.description
        );
        return NextResponse.json({ entityType: newEntityType });
      
      // Add relationship type
      case 'add_relationship_type':
        const newRelType = await ontologyManager.addRelationshipType(
          user.id,
          params.description,
          params.sourceType,
          params.targetType
        );
        return NextResponse.json({ relationshipType: newRelType });
      
      // Modify entity type
      case 'modify_entity_type':
        const modifiedType = await ontologyManager.modifyEntityType(
          user.id,
          params.entityTypeName,
          params.modification
        );
        return NextResponse.json({ entityType: modifiedType });
      
      // Resolve entities (deduplication)
      case 'resolve_entities':
        await graphProcessor.resolveEntities(user.id, params.entities);
        return NextResponse.json({ success: true });
      
      // Deduplicate relationships
      case 'deduplicate_relationships':
        const dedupCount = await graphProcessor.deduplicateRelationships(user.id);
        return NextResponse.json({ deduplicated: dedupCount });
      
      // Get graph statistics
      case 'get_statistics':
        const stats = await graphProcessor.getGraphStatistics(user.id);
        return NextResponse.json({ statistics: stats });
      
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Graph POST API error:', error);
    return NextResponse.json({ 
      error: 'Failed to process request'
    }, { status: 500 });
  }
}

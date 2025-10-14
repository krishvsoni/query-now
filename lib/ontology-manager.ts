import { getSession } from './neo4j';
import { pipeline } from './redis';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

/**
 * Visual Ontology Manager with LLM-assisted modifications
 * Manages entity types, schemas, and relationships
 */

export interface EntityTypeDefinition {
  name: string;
  description: string;
  properties: PropertyDefinition[];
  color?: string;
  icon?: string;
  aliases?: string[];
}

export interface PropertyDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  required: boolean;
  description?: string;
  defaultValue?: any;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    enum?: any[];
  };
}

export interface RelationshipTypeDefinition {
  name: string;
  description: string;
  sourceTypes: string[];
  targetTypes: string[];
  properties?: PropertyDefinition[];
  bidirectional?: boolean;
  cardinality?: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export interface Ontology {
  version: string;
  entityTypes: EntityTypeDefinition[];
  relationshipTypes: RelationshipTypeDefinition[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  };
}

export class OntologyManager {
  private defaultOntology: Ontology = {
    version: '1.0.0',
    entityTypes: [
      {
        name: 'Person',
        description: 'Individual human being',
        properties: [
          { name: 'name', type: 'string', required: true },
          { name: 'title', type: 'string', required: false },
          { name: 'email', type: 'string', required: false },
          { name: 'phone', type: 'string', required: false }
        ],
        color: '#4CAF50',
        icon: '👤'
      },
      {
        name: 'Organization',
        description: 'Company, institution, or group',
        properties: [
          { name: 'name', type: 'string', required: true },
          { name: 'industry', type: 'string', required: false },
          { name: 'size', type: 'number', required: false },
          { name: 'founded', type: 'date', required: false }
        ],
        color: '#2196F3',
        icon: '🏢'
      },
      {
        name: 'Concept',
        description: 'Abstract idea or notion',
        properties: [
          { name: 'name', type: 'string', required: true },
          { name: 'definition', type: 'string', required: false },
          { name: 'category', type: 'string', required: false }
        ],
        color: '#9C27B0',
        icon: '💡'
      },
      {
        name: 'Location',
        description: 'Physical or geographical place',
        properties: [
          { name: 'name', type: 'string', required: true },
          { name: 'address', type: 'string', required: false },
          { name: 'coordinates', type: 'object', required: false },
          { name: 'type', type: 'string', required: false }
        ],
        color: '#FF9800',
        icon: '📍'
      },
      {
        name: 'Event',
        description: 'Occurrence or happening',
        properties: [
          { name: 'name', type: 'string', required: true },
          { name: 'date', type: 'date', required: false },
          { name: 'location', type: 'string', required: false },
          { name: 'participants', type: 'array', required: false }
        ],
        color: '#F44336',
        icon: '📅'
      },
      {
        name: 'Technology',
        description: 'Tool, software, or technical system',
        properties: [
          { name: 'name', type: 'string', required: true },
          { name: 'version', type: 'string', required: false },
          { name: 'vendor', type: 'string', required: false },
          { name: 'category', type: 'string', required: false }
        ],
        color: '#00BCD4',
        icon: '⚙️'
      },
      {
        name: 'Product',
        description: 'Good or service',
        properties: [
          { name: 'name', type: 'string', required: true },
          { name: 'price', type: 'number', required: false },
          { name: 'category', type: 'string', required: false },
          { name: 'manufacturer', type: 'string', required: false }
        ],
        color: '#FFEB3B',
        icon: '📦'
      },
      {
        name: 'Document',
        description: 'Written or recorded information',
        properties: [
          { name: 'name', type: 'string', required: true },
          { name: 'type', type: 'string', required: false },
          { name: 'author', type: 'string', required: false },
          { name: 'date', type: 'date', required: false }
        ],
        color: '#795548',
        icon: '📄'
      }
    ],
    relationshipTypes: [
      {
        name: 'WORKS_FOR',
        description: 'Employment relationship',
        sourceTypes: ['Person'],
        targetTypes: ['Organization'],
        cardinality: 'many-to-one'
      },
      {
        name: 'LOCATED_IN',
        description: 'Physical location relationship',
        sourceTypes: ['Person', 'Organization', 'Event'],
        targetTypes: ['Location'],
        cardinality: 'many-to-one'
      },
      {
        name: 'PART_OF',
        description: 'Component or membership relationship',
        sourceTypes: ['Organization', 'Concept', 'Technology'],
        targetTypes: ['Organization', 'Concept', 'Technology'],
        cardinality: 'many-to-one'
      },
      {
        name: 'RELATED_TO',
        description: 'General relationship',
        sourceTypes: ['*'],
        targetTypes: ['*'],
        cardinality: 'many-to-many',
        bidirectional: true
      },
      {
        name: 'USES',
        description: 'Usage or dependency relationship',
        sourceTypes: ['Person', 'Organization'],
        targetTypes: ['Technology', 'Product'],
        cardinality: 'many-to-many'
      },
      {
        name: 'CREATED_BY',
        description: 'Authorship or creation relationship',
        sourceTypes: ['Document', 'Product', 'Technology'],
        targetTypes: ['Person', 'Organization'],
        cardinality: 'many-to-one'
      },
      {
        name: 'PARTICIPATED_IN',
        description: 'Event participation',
        sourceTypes: ['Person', 'Organization'],
        targetTypes: ['Event'],
        cardinality: 'many-to-many'
      }
    ],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'system'
    }
  };
  
  /**
   * Get current ontology for user
   */
  async getOntology(userId: string): Promise<Ontology> {
    const cacheKey = `ontology:${userId}`;
    const cached = await pipeline.getCachedGraphData(userId, cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const session = await getSession();
    
    try {
      // Check if user has custom ontology
      const result = await session.run(
        `
        MATCH (u:User {id: $userId})-[:HAS_ONTOLOGY]->(o:Ontology)
        RETURN o
        ORDER BY o.updatedAt DESC
        LIMIT 1
        `,
        { userId }
      );
      
      if (result.records.length > 0) {
        const ontology = result.records[0].get('o').properties;
        const parsed = JSON.parse(ontology.data);
        await pipeline.cacheGraphData(userId, cacheKey, parsed, 7200);
        return parsed;
      }
      
      // Return default ontology
      await pipeline.cacheGraphData(userId, cacheKey, this.defaultOntology, 7200);
      return this.defaultOntology;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Save custom ontology for user
   */
  async saveOntology(userId: string, ontology: Ontology): Promise<void> {
    const session = await getSession();
    
    try {
      ontology.metadata.updatedAt = new Date().toISOString();
      
      await session.run(
        `
        MATCH (u:User {id: $userId})
        MERGE (u)-[:HAS_ONTOLOGY]->(o:Ontology {userId: $userId})
        SET o.data = $ontologyData,
            o.version = $version,
            o.updatedAt = $updatedAt
        `,
        {
          userId,
          ontologyData: JSON.stringify(ontology),
          version: ontology.version,
          updatedAt: ontology.metadata.updatedAt
        }
      );
      
      // Clear cache
      const cacheKey = `ontology:${userId}`;
      await pipeline.getCachedGraphData(userId, cacheKey); // This will be replaced next time
    } finally {
      await session.close();
    }
  }
  
  /**
   * Add new entity type using LLM assistance
   */
  async addEntityType(
    userId: string,
    description: string
  ): Promise<EntityTypeDefinition> {
    console.log(`Adding entity type: ${description}`);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an ontology design expert. Create a new entity type definition based on the user's description.
          
          Return JSON with this structure:
          {
            "name": "EntityTypeName",
            "description": "Clear description",
            "properties": [
              {
                "name": "propertyName",
                "type": "string|number|boolean|date|array|object",
                "required": true|false,
                "description": "Property description"
              }
            ],
            "color": "#HEX_COLOR",
            "icon": "emoji",
            "aliases": ["alternative names"]
          }`
        },
        {
          role: 'user',
          content: description
        }
      ],
      response_format: { type: 'json_object' }
    });
    
    const entityType = JSON.parse(response.choices[0].message.content || '{}');
    
    // Add to ontology
    const ontology = await this.getOntology(userId);
    ontology.entityTypes.push(entityType);
    await this.saveOntology(userId, ontology);
    
    return entityType;
  }
  
  /**
   * Add new relationship type using LLM assistance
   */
  async addRelationshipType(
    userId: string,
    description: string,
    sourceType?: string,
    targetType?: string
  ): Promise<RelationshipTypeDefinition> {
    console.log(`Adding relationship type: ${description}`);
    
    const ontology = await this.getOntology(userId);
    const entityTypes = ontology.entityTypes.map(e => e.name).join(', ');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an ontology design expert. Create a new relationship type definition.
          
          Available entity types: ${entityTypes}
          
          Return JSON with this structure:
          {
            "name": "RELATIONSHIP_NAME",
            "description": "Clear description",
            "sourceTypes": ["EntityType1", "EntityType2"],
            "targetTypes": ["EntityType3"],
            "bidirectional": true|false,
            "cardinality": "one-to-one|one-to-many|many-to-many",
            "properties": []
          }`
        },
        {
          role: 'user',
          content: `Description: ${description}\n${sourceType ? `Source: ${sourceType}\n` : ''}${targetType ? `Target: ${targetType}` : ''}`
        }
      ],
      response_format: { type: 'json_object' }
    });
    
    const relationshipType = JSON.parse(response.choices[0].message.content || '{}');
    
    // Add to ontology
    ontology.relationshipTypes.push(relationshipType);
    await this.saveOntology(userId, ontology);
    
    return relationshipType;
  }
  
  /**
   * Modify existing entity type using LLM
   */
  async modifyEntityType(
    userId: string,
    entityTypeName: string,
    modification: string
  ): Promise<EntityTypeDefinition> {
    const ontology = await this.getOntology(userId);
    const entityType = ontology.entityTypes.find(e => e.name === entityTypeName);
    
    if (!entityType) {
      throw new Error(`Entity type ${entityTypeName} not found`);
    }
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an ontology design expert. Modify the entity type definition based on the request.
          Return the complete modified entity type definition as JSON.`
        },
        {
          role: 'user',
          content: `Current entity type:\n${JSON.stringify(entityType, null, 2)}\n\nModification request: ${modification}`
        }
      ],
      response_format: { type: 'json_object' }
    });
    
    const modifiedType = JSON.parse(response.choices[0].message.content || '{}');
    
    // Update in ontology
    const index = ontology.entityTypes.findIndex(e => e.name === entityTypeName);
    ontology.entityTypes[index] = modifiedType;
    await this.saveOntology(userId, ontology);
    
    return modifiedType;
  }
  
  /**
   * Suggest entity type for given text using LLM
   */
  async suggestEntityType(text: string, context?: string): Promise<string> {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an entity classification expert. Given text, suggest the most appropriate entity type.
          
          Common types: Person, Organization, Concept, Location, Event, Technology, Product, Document
          
          Return only the entity type name, nothing else.`
        },
        {
          role: 'user',
          content: `Text: ${text}\n${context ? `Context: ${context}` : ''}`
        }
      ]
    });
    
    return response.choices[0].message.content?.trim() || 'Concept';
  }
  
  /**
   * Validate entity against ontology
   */
  async validateEntity(userId: string, entity: any): Promise<{
    valid: boolean;
    errors: string[];
    suggestions?: string[];
  }> {
    const ontology = await this.getOntology(userId);
    const entityType = ontology.entityTypes.find(e => e.name === entity.type);
    
    if (!entityType) {
      return {
        valid: false,
        errors: [`Entity type '${entity.type}' not defined in ontology`],
        suggestions: ontology.entityTypes.map(e => e.name)
      };
    }
    
    const errors: string[] = [];
    
    // Check required properties
    for (const prop of entityType.properties) {
      if (prop.required && !(prop.name in entity.properties)) {
        errors.push(`Missing required property: ${prop.name}`);
      }
      
      // Type validation
      if (prop.name in entity.properties) {
        const value = entity.properties[prop.name];
        const actualType = typeof value;
        
        if (prop.type === 'date' && !(value instanceof Date) && isNaN(Date.parse(value))) {
          errors.push(`Invalid date format for property: ${prop.name}`);
        } else if (prop.type === 'array' && !Array.isArray(value)) {
          errors.push(`Property ${prop.name} should be an array`);
        } else if (prop.type !== 'object' && prop.type !== 'array' && actualType !== prop.type) {
          errors.push(`Property ${prop.name} should be ${prop.type}, got ${actualType}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Get visual ontology representation
   */
  async getVisualOntology(userId: string): Promise<{
    nodes: any[];
    edges: any[];
  }> {
    const ontology = await this.getOntology(userId);
    
    const nodes = ontology.entityTypes.map(et => ({
      id: et.name,
      label: et.name,
      description: et.description,
      color: et.color,
      icon: et.icon,
      properties: et.properties.length
    }));
    
    const edges: any[] = [];
    
    ontology.relationshipTypes.forEach((rt, idx) => {
      rt.sourceTypes.forEach(source => {
        rt.targetTypes.forEach(target => {
          edges.push({
            id: `${source}-${rt.name}-${target}-${idx}`,
            source: source === '*' ? 'Any' : source,
            target: target === '*' ? 'Any' : target,
            label: rt.name,
            description: rt.description,
            bidirectional: rt.bidirectional || false
          });
        });
      });
    });
    
    return { nodes, edges };
  }
  
  /**
   * Reset to default ontology
   */
  async resetToDefault(userId: string): Promise<Ontology> {
    await this.saveOntology(userId, this.defaultOntology);
    return this.defaultOntology;
  }
}

export const ontologyManager = new OntologyManager();

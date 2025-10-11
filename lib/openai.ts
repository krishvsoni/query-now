import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

export async function extractEntitiesAndRelationships(text: string) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert knowledge graph extractor. Extract entities and relationships from the text.
          
          Return a JSON object with this structure:
          {
            "entities": [
              {
                "id": "unique_id",
                "name": "Entity Name",
                "type": "PERSON|ORGANIZATION|CONCEPT|LOCATION|EVENT|etc",
                "description": "Brief description",
                "properties": {"key": "value"}
              }
            ],
            "relationships": [
              {
                "source": "source_entity_id",
                "target": "target_entity_id", 
                "type": "WORKS_FOR|LOCATED_IN|PART_OF|etc",
                "properties": {"strength": 0.8, "context": "explanation"}
              }
            ]
          }
          
          Focus on the most important entities and meaningful relationships.`
        },
        {
          role: 'user',
          content: text
        }
      ],
      response_format: { type: 'json_object' }
    });
    
    return JSON.parse(response.choices[0].message.content || '{"entities":[],"relationships":[]}');
  } catch (error) {
    console.error('Error extracting entities:', error);
    throw error;
  }
}

export async function generateStreamingResponse(
  query: string,
  context: string[],
  conversationHistory: Array<{role: 'user' | 'assistant' | 'system', content: string}> = []
) {
  try {
    const messages = [
      {
        role: 'system' as const,
        content: `You are a helpful AI assistant that answers questions based on the provided document context. 
        Use the context to provide accurate and helpful responses. If the context doesn't contain relevant information, 
        say so clearly. Always cite which document or source your information comes from when possible.`
      },
      ...conversationHistory,
      {
        role: 'user' as const,
        content: `Context:\n${context.join('\n\n')}\n\nQuestion: ${query}`
      }
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      stream: true,
      max_tokens: 1000
    });

    return response;
  } catch (error) {
    console.error('Error generating response:', error);
    throw error;
  }
}

export async function summarizeDocument(text: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a document summarizer. Provide a concise summary of the main points in the document.'
        },
        {
          role: 'user',
          content: `Please summarize this document:\n\n${text}`
        }
      ],
      max_tokens: 500
    });
    
    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('Error summarizing document:', error);
    throw error;
  }
}

export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    
    if (start >= text.length) break;
  }
  
  return chunks;
}
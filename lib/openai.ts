import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
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
                "name": "Entity Name",
                "type": "PERSON|ORGANIZATION|CONCEPT|LOCATION|EVENT|DOCUMENT|AGREEMENT|DATE|etc",
                "description": "Brief description",
                "properties": {"key": "value"}
              }
            ],
            "relationships": [
              {
                "from": "source_entity_name",
                "to": "target_entity_name", 
                "type": "WORKS_FOR|OWNS|FOUNDED|SIGNED|GRANTS|MANAGES|etc",
                "properties": {"context": "explanation"}
              }
            ]
          }
          
          Focus on the most important entities (people, organizations, concepts, agreements, dates) and meaningful relationships.
          Make sure entity names are consistent between entities and relationships.`
        },
        {
          role: 'user',
          content: text
        }
      ],
      response_format: { type: 'json_object' }
    });
    
    const result = JSON.parse(response.choices[0].message.content || '{"entities":[],"relationships":[]}');
    console.log(`[OpenAI] Extracted ${result.entities?.length || 0} entities and ${result.relationships?.length || 0} relationships`);
    
    return result;
  } catch (error) {
    console.error('[OpenAI] Error extracting entities:', error);
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
  const MAX_CHUNKS = 10000;
  const VERY_LARGE_TEXT = 50 * 1024 * 1024;
  const TARGET_SAMPLE_SIZE = 20 * 1024 * 1024;
  const textLength = text.length;
  console.log(`Processing text: ${(textLength / 1024 / 1024).toFixed(2)} MB (${textLength.toLocaleString()} characters)`);
  if (textLength > VERY_LARGE_TEXT) {
    console.warn(`Very large document detected (${(textLength / 1024 / 1024).toFixed(2)} MB). Using intelligent sampling...`);
    const sampleSize = Math.floor(TARGET_SAMPLE_SIZE / 3);
    const beginning = text.slice(0, sampleSize);
    const end = text.slice(-sampleSize);
    const middleSamples: string[] = [];
    const numMiddleSamples = 5;
    const middleStart = sampleSize;
    const middleEnd = textLength - sampleSize;
    const middleRange = middleEnd - middleStart;
    const sampleInterval = Math.floor(middleRange / (numMiddleSamples + 1));
    const middleSampleSize = Math.floor(sampleSize / numMiddleSamples);
    for (let i = 1; i <= numMiddleSamples; i++) {
      const pos = middleStart + (sampleInterval * i);
      middleSamples.push(text.slice(pos, pos + middleSampleSize));
    }
    text = beginning + '\n\n[...middle content sampled...]\n\n' + middleSamples.join('\n\n[...]\n\n') + '\n\n[...]\n\n' + end;
    console.log(`Sampled document reduced to ${(text.length / 1024 / 1024).toFixed(2)} MB for processing`);
  }
  const estimatedChunks = Math.ceil(text.length / (chunkSize - overlap));
  if (estimatedChunks > MAX_CHUNKS) {
    const newChunkSize = Math.ceil(text.length / MAX_CHUNKS) + overlap;
    console.warn(`Estimated ${estimatedChunks.toLocaleString()} chunks exceeds maximum ${MAX_CHUNKS.toLocaleString()}`);
    console.warn(`Adjusting chunk size from ${chunkSize} to ${newChunkSize} characters`);
    chunkSize = newChunkSize;
  }
  let start = 0;
  let chunkCount = 0;
  while (start < text.length && chunkCount < MAX_CHUNKS) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
      chunkCount++;
    }
    start = end - overlap;
    if (start >= text.length || (end >= text.length && start >= end - overlap)) {
      break;
    }
    if (chunkCount % 1000 === 0) {
      const progress = ((start / text.length) * 100).toFixed(1);
      console.log(`Chunking progress: ${chunkCount.toLocaleString()} chunks created (${progress}%)`);
    }
  }
  const avgChunkSize = chunks.length > 0 ? Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length) : 0;
  console.log(`Created ${chunks.length.toLocaleString()} chunks | Avg size: ${avgChunkSize} chars | Coverage: ${((chunks.length * avgChunkSize / textLength) * 100).toFixed(1)}%`);
  return chunks;
}

import { Pinecone } from '@pinecone-database/pinecone';

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
});

const INDEX_NAME = 'documents';

export async function initPinecone() {
  try {
    const indexConfig = process.env.PINECONE_HOST 
      ? pinecone.index(INDEX_NAME, process.env.PINECONE_HOST)
      : pinecone.index(INDEX_NAME);
    console.log(`Pinecone index "${INDEX_NAME}" initialized${process.env.PINECONE_HOST ? ' with custom host' : ''}`);
    return indexConfig;
  } catch (error) {
    console.error('Error initializing Pinecone:', error);
    throw error;
  }
}

export async function storeEmbedding(
  id: string,
  embedding: number[],
  metadata: {
    userId: string;
    documentId: string;
    fileName: string;
    content: string;
    chunk?: number;
    [key: string]: any;
  }
) {
  try {
    const index = await initPinecone();
    const cleanMetadata = {
      userId: metadata.userId,
      documentId: metadata.documentId,
      fileName: metadata.fileName,
      content: metadata.content.substring(0, 1000),
      chunkIndex: metadata.chunkIndex || metadata.chunk || 0,
      timestamp: metadata.timestamp || new Date().toISOString()
    };
    await index.upsert([{
      id,
      values: embedding,
      metadata: cleanMetadata
    }]);
    return true;
  } catch (error) {
    console.error('Error storing embedding:', error);
    throw error;
  }
}

export async function searchSimilar(
  embedding: number[],
  userId: string,
  topK: number = 5,
  documentIds?: string[]
) {
  try {
    const index = await initPinecone();
    const filter: any = { userId };
    if (documentIds && documentIds.length > 0) {
      filter.documentId = { $in: documentIds };
    }
    console.log(`Searching Pinecone: userId=${userId}, topK=${topK}, documentIds=${documentIds?.join(',') || 'all'}`);
    console.log(`Filter:`, JSON.stringify(filter));
    const results = await index.query({
      vector: embedding,
      topK,
      filter,
      includeMetadata: true
    });
    console.log(`Found ${results.matches?.length || 0} matches`);
    if (results.matches && results.matches.length > 0) {
      console.log(`Top match score: ${results.matches[0].score}, metadata:`, results.matches[0].metadata);
    }
    return results.matches || [];
  } catch (error) {
    console.error('Error searching similar embeddings:', error);
    throw error;
  }
}

export async function deleteUserEmbeddings(userId: string, documentId?: string) {
  try {
    const index = await initPinecone();
    const filter: any = { userId };
    if (documentId) {
      filter.documentId = documentId;
    }
    await index.deleteMany(filter);
    return true;
  } catch (error) {
    console.error('Error deleting embeddings:', error);
    throw error;
  }
}

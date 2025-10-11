import { Pinecone } from '@pinecone-database/pinecone';

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
});

const INDEX_NAME = 'documents';

export async function initPinecone() {
  try {
    const index = pinecone.index(INDEX_NAME);
    return index;
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
  }
) {
  try {
    const index = await initPinecone();
    
    await index.upsert([{
      id,
      values: embedding,
      metadata
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
    
    const results = await index.query({
      vector: embedding,
      topK,
      filter,
      includeMetadata: true
    });
    
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
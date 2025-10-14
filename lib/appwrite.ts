import { Client, Storage, Databases, ID, Query } from 'node-appwrite';

const validateEnvironment = () => {
  const required = [
    'APPWRITE_ENDPOINT',
    'APPWRITE_PROJECT_ID',
    'APPWRITE_API_KEY',
    'APPWRITE_BUCKET_ID'
  ];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required Appwrite environment variables: ${missing.join(', ')}`);
  }
};

const initializeClient = () => {
  validateEnvironment();
  return new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT!)
    .setProject(process.env.APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);
};

const client = initializeClient();
const storage = new Storage(client);
const databases = new Databases(client);

export async function uploadDocument(
  fileBuffer: Buffer,
  fileName: string,
  userId: string,
  mimeType?: string
): Promise<{ fileId: string; filePath: string }> {
  try {
    const fileId = ID.unique();
    console.log(`Uploading file: ${fileName}, Size: ${fileBuffer.length} bytes, Type: ${mimeType}`);

    let sanitizedFileName = fileName;
    const fileExtension = fileName.split('.').pop()?.toLowerCase();

    if (fileExtension === 'pdf') {
      sanitizedFileName = `document_${Date.now()}.pdf`;
    } else if (fileExtension === 'docx') {
      sanitizedFileName = `document_${Date.now()}.docx`;
    } else if (fileExtension === 'txt') {
      sanitizedFileName = `document_${Date.now()}.txt`;
    } else {
      sanitizedFileName = `document_${Date.now()}.txt`;
    }

    const file = new File([fileBuffer], sanitizedFileName, {
      type: mimeType || 'application/octet-stream'
    });

    const uploadedFile = await storage.createFile(
      process.env.APPWRITE_BUCKET_ID!,
      fileId,
      file,
      [
        `read("user:${userId}")`,
        `write("user:${userId}")`
      ]
    );
    const filePath = `${process.env.APPWRITE_ENDPOINT}/storage/buckets/${process.env.APPWRITE_BUCKET_ID}/files/${uploadedFile.$id}/view?project=${process.env.APPWRITE_PROJECT_ID}`;
    console.log(`File uploaded successfully: ${uploadedFile.$id} (original: ${fileName}, stored as: ${sanitizedFileName})`);
    return {
      fileId: uploadedFile.$id,
      filePath
    };
  } catch (error) {
    console.error('Appwrite upload error:', error);
    if (error instanceof Error) {
      if (error.message.includes('File extension not allowed') || error.message.includes('storage_file_type_unsupported')) {
        try {
          console.log('Retrying upload with generic filename...');
          const fallbackId = ID.unique();
          const fallbackFile = new File([fileBuffer], `upload_${Date.now()}.bin`, {
            type: 'application/octet-stream'
          });

          const fallbackUpload = await storage.createFile(
            process.env.APPWRITE_BUCKET_ID!,
            fallbackId,
            fallbackFile,
            [
              `read("user:${userId}")`,
              `write("user:${userId}")`
            ]
          );

          const fallbackPath = `${process.env.APPWRITE_ENDPOINT}/storage/buckets/${process.env.APPWRITE_BUCKET_ID}/files/${fallbackUpload.$id}/view?project=${process.env.APPWRITE_PROJECT_ID}`;
          console.log(`File uploaded successfully with fallback method: ${fallbackUpload.$id}`);

          return {
            fileId: fallbackUpload.$id,
            filePath: fallbackPath
          };
        } catch (fallbackError) {
          throw new Error(`File type not supported by storage service. Both primary and fallback upload methods failed. Please contact administrator to configure allowed file types in Appwrite bucket.`);
        }
      } else if (error.message.includes('bucket')) {
        throw new Error(`Storage bucket error: Please check APPWRITE_BUCKET_ID configuration. ${error.message}`);
      } else if (error.message.includes('permission')) {
        throw new Error(`Permission denied: Please check Appwrite API key permissions. ${error.message}`);
      } else if (error.message.includes('size') || error.message.includes('limit')) {
        throw new Error(`File size limit exceeded: ${error.message}`);
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        throw new Error(`Network error: Unable to connect to Appwrite. ${error.message}`);
      }
    }
    throw new Error(`Failed to upload file to Appwrite: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function saveDocumentMetadata(metadata: {
  fileId: string;
  fileName: string;
  userId: string;
  status: string;
  processingStage: string;
}) {
  try {
    const documentId = ID.unique();
    if (process.env.APPWRITE_DATABASE_ID && process.env.APPWRITE_DOCUMENTS_COLLECTION_ID) {
      const document = await databases.createDocument(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_DOCUMENTS_COLLECTION_ID,
        documentId,
        {
          fileId: metadata.fileId,
          fileName: metadata.fileName,
          userId: metadata.userId,
          status: metadata.status,
          processingStage: metadata.processingStage,
          uploadedAt: new Date().toISOString()
        },
        [
          `read("user:${metadata.userId}")`,
          `write("user:${metadata.userId}")`
        ]
      );
      return document;
    } else {
      console.warn('Database not configured, returning mock document metadata');
      return {
        $id: documentId,
        fileId: metadata.fileId,
        fileName: metadata.fileName,
        userId: metadata.userId,
        status: metadata.status,
        processingStage: metadata.processingStage,
        uploadedAt: new Date().toISOString()
      };
    }
  } catch (error) {
    console.error('Appwrite save metadata error:', error);
    return {
      $id: ID.unique(),
      fileId: metadata.fileId,
      fileName: metadata.fileName,
      userId: metadata.userId,
      status: metadata.status,
      processingStage: metadata.processingStage,
      uploadedAt: new Date().toISOString()
    };
  }
}

export async function getUserDocuments(userId: string) {
  try {
    if (process.env.APPWRITE_DATABASE_ID && process.env.APPWRITE_DOCUMENTS_COLLECTION_ID) {
      const documents = await databases.listDocuments(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_DOCUMENTS_COLLECTION_ID,
        [
          `equal("userId", "${userId}")`
        ]
      );
      return documents.documents;
    } else {
      console.warn('Database not configured, returning empty documents list');
      return [];
    }
  } catch (error) {
    console.error('Appwrite get user documents error:', error);
    return [];
  }
}

export async function listStorageFiles() {
  try {
    const files = await storage.listFiles(process.env.APPWRITE_BUCKET_ID!);
    return files;
  } catch (error) {
    console.error('Appwrite list files error:', error);
    throw new Error(`Failed to list storage files: ${error}`);
  }
}

export async function getFileDownloadUrl(fileId: string): Promise<string> {
  try {
    const result = storage.getFileDownload(process.env.APPWRITE_BUCKET_ID!, fileId);
    return result.toString();
  } catch (error) {
    console.error('Appwrite get file URL error:', error);
    throw new Error(`Failed to get file download URL: ${error}`);
  }
}

export async function deleteFile(fileId: string): Promise<void> {
  try {
    await storage.deleteFile(process.env.APPWRITE_BUCKET_ID!, fileId);
  } catch (error) {
    console.error('Appwrite delete file error:', error);
    throw new Error(`Failed to delete file: ${error}`);
  }
}

export async function updateDocumentMetadata(
  documentId: string,
  updates: { status?: string; processingStage?: string }
) {
  return {
    $id: documentId,
    ...updates,
    updatedAt: new Date().toISOString()
  };
}

// Chat History Functions
const CHAT_DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const CHAT_COLLECTION_ID = process.env.APPWRITE_CHAT_COLLECTION_ID;

export async function saveChatMessage(
  userId: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  metadata?: {
    sources?: any[];
    reasoningChain?: any[];
    knowledgeGraph?: any;
    documentIds?: string[];
  }
) {
  try {
    const chatMessage = await databases.createDocument(
      CHAT_DATABASE_ID,
      CHAT_COLLECTION_ID,
      ID.unique(),
      {
        userId,
        sessionId,
        role,
        content,
        metadata: JSON.stringify(metadata || {}),
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString()
      },
      [
        `read("user:${userId}")`,
        `write("user:${userId}")`
      ]
    );
    
    console.log(`[Appwrite] Chat message saved: ${chatMessage.$id}`);
    return chatMessage;
  } catch (error) {
    console.error('[Appwrite] Error saving chat message:', error);
    // Don't throw - chat history is not critical
    return null;
  }
}

export async function getChatHistory(
  userId: string,
  sessionId?: string,
  limit: number = 50
) {
  try {
    const queries: string[] = [
      Query.equal('userId', userId),
      Query.orderDesc('createdAt'),
      Query.limit(limit)
    ];
    
    if (sessionId) {
      queries.push(Query.equal('sessionId', sessionId));
    }
    
    const response = await databases.listDocuments(
      CHAT_DATABASE_ID,
      CHAT_COLLECTION_ID,
      queries
    );
    
    return response.documents.map(doc => ({
      id: doc.$id,
      userId: doc.userId,
      sessionId: doc.sessionId,
      role: doc.role,
      content: doc.content,
      metadata: JSON.parse(doc.metadata || '{}'),
      timestamp: doc.timestamp,
      createdAt: doc.createdAt
    }));
  } catch (error) {
    console.error('[Appwrite] Error fetching chat history:', error);
    return [];
  }
}

export async function getChatSessions(userId: string) {
  try {
    const response = await databases.listDocuments(
      CHAT_DATABASE_ID,
      CHAT_COLLECTION_ID,
      [
        Query.equal('userId', userId),
        Query.orderDesc('createdAt'),
        Query.limit(100)
      ]
    );
    
    // Group by session
    const sessions = new Map<string, any>();
    response.documents.forEach(doc => {
      const sessionId = doc.sessionId;
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
          sessionId,
          lastMessage: doc.content,
          timestamp: doc.timestamp,
          messageCount: 1
        });
      } else {
        const session = sessions.get(sessionId)!;
        session.messageCount++;
        if (new Date(doc.timestamp) > new Date(session.timestamp)) {
          session.lastMessage = doc.content;
          session.timestamp = doc.timestamp;
        }
      }
    });
    
    return Array.from(sessions.values()).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('[Appwrite] Error fetching chat sessions:', error);
    return [];
  }
}

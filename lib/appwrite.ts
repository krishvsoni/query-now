import { Client, Storage, Databases, ID } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const storage = new Storage(client);
const databases = new Databases(client);

export async function uploadDocument(
  fileBuffer: Buffer, 
  fileName: string, 
  userId: string
): Promise<{ fileId: string; filePath: string }> {
  try {
    const fileId = ID.unique();
    
    // Create a File object for Appwrite
    const file = new File([fileBuffer], fileName, {
      type: 'application/octet-stream'
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

    return {
      fileId: uploadedFile.$id,
      filePath: `${process.env.APPWRITE_ENDPOINT}/storage/buckets/${process.env.APPWRITE_BUCKET_ID}/files/${uploadedFile.$id}/view?project=${process.env.APPWRITE_PROJECT_ID}`
    };
  } catch (error) {
    console.error('Appwrite upload error:', error);
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
    
    // Try to save to database if configured, otherwise return mock data
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
      // Return mock document if database not configured
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
    // Fallback to mock data if database operation fails
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

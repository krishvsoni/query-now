import { Client, Storage, Databases, ID, Permission, Role } from 'node-appwrite';
import { Readable } from 'stream';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

export const storage = new Storage(client);

export const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;

// Initialize bucket if it doesn't exist
export async function initializeStorageBucket() {
  try {
    await storage.getBucket(BUCKET_ID);
    console.log('Storage bucket already exists');
  } catch (error) {
    try {
      await storage.createBucket(
        BUCKET_ID,
        'Documents Storage',
        [
          Permission.read(Role.any()),
          Permission.write(Role.any()),
          Permission.create(Role.any()),
          Permission.update(Role.any()),
          Permission.delete(Role.any())
        ],
        false, // Not file security
        true,  // Enabled
        undefined, // No max file size
        ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'xlsx'] // Allowed file extensions
      );
      console.log('Created storage bucket successfully');
    } catch (createError) {
      console.error('Error creating storage bucket:', createError);
      throw createError;
    }
  }
}

export async function uploadDocument(file: Buffer, fileName: string, userId: string) {
  try {
    // Ensure bucket exists
    await initializeStorageBucket();

    // For Node.js environment, we need to handle the buffer differently
    const tempFile = {
      name: fileName,
      type: 'application/octet-stream',
      size: file.length,
      stream: () => Readable.from(file)
    };
    
    // Upload file to Appwrite storage
    const fileResponse = await storage.createFile(
      BUCKET_ID,
      ID.unique(),
      tempFile as any
    );

    return {
      fileId: fileResponse.$id,
      fileName,
      userId,
      uploadedAt: new Date().toISOString(),
      filePath: `${BUCKET_ID}/${fileResponse.$id}`
    };
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  }
}

export async function listStorageFiles() {
  try {
    const response = await storage.listFiles(BUCKET_ID);
    return response.files;
  } catch (error) {
    console.error('Error listing storage files:', error);
    throw error;
  }
}

export async function getDocumentContent(fileId: string): Promise<Buffer> {
  try {
    const file = await storage.getFileDownload(BUCKET_ID, fileId);
    return Buffer.from(file);
  } catch (error) {
    console.error('Error downloading document:', error);
    throw error;
  }
}

export async function deleteDocument(fileId: string) {
  try {
    await storage.deleteFile(BUCKET_ID, fileId);
    return { success: true, fileId };
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
}

export async function getFileInfo(fileId: string) {
  try {
    const file = await storage.getFile(BUCKET_ID, fileId);
    return file;
  } catch (error) {
    console.error('Error getting file info:', error);
    throw error;
  }
}

// Database operations for user documents
export async function saveDocumentMetadata(documentData: {
  fileId: string;
  fileName: string;
  userId: string;
  status: string;
  processingStage: string;
}) {
  try {
    const response = await databases.createDocument(
      DATABASE_ID,
      DOCUMENTS_COLLECTION,
      ID.unique(),
      {
        ...documentData,
        uploadedAt: new Date().toISOString()
      }
    );
    return response;
  } catch (error) {
    console.error('Error saving document metadata:', error);
    throw error;
  }
}

export async function getUserDocuments(userId: string) {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      DOCUMENTS_COLLECTION,
      [
        // Add query filters if needed
      ]
    );
    return response.documents.filter(doc => doc.userId === userId);
  } catch (error) {
    console.error('Error getting user documents:', error);
    throw error;
  }
}

export async function updateDocumentStatus(documentId: string, status: string, processingStage?: string) {
  try {
    const updateData: any = { status };
    if (processingStage) {
      updateData.processingStage = processingStage;
    }
    
    const response = await databases.updateDocument(
      DATABASE_ID,
      DOCUMENTS_COLLECTION,
      documentId,
      updateData
    );
    return response;
  } catch (error) {
    console.error('Error updating document status:', error);
    throw error;
  }
}
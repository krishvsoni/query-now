import { Client, Storage, ID } from 'node-appwrite';
import { Readable } from 'stream';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

export const storage = new Storage(client);

export const BUCKET_ID = process.env.APPWRITE_BUCKET_ID || '68ea295d00045dccdc3d';

export async function uploadDocument(file: Buffer, fileName: string, userId: string) {
  try {
    // Check if storage bucket exists first
    try {
      await storage.getBucket(BUCKET_ID);
    } catch (bucketError) {
      throw new Error(`Storage bucket '${BUCKET_ID}' not found. Please create it in Appwrite console.`);
    }

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
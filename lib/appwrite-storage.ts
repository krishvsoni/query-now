import { Client, Storage, ID } from 'node-appwrite';
import { Readable } from 'stream';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

export const storage = new Storage(client);
const BUCKET_ID = process.env.APPWRITE_PROJECT_ID;

export async function uploadFileToStorage(file: Buffer, fileName: string) {
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
      bucketId: BUCKET_ID,
      filePath: `${BUCKET_ID}/${fileResponse.$id}`,
      uploadedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error uploading file to storage:', error);
    throw error;
  }
}

export async function listFilesInStorage() {
  try {
    const response = await storage.listFiles(BUCKET_ID);
    return response.files;
  } catch (error) {
    console.error('Error listing files in storage:', error);
    throw error;
  }
}

export async function getFileFromStorage(fileId: string): Promise<Buffer> {
  try {
    const file = await storage.getFileDownload(BUCKET_ID, fileId);
    return Buffer.from(file);
  } catch (error) {
    console.error('Error downloading file from storage:', error);
    throw error;
  }
}

export async function getFilePreview(fileId: string, width?: number, height?: number) {
  try {
    const preview = await storage.getFilePreview(BUCKET_ID, fileId, width, height);
    return preview;
  } catch (error) {
    console.error('Error getting file preview:', error);
    throw error;
  }
}

export async function getFileView(fileId: string) {
  try {
    const view = await storage.getFileView(BUCKET_ID, fileId);
    return view;
  } catch (error) {
    console.error('Error getting file view:', error);
    throw error;
  }
}

export async function deleteFileFromStorage(fileId: string) {
  try {
    await storage.deleteFile(BUCKET_ID, fileId);
    return { success: true, fileId };
  } catch (error) {
    console.error('Error deleting file from storage:', error);
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
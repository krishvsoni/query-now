import { Client, Storage, Databases, ID } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

export const storage = new Storage(client);
export const databases = new Databases(client);

export const BUCKET_ID = 'documents';
export const DATABASE_ID = 'main';
export const DOCUMENTS_COLLECTION = 'user_documents';

export async function uploadDocument(file: Buffer, fileName: string, userId: string) {
  try {
    // Upload file to Appwrite storage
    const fileResponse = await storage.createFile(
      BUCKET_ID,
      ID.unique(),
      file,
      undefined,
      ['read("user:' + userId + '")']
    );

    // Store document metadata in database
    const document = await databases.createDocument(
      DATABASE_ID,
      DOCUMENTS_COLLECTION,
      ID.unique(),
      {
        fileId: fileResponse.$id,
        fileName,
        userId,
        uploadedAt: new Date().toISOString(),
        status: 'uploaded',
        processingStage: 'pending'
      }
    );

    return {
      documentId: document.$id,
      fileId: fileResponse.$id,
      fileName,
      filePath: `${BUCKET_ID}/${fileResponse.$id}`
    };
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  }
}

export async function getUserDocuments(userId: string) {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      DOCUMENTS_COLLECTION,
      [
        `userId=${userId}`
      ]
    );
    return response.documents;
  } catch (error) {
    console.error('Error fetching user documents:', error);
    throw error;
  }
}

export async function getDocumentContent(fileId: string): Promise<Buffer> {
  try {
    const file = await storage.getFileDownload(BUCKET_ID, fileId);
    return file as Buffer;
  } catch (error) {
    console.error('Error downloading document:', error);
    throw error;
  }
}

export async function updateDocumentStatus(documentId: string, status: string, stage?: string) {
  try {
    const updateData: any = { status };
    if (stage) updateData.processingStage = stage;
    
    await databases.updateDocument(
      DATABASE_ID,
      DOCUMENTS_COLLECTION,
      documentId,
      updateData
    );
  } catch (error) {
    console.error('Error updating document status:', error);
    throw error;
  }
}
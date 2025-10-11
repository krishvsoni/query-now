import { databases, storage, DATABASE_ID, DOCUMENTS_COLLECTION, BUCKET_ID } from '@/lib/appwrite';
import { ID, Permission, Role } from 'node-appwrite';

export async function initializeAppwrite() {
  try {
    // Create database if it doesn't exist
    try {
      await databases.get(DATABASE_ID);
      console.log('Database already exists');
    } catch (error) {
      await databases.create(DATABASE_ID, 'Main Database');
      console.log('Created database');
    }

    // Create documents collection if it doesn't exist
    try {
      await databases.getCollection(DATABASE_ID, DOCUMENTS_COLLECTION);
      console.log('Documents collection already exists');
    } catch (error) {
      await databases.createCollection(
        DATABASE_ID,
        DOCUMENTS_COLLECTION,
        'User Documents',
        [
          Permission.read(Role.any()),
          Permission.write(Role.any()),
          Permission.create(Role.any()),
          Permission.update(Role.any()),
          Permission.delete(Role.any())
        ]
      );

      // Create attributes
      await databases.createStringAttribute(DATABASE_ID, DOCUMENTS_COLLECTION, 'fileId', 255, true);
      await databases.createStringAttribute(DATABASE_ID, DOCUMENTS_COLLECTION, 'fileName', 255, true);
      await databases.createStringAttribute(DATABASE_ID, DOCUMENTS_COLLECTION, 'userId', 255, true);
      await databases.createStringAttribute(DATABASE_ID, DOCUMENTS_COLLECTION, 'status', 50, true);
      await databases.createStringAttribute(DATABASE_ID, DOCUMENTS_COLLECTION, 'processingStage', 50, true);
      await databases.createDatetimeAttribute(DATABASE_ID, DOCUMENTS_COLLECTION, 'uploadedAt', true);

      console.log('Created documents collection with attributes');
    }

    // Create storage bucket if it doesn't exist
    try {
      await storage.getBucket(BUCKET_ID);
      console.log('Storage bucket already exists');
    } catch (error) {
      await storage.createBucket(
        BUCKET_ID,
        'Documents Bucket',
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
        ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt', 'md'] // Allowed file extensions
      );
      console.log('Created storage bucket');
    }

    console.log('Appwrite initialization completed');
    return true;
  } catch (error) {
    console.error('Error initializing Appwrite:', error);
    return false;
  }
}
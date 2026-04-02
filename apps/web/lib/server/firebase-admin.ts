import "server-only";

import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from "@zootopia/shared-config";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getAdminProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    FIREBASE_PROJECT_ID
  );
}

function getAdminClientEmail() {
  return process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
}

function getAdminPrivateKey() {
  return (
    process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY
  )?.replace(/\\n/g, "\n");
}

function hasManagedFirebaseRuntime() {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.FIREBASE_CONFIG ||
      process.env.K_SERVICE ||
      process.env.FUNCTION_TARGET,
  );
}

export function hasFirebaseAdminRuntime() {
  return Boolean(
    (getAdminClientEmail() && getAdminPrivateKey()) || hasManagedFirebaseRuntime(),
  );
}

export function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const projectId = getAdminProjectId();
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;

  const clientEmail = getAdminClientEmail();
  const privateKey = getAdminPrivateKey();

  if (clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
      storageBucket,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket,
  });
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminFirestore() {
  return getFirestore(getFirebaseAdminApp(), FIRESTORE_DATABASE_ID);
}

export function getFirebaseAdminStorageBucket() {
  return getStorage(getFirebaseAdminApp()).bucket();
}

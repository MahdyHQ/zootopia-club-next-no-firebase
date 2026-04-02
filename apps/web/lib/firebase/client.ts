"use client";

import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";
import { getAuth, inMemoryPersistence, setPersistence, type Auth } from "firebase/auth";

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let authPersistenceReady: Promise<Auth> | null = null;

function readPublicFirebaseEnv(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getFirebaseWebConfig(): FirebaseOptions | null {
  const apiKey = readPublicFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
  const authDomain = readPublicFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
  const projectId = readPublicFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const storageBucket = readPublicFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  const messagingSenderId = readPublicFirebaseEnv(
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  );
  const appId = readPublicFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID);

  if (
    !apiKey ||
    !authDomain ||
    !projectId ||
    !storageBucket ||
    !messagingSenderId ||
    !appId
  ) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

export function isFirebaseWebConfigured() {
  return getFirebaseWebConfig() !== null;
}

export function getFirebaseClientApp() {
  if (cachedApp) {
    return cachedApp;
  }

  const config = getFirebaseWebConfig();
  if (!config) {
    throw new Error("FIREBASE_WEB_CONFIG_MISSING");
  }

  cachedApp = getApps().length > 0 ? getApp() : initializeApp(config);
  return cachedApp;
}

export function getFirebaseClientAuth() {
  if (cachedAuth) {
    return cachedAuth;
  }

  cachedAuth = getAuth(getFirebaseClientApp());
  return cachedAuth;
}

function ensureEphemeralFirebaseClientAuth() {
  if (authPersistenceReady) {
    return authPersistenceReady;
  }

  const auth = getFirebaseClientAuth();
  authPersistenceReady = setPersistence(auth, inMemoryPersistence)
    .then(() => auth)
    .catch((error) => {
      authPersistenceReady = null;
      throw error;
    });

  return authPersistenceReady;
}

export function primeEphemeralFirebaseClientAuth() {
  return ensureEphemeralFirebaseClientAuth();
}

export async function getEphemeralFirebaseClientAuth() {
  return ensureEphemeralFirebaseClientAuth();
}

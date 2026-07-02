import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!raw && !encoded && !serviceAccountPath) {
    throw new Error(
      "Falta la credencial privada de Firebase Admin. Configura FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_BASE64 o FIREBASE_SERVICE_ACCOUNT_PATH."
    );
  }

  const resolvedServiceAccountPath = serviceAccountPath
    ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), serviceAccountPath)
    : "";
  const serviceAccountSource =
    raw ??
    (encoded ? Buffer.from(encoded, "base64").toString("utf8") : fs.readFileSync(resolvedServiceAccountPath, "utf8"));

  const parsedServiceAccount = JSON.parse(serviceAccountSource.trim());
  const serviceAccount = typeof parsedServiceAccount === "string" ? JSON.parse(parsedServiceAccount) : parsedServiceAccount;

  if (typeof serviceAccount.private_key === "string") {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  return serviceAccount;
}

export function getAdminApp() {
  if (getApps().length) {
    return getApps()[0];
  }

  return initializeApp({
    credential: cert(parseServiceAccount())
  });
}

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());

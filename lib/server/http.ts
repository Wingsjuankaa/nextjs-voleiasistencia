import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./firebaseAdmin";
import type { ApiError, Group, Member } from "../../types/domain";

export type AuthedRequest = NextApiRequest & {
  uid: string;
};

function getAllowedEmails() {
  return (process.env.ALLOWED_GOOGLE_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function assertAllowedEmail(email: string | undefined) {
  const allowedEmails = getAllowedEmails();

  if (allowedEmails.length === 0) {
    return;
  }

  if (!email || !allowedEmails.includes(email.toLowerCase())) {
    throw new Error("Esta cuenta de Google no esta autorizada para usar la aplicacion.");
  }
}

export function sendMethodNotAllowed(res: NextApiResponse<ApiError>, methods: string[]) {
  res.setHeader("Allow", methods);
  res.status(405).json({ error: "Metodo no permitido." });
}

export function getStringQuery(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? "";
}

export function requireName(value: unknown, field = "nombre") {
  if (typeof value !== "string" || value.trim().length < 2) {
    throw new Error(`El ${field} debe tener al menos 2 caracteres.`);
  }

  return value.trim();
}

export function requireDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("La fecha debe tener formato YYYY-MM-DD.");
  }

  return value;
}

export async function withAuth(
  req: NextApiRequest,
  res: NextApiResponse,
  handler: (req: AuthedRequest, res: NextApiResponse) => Promise<void>
) {
  try {
    const header = req.headers.authorization ?? "";
    const match = header.match(/^Bearer (.+)$/);

    if (!match) {
      res.status(401).json({ error: "Debes iniciar sesion." });
      return;
    }

    const decodedToken = await adminAuth().verifyIdToken(match[1]);
    assertAllowedEmail(decodedToken.email);

    const authedReq = req as AuthedRequest;
    authedReq.uid = decodedToken.uid;

    await adminDb()
      .collection("users")
      .doc(decodedToken.uid)
      .set(
        {
          email: decodedToken.email ?? null,
          name: decodedToken.name ?? null,
          photoURL: decodedToken.picture ?? null,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

    await handler(authedReq, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ocurrio un error inesperado.";
    const status = message.includes("no esta autorizada") ? 403 : message.includes("debe tener") || message.includes("fecha") ? 400 : 500;
    res.status(status).json({ error: message });
  }
}

export async function assertGroupOwner(groupId: string, uid: string) {
  const groupRef = adminDb().collection("groups").doc(groupId);
  const groupSnap = await groupRef.get();

  if (!groupSnap.exists) {
    throw new Error("Grupo no encontrado.");
  }

  const group = groupSnap.data() as Group;

  if (group.ownerId !== uid) {
    throw new Error("No tienes acceso a este grupo.");
  }

  return { groupRef, group };
}

export function serializeDoc<T extends { id: string }>(doc: FirebaseFirestore.QueryDocumentSnapshot): T {
  const data = doc.data();

  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.().toISOString?.() ?? data.createdAt ?? null,
    updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? data.updatedAt ?? null
  } as unknown as T;
}

export function serializeMember(doc: FirebaseFirestore.QueryDocumentSnapshot): Member {
  return serializeDoc<Member>(doc);
}

export function sanitizeAttendance(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("La asistencia enviada no es valida.");
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, boolean>>((acc, [memberId, attended]) => {
    if (typeof memberId === "string" && typeof attended === "boolean") {
      acc[memberId] = attended;
    }

    return acc;
  }, {});
}

import type { NextApiResponse } from "next";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../../../lib/server/firebaseAdmin";
import { requireName, sendMethodNotAllowed, serializeDoc, withAuth, type AuthedRequest } from "../../../lib/server/http";
import type { ApiError, Group } from "../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<{ groups: Group[] } | { group: Group } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    if (authedReq.method === "GET") {
      const snapshot = await adminDb().collection("groups").where("ownerId", "==", authedReq.uid).get();
      const groups = snapshot.docs
        .map((doc) => serializeDoc<Group>(doc))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      response.status(200).json({ groups });
      return;
    }

    if (authedReq.method === "POST") {
      const name = requireName(authedReq.body?.name, "nombre del grupo");
      const now = FieldValue.serverTimestamp();
      const groupRef = adminDb().collection("groups").doc();

      await groupRef.set({
        name,
        ownerId: authedReq.uid,
        createdAt: now,
        updatedAt: now
      });

      const createdGroup = await groupRef.get();
      response.status(201).json({ group: serializeDoc<Group>(createdGroup as FirebaseFirestore.QueryDocumentSnapshot) });
      return;
    }

    sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["GET", "POST"]);
  });
}

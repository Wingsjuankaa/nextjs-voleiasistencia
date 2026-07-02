import type { NextApiResponse } from "next";
import { FieldValue } from "firebase-admin/firestore";
import {
  assertGroupOwner,
  getStringQuery,
  requireName,
  sendMethodNotAllowed,
  serializeMember,
  withAuth,
  type AuthedRequest
} from "../../../../../lib/server/http";
import type { ApiError, Member } from "../../../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<{ members: Member[] } | { member: Member } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    const groupId = getStringQuery(authedReq.query.groupId);
    const { groupRef } = await assertGroupOwner(groupId, authedReq.uid);

    if (authedReq.method === "GET") {
      const snapshot = await groupRef.collection("members").orderBy("createdAt", "asc").get();
      response.status(200).json({ members: snapshot.docs.map(serializeMember) });
      return;
    }

    if (authedReq.method === "POST") {
      const name = requireName(authedReq.body?.name, "nombre del integrante");
      const now = FieldValue.serverTimestamp();
      const memberRef = groupRef.collection("members").doc();

      await memberRef.set({
        name,
        active: true,
        createdAt: now,
        updatedAt: now
      });
      await groupRef.update({ updatedAt: now });

      const createdMember = await memberRef.get();
      response.status(201).json({ member: serializeMember(createdMember as FirebaseFirestore.QueryDocumentSnapshot) });
      return;
    }

    sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["GET", "POST"]);
  });
}

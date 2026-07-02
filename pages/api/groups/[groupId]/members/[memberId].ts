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

export default function handler(req: AuthedRequest, res: NextApiResponse<{ member: Member } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    const groupId = getStringQuery(authedReq.query.groupId);
    const memberId = getStringQuery(authedReq.query.memberId);
    const { groupRef } = await assertGroupOwner(groupId, authedReq.uid);
    const memberRef = groupRef.collection("members").doc(memberId);
    const memberSnap = await memberRef.get();

    if (!memberSnap.exists) {
      throw new Error("Integrante no encontrado.");
    }

    if (authedReq.method === "PATCH") {
      const name = requireName(authedReq.body?.name, "nombre del integrante");
      const now = FieldValue.serverTimestamp();

      await memberRef.update({ name, updatedAt: now });
      await groupRef.update({ updatedAt: now });

      const updatedMember = await memberRef.get();
      response.status(200).json({ member: serializeMember(updatedMember as FirebaseFirestore.QueryDocumentSnapshot) });
      return;
    }

    if (authedReq.method === "DELETE") {
      const now = FieldValue.serverTimestamp();

      await memberRef.update({ active: false, updatedAt: now });
      await groupRef.update({ updatedAt: now });

      const updatedMember = await memberRef.get();
      response.status(200).json({ member: serializeMember(updatedMember as FirebaseFirestore.QueryDocumentSnapshot) });
      return;
    }

    sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["PATCH", "DELETE"]);
  });
}

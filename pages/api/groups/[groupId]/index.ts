import type { NextApiResponse } from "next";
import { FieldValue } from "firebase-admin/firestore";
import {
  assertGroupOwner,
  getStringQuery,
  requireName,
  sendMethodNotAllowed,
  serializeDoc,
  withAuth,
  type AuthedRequest
} from "../../../../lib/server/http";
import type { ApiError, Group } from "../../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<{ group: Group } | { ok: true } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    const groupId = getStringQuery(authedReq.query.groupId);
    const { groupRef } = await assertGroupOwner(groupId, authedReq.uid);

    if (authedReq.method === "PATCH") {
      const name = requireName(authedReq.body?.name, "nombre del grupo");
      await groupRef.update({ name, updatedAt: FieldValue.serverTimestamp() });
      const updatedGroup = await groupRef.get();
      response.status(200).json({ group: serializeDoc<Group>(updatedGroup as FirebaseFirestore.QueryDocumentSnapshot) });
      return;
    }

    if (authedReq.method === "DELETE") {
      const writer = groupRef.firestore.bulkWriter();

      const members = await groupRef.collection("members").listDocuments();
      const sessions = await groupRef.collection("sessions").listDocuments();

      members.forEach((doc) => writer.delete(doc));
      sessions.forEach((doc) => writer.delete(doc));
      writer.delete(groupRef);
      await writer.close();

      response.status(200).json({ ok: true });
      return;
    }

    sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["PATCH", "DELETE"]);
  });
}

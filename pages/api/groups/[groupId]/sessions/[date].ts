import type { NextApiResponse } from "next";
import { FieldValue } from "firebase-admin/firestore";
import {
  assertGroupOwner,
  getStringQuery,
  requireDate,
  sanitizeAttendance,
  sendMethodNotAllowed,
  withAuth,
  type AuthedRequest
} from "../../../../../lib/server/http";
import type { ApiError } from "../../../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<{ attendance: Record<string, boolean> | null } | { ok: true } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    const groupId = getStringQuery(authedReq.query.groupId);
    const date = requireDate(getStringQuery(authedReq.query.date));
    const { groupRef } = await assertGroupOwner(groupId, authedReq.uid);
    const sessionRef = groupRef.collection("sessions").doc(date);

    if (authedReq.method === "GET") {
      const snapshot = await sessionRef.get();
      const data = snapshot.data();

      response.status(200).json({ attendance: data?.attendance ?? null });
      return;
    }

    if (authedReq.method === "POST") {
      const attendance = sanitizeAttendance(authedReq.body?.attendance);
      const activeMembers = await groupRef.collection("members").where("active", "==", true).get();
      const activeMemberIds = new Set(activeMembers.docs.map((doc) => doc.id));
      const filteredAttendance = Object.entries(attendance).reduce<Record<string, boolean>>((acc, [memberId, attended]) => {
        if (activeMemberIds.has(memberId)) {
          acc[memberId] = attended;
        }

        return acc;
      }, {});

      const existing = await sessionRef.get();
      const now = FieldValue.serverTimestamp();

      await sessionRef.set(
        {
          date,
          attendance: filteredAttendance,
          createdAt: existing.exists ? existing.data()?.createdAt ?? now : now,
          updatedAt: now
        },
        { merge: true }
      );
      await groupRef.update({ updatedAt: now });

      response.status(200).json({ ok: true });
      return;
    }

    sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["GET", "POST"]);
  });
}

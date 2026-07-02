import type { NextApiResponse } from "next";
import {
  assertGroupOwner,
  getStringQuery,
  sendMethodNotAllowed,
  serializeMember,
  withAuth,
  type AuthedRequest
} from "../../../../lib/server/http";
import type { ApiError, GroupSummary } from "../../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<{ summary: GroupSummary } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    if (authedReq.method !== "GET") {
      sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["GET"]);
      return;
    }

    const groupId = getStringQuery(authedReq.query.groupId);
    const { groupRef } = await assertGroupOwner(groupId, authedReq.uid);
    const [membersSnapshot, sessionsSnapshot] = await Promise.all([
      groupRef.collection("members").orderBy("createdAt", "asc").get(),
      groupRef.collection("sessions").get()
    ]);

    const members = membersSnapshot.docs.map(serializeMember);
    const totalSessions = sessionsSnapshot.size;
    const totals = new Map(members.map((member) => [member.id, 0]));

    sessionsSnapshot.docs.forEach((doc) => {
      const attendance = doc.data().attendance as Record<string, boolean> | undefined;

      Object.entries(attendance ?? {}).forEach(([memberId, attended]) => {
        if (attended && totals.has(memberId)) {
          totals.set(memberId, (totals.get(memberId) ?? 0) + 1);
        }
      });
    });

    const summary: GroupSummary = {
      totalSessions,
      members: members.map((member) => {
        const attended = totals.get(member.id) ?? 0;

        return {
          memberId: member.id,
          name: member.name,
          active: member.active,
          attended,
          percentage: totalSessions === 0 ? 0 : Math.round((attended / totalSessions) * 100)
        };
      })
    };

    response.status(200).json({ summary });
  });
}

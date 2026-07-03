import type { NextApiResponse } from "next";
import { getClubPayload, saveAttendanceForDate } from "../../../../lib/server/clubStore";
import { requireDate, sendMethodNotAllowed, withAuth, type AuthedRequest } from "../../../../lib/server/http";
import type { ApiError, AttendanceRecord } from "../../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<{ attendance: AttendanceRecord[] } | { ok: true; saved: number } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    if (authedReq.method === "GET") {
      const payload = await getClubPayload();
      response.status(200).json({ attendance: payload.attendance });
      return;
    }

    if (authedReq.method === "POST") {
      const date = requireDate(String(authedReq.body?.date ?? ""));
      const records = Array.isArray(authedReq.body?.records) ? authedReq.body.records : [];
      const saved = await saveAttendanceForDate(date, records);
      response.status(200).json({ ok: true, saved });
      return;
    }

    sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["GET", "POST"]);
  });
}

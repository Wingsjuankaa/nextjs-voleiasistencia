import type { NextApiResponse } from "next";
import { replaceClubBackup } from "../../../lib/server/clubStore";
import { sendMethodNotAllowed, withAuth, type AuthedRequest } from "../../../lib/server/http";
import type { ApiError } from "../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<{ ok: true; counts: { players: number; payments: number; attendance: number } } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    if (authedReq.method !== "POST") {
      sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["POST"]);
      return;
    }

    const backup = authedReq.body?.backup ?? authedReq.body;

    if (!backup?.players || !backup?.payments || !backup?.attendance) {
      throw new Error("El backup no tiene el formato esperado.");
    }

    const counts = await replaceClubBackup(backup);
    response.status(200).json({ ok: true, counts });
  });
}

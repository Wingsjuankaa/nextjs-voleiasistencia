import type { NextApiResponse } from "next";
import { getClubSummary } from "../../../lib/server/clubStore";
import { getStringQuery, sendMethodNotAllowed, withAuth, type AuthedRequest } from "../../../lib/server/http";
import type { ApiError, ClubSummary } from "../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<{ summary: ClubSummary } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    if (authedReq.method !== "GET") {
      sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["GET"]);
      return;
    }

    const month = Number(getStringQuery(authedReq.query.month)) || new Date().getMonth() + 1;
    response.status(200).json({ summary: await getClubSummary(month) });
  });
}

import type { NextApiResponse } from "next";
import { getClubPayload, updateClubSettings } from "../../../lib/server/clubStore";
import { sendMethodNotAllowed, withAuth, type AuthedRequest } from "../../../lib/server/http";
import type { ApiError, ClubPayload } from "../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<ClubPayload | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    if (authedReq.method === "GET") {
      response.status(200).json(await getClubPayload());
      return;
    }

    if (authedReq.method === "PATCH") {
      await updateClubSettings(authedReq.body?.settings ?? {});
      response.status(200).json(await getClubPayload());
      return;
    }

    sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["GET", "PATCH"]);
  });
}

import type { NextApiResponse } from "next";
import { getClubPayload, upsertPlayer } from "../../../../lib/server/clubStore";
import { sendMethodNotAllowed, withAuth, type AuthedRequest } from "../../../../lib/server/http";
import type { ApiError, Player } from "../../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<{ players: Player[] } | { player: Player } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    if (authedReq.method === "GET") {
      const payload = await getClubPayload();
      response.status(200).json({ players: payload.players });
      return;
    }

    if (authedReq.method === "POST") {
      const player = await upsertPlayer(authedReq.body?.player ?? authedReq.body ?? {});
      response.status(201).json({ player });
      return;
    }

    sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["GET", "POST"]);
  });
}

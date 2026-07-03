import type { NextApiResponse } from "next";
import { getStringQuery, sendMethodNotAllowed, withAuth, type AuthedRequest } from "../../../../lib/server/http";
import { updatePlayer } from "../../../../lib/server/clubStore";
import type { ApiError, Player } from "../../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<{ player: Player } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    const playerId = getStringQuery(authedReq.query.playerId);

    if (authedReq.method === "PATCH") {
      const player = await updatePlayer(playerId, authedReq.body?.player ?? authedReq.body ?? {});
      response.status(200).json({ player });
      return;
    }

    if (authedReq.method === "DELETE") {
      const player = await updatePlayer(playerId, { estado: "Inactivo" });
      response.status(200).json({ player });
      return;
    }

    sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["PATCH", "DELETE"]);
  });
}

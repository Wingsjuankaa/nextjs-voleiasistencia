import type { NextApiResponse } from "next";
import { deletePayment } from "../../../../lib/server/clubStore";
import { getStringQuery, sendMethodNotAllowed, withAuth, type AuthedRequest } from "../../../../lib/server/http";
import type { ApiError } from "../../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<{ ok: true } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    if (authedReq.method === "DELETE") {
      await deletePayment(getStringQuery(authedReq.query.paymentId));
      response.status(200).json({ ok: true });
      return;
    }

    sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["DELETE"]);
  });
}

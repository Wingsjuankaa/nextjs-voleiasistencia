import type { NextApiResponse } from "next";
import { getClubPayload, upsertPayment } from "../../../../lib/server/clubStore";
import { sendMethodNotAllowed, withAuth, type AuthedRequest } from "../../../../lib/server/http";
import type { ApiError, Payment } from "../../../../types/domain";

export default function handler(req: AuthedRequest, res: NextApiResponse<{ payments: Payment[] } | { payment: Payment } | ApiError>) {
  return withAuth(req, res, async (authedReq, response) => {
    if (authedReq.method === "GET") {
      const payload = await getClubPayload();
      response.status(200).json({ payments: payload.payments });
      return;
    }

    if (authedReq.method === "POST") {
      const payment = await upsertPayment(authedReq.body?.payment ?? authedReq.body ?? {});
      response.status(201).json({ payment });
      return;
    }

    sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["GET", "POST"]);
  });
}

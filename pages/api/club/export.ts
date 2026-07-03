import type { NextApiResponse } from "next";
import { getClubBackup, getClubPayload } from "../../../lib/server/clubStore";
import { getStringQuery, sendMethodNotAllowed, withAuth, type AuthedRequest } from "../../../lib/server/http";
import { calculateSummary, monthName } from "../../../lib/shared/club";
import type { ApiError } from "../../../types/domain";

function csv(rows: Array<Array<string | number>>) {
  return "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
}

export default function handler(req: AuthedRequest, res: NextApiResponse<ApiError | unknown>) {
  return withAuth(req, res, async (authedReq, response) => {
    if (authedReq.method !== "GET") {
      sendMethodNotAllowed(response as NextApiResponse<ApiError>, ["GET"]);
      return;
    }

    const type = getStringQuery(authedReq.query.type) || "backup";
    const month = Number(getStringQuery(authedReq.query.month)) || new Date().getMonth() + 1;

    if (type === "backup") {
      response.status(200).json(await getClubBackup());
      return;
    }

    const payload = await getClubPayload();
    const summary = calculateSummary(payload.players, payload.payments, payload.attendance, month);
    const rows =
      type === "players"
        ? [["Nombre", "RUT", "Categoria", "Genero", "Estado", "Valor", "Telefono", "Emergencia", "Enfermedad", "Observacion"], ...payload.players.map((p) => [p.nombre, p.rut, p.categoria, p.genero, p.estado, p.valor, p.telefonoPersonal, p.telefonoEmergencia, p.enfermedad, p.observacion])]
        : type === "payments"
          ? [["Fecha", "Mes", "Nombre", "Categoria", "Valor mensual", "Monto", "Metodo", "Observacion"], ...payload.payments.filter((p) => p.mesNum === month).map((p) => [p.fecha, p.mes, p.nombre, p.categoria, p.valor, p.monto, p.metodo, p.observacion])]
          : type === "attendance"
            ? [["Fecha", "Mes", "Nombre", "Categoria", "Estado", "Observacion"], ...payload.attendance.map((a) => [a.fecha, a.mes, a.nombre, a.categoria, a.estado, a.observacion])]
            : [["Nombre", "Categoria", "Estado", "Valor", "Presentes", "Ausentes", "Justificadas", "Tardes", "% Asist.", "Pagado", "Deuda", "Pago"], ...summary.map((p) => [p.nombre, p.categoria, p.estado, p.valor, p.presentes, p.ausentes, p.justificadas, p.tardes, p.asistenciaPct, p.pagado, p.deuda, p.estadoPago])];

    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${type}_${monthName(month)}.csv"`);
    response.status(200).send(csv(rows));
  });
}

import type {
  AttendanceRecord,
  AttendanceStatus,
  ClubBackup,
  ClubDashboard,
  ClubSettings,
  MonthlySummaryRow,
  Payment,
  Player,
  PlayerCategory,
  PublicAttendanceMode,
  PublicAttendanceRow
} from "../../types/domain";

export const CLUB_ID = "main";
export const CLUB_NAME = "Club de Voley";

export const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];

export const CATEGORIES: PlayerCategory[] = [
  "Femenino +18",
  "Femenino sub 18",
  "Masculino +18",
  "Masculino sub 18",
  "Semillero"
];

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["Presente", "Ausente", "Justificada", "Tarde"];

export const DEFAULT_DEBT_MESSAGE =
  "Hola {nombre}, te escribo para recordar que esta pendiente la mensualidad de {mes} por {deuda}. Muchas gracias.";

export const DEFAULT_SETTINGS: ClubSettings = {
  clubName: CLUB_NAME,
  defaultMonthly: 5000,
  semilleroMonthly: 1000,
  debtMessageTemplate: DEFAULT_DEBT_MESSAGE,
  backupEmail: "",
  importNote: ""
};

export function todayISO() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

export function monthFromISO(iso: string) {
  const parsed = Number(String(iso || "").slice(5, 7));
  return parsed >= 1 && parsed <= 12 ? parsed : new Date().getMonth() + 1;
}

export function monthName(month: number) {
  return MONTHS[Math.max(0, Math.min(11, month - 1))] ?? MONTHS[0];
}

export function money(value: number | string | undefined | null) {
  return "$" + Number(value || 0).toLocaleString("es-CL");
}

export function normalizeName(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function mapCategory(value: unknown): PlayerCategory {
  const raw = String(value || "");
  const category = raw.toLowerCase();

  if (category.includes("semillero")) return "Semillero";
  if (category.includes("femenino")) return category.includes("sub") || category.includes("-18") ? "Femenino sub 18" : "Femenino +18";
  if (category.includes("masculino")) return category.includes("sub") || category.includes("-18") ? "Masculino sub 18" : "Masculino +18";

  return CATEGORIES.includes(raw as PlayerCategory) ? (raw as PlayerCategory) : "Femenino +18";
}

export function categoryValue(category: unknown, settings: ClubSettings = DEFAULT_SETTINGS) {
  return mapCategory(category) === "Semillero" ? Number(settings.semilleroMonthly || 1000) : Number(settings.defaultMonthly || 5000);
}

export function genderFromCategory(category: unknown, current = "") {
  if (current) return current;
  const mapped = mapCategory(category);
  if (mapped.startsWith("Femenino")) return "Femenino";
  if (mapped.startsWith("Masculino")) return "Masculino";
  return "No informado";
}

export function calcAge(birthDate: string) {
  if (!birthDate) return "";
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDelta = today.getMonth() - date.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : "";
}

export function normalizeSettings(settings?: Partial<ClubSettings> | null): ClubSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings ?? {}),
    defaultMonthly: 5000,
    semilleroMonthly: Number(settings?.semilleroMonthly || DEFAULT_SETTINGS.semilleroMonthly),
    debtMessageTemplate: settings?.debtMessageTemplate || DEFAULT_DEBT_MESSAGE,
    backupEmail: settings?.backupEmail || "",
    importNote: settings?.importNote || ""
  };
}

export function normalizePlayer(raw: Partial<Player>, settings: ClubSettings = DEFAULT_SETTINGS): Player {
  const categoria = mapCategory(raw.categoria);
  const fechaNacimiento = raw.fechaNacimiento || "";
  const valor = raw.valor === 0 || raw.valor ? Number(raw.valor) : categoryValue(categoria, settings);

  return {
    id: String(raw.id || ""),
    legacyId: raw.legacyId ?? null,
    nombre: String(raw.nombre || "").trim(),
    rut: raw.rut || "",
    categoria,
    genero: genderFromCategory(categoria, raw.genero || ""),
    fechaNacimiento,
    edad: raw.edad === 0 || raw.edad ? raw.edad : calcAge(fechaNacimiento),
    telefonoPersonal: raw.telefonoPersonal || raw.telefono || "",
    telefonoEmergencia: raw.telefonoEmergencia || "",
    telefono: raw.telefonoPersonal || raw.telefono || "",
    estado: raw.estado || "Activo",
    valor: categoria === "Semillero" ? Number(settings.semilleroMonthly || 1000) : valor || Number(settings.defaultMonthly || 5000),
    enfermedad: raw.enfermedad || "",
    observacion: raw.observacion || "",
    posicion: raw.posicion || "",
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null
  };
}

export function normalizePayment(raw: Partial<Payment>, players: Player[] = []): Payment {
  const player = raw.playerId ? players.find((item) => item.id === raw.playerId) : players.find((item) => normalizeName(item.nombre) === normalizeName(raw.nombre || ""));
  const fecha = raw.fecha || todayISO();
  const mesNum = Number(raw.mesNum || monthFromISO(fecha));

  return {
    id: String(raw.id || ""),
    legacyId: raw.legacyId ?? null,
    playerId: player?.id ?? raw.playerId ?? null,
    fecha,
    mes: raw.mes || monthName(mesNum),
    mesNum,
    nombre: raw.nombre || player?.nombre || "",
    categoria: mapCategory(raw.categoria || player?.categoria),
    valor: Number(raw.valor || player?.valor || 0),
    monto: Number(raw.monto || 0),
    metodo: raw.metodo || "No informado",
    estado: raw.estado || "",
    deuda: Number(raw.deuda || 0),
    observacion: raw.observacion || "",
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null
  };
}

export function normalizeAttendance(raw: Partial<AttendanceRecord>, players: Player[] = []): AttendanceRecord {
  const player = raw.playerId ? players.find((item) => item.id === raw.playerId) : players.find((item) => normalizeName(item.nombre) === normalizeName(raw.nombre || ""));
  const fecha = raw.fecha || todayISO();
  const mesNum = Number(raw.mesNum || monthFromISO(fecha));
  const estado = ATTENDANCE_STATUSES.includes(raw.estado as AttendanceStatus) ? (raw.estado as AttendanceStatus) : "Presente";

  return {
    id: String(raw.id || ""),
    legacyId: raw.legacyId ?? null,
    playerId: player?.id ?? raw.playerId ?? null,
    fecha,
    mes: raw.mes || monthName(mesNum),
    mesNum,
    nombre: raw.nombre || player?.nombre || "",
    categoria: mapCategory(raw.categoria || player?.categoria),
    estado,
    observacion: raw.observacion || "",
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null
  };
}

export function activePlayers(players: Player[]) {
  return players.filter((player) => player.estado !== "Inactivo").sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function calculateSummary(players: Player[], payments: Payment[], attendance: AttendanceRecord[], month: number): MonthlySummaryRow[] {
  return players
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((player) => {
      const playerPayments = payments.filter((payment) => Number(payment.mesNum) === Number(month) && payment.playerId === player.id);
      const fallbackPayments = payments.filter((payment) => Number(payment.mesNum) === Number(month) && !payment.playerId && normalizeName(payment.nombre) === normalizeName(player.nombre));
      const playerAttendance = attendance.filter((record) => Number(record.mesNum) === Number(month) && record.playerId === player.id);
      const fallbackAttendance = attendance.filter((record) => Number(record.mesNum) === Number(month) && !record.playerId && normalizeName(record.nombre) === normalizeName(player.nombre));
      const records = [...playerAttendance, ...fallbackAttendance];
      const presentes = records.filter((record) => record.estado === "Presente").length;
      const ausentes = records.filter((record) => record.estado === "Ausente").length;
      const justificadas = records.filter((record) => record.estado === "Justificada").length;
      const tardes = records.filter((record) => record.estado === "Tarde").length;
      const totalClases = records.length;
      const pagado = [...playerPayments, ...fallbackPayments].reduce((total, payment) => total + Number(payment.monto || 0), 0);
      const valor = Number(player.valor || 0);
      const deuda = Math.max(valor - pagado, 0);

      return {
        ...player,
        presentes,
        ausentes,
        justificadas,
        tardes,
        totalClases,
        asistenciaPct: totalClases ? Math.round(((presentes + tardes + justificadas) / totalClases) * 100) : 0,
        pagado,
        deuda,
        estadoPago: pagado >= valor && valor > 0 ? "Pagado" : pagado > 0 ? "Parcial" : "Pendiente"
      };
    });
}

export function calculateDashboard(summary: MonthlySummaryRow[], attendance: AttendanceRecord[], month: number): ClubDashboard {
  const activos = summary.filter((player) => player.estado !== "Inactivo");

  return {
    totalJugadores: summary.length,
    activos: activos.length,
    totalRecaudado: summary.reduce((total, player) => total + player.pagado, 0),
    totalDeuda: activos.reduce((total, player) => total + player.deuda, 0),
    pagados: activos.filter((player) => player.deuda === 0 && Number(player.valor) > 0).length,
    deudores: activos.filter((player) => player.deuda > 0).length,
    asistencias: attendance.filter((record) => Number(record.mesNum) === Number(month) && record.estado === "Presente").length
  };
}

export function messageForDebtor(player: MonthlySummaryRow, settings: ClubSettings, month: number) {
  const values: Record<string, string> = {
    nombre: player.nombre,
    mes: monthName(month),
    deuda: money(player.deuda),
    pagado: money(player.pagado),
    valor: money(player.valor),
    categoria: player.categoria
  };

  return Object.entries(values).reduce(
    (message, [key, value]) => message.replace(new RegExp(`\\{${key}\\}`, "g"), value),
    settings.debtMessageTemplate || DEFAULT_DEBT_MESSAGE
  );
}

export function normalizePhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("56")) return digits;
  if (digits.length === 9 && digits.startsWith("9")) return "56" + digits;
  if (digits.length === 8) return "569" + digits;
  return digits;
}

export function publicAttendanceRows(
  players: Player[],
  attendance: AttendanceRecord[],
  date: string,
  category: PlayerCategory | "Todas",
  mode: PublicAttendanceMode
): PublicAttendanceRow[] {
  let rows: PublicAttendanceRow[] = activePlayers(players)
    .filter((player) => category === "Todas" || player.categoria === category)
    .map((player) => {
      const record = attendance.find((item) => item.fecha === date && item.playerId === player.id);

      return {
        nombre: player.nombre,
        categoria: player.categoria,
        estado: record?.estado ?? "Sin registro",
        observacion: record?.observacion ?? ""
      };
    });

  if (mode === "playing") {
    rows = rows.filter((row) => row.estado === "Presente" || row.estado === "Tarde");
  }

  if (mode === "absent") {
    rows = rows.filter((row) => row.estado === "Ausente" || row.estado === "Justificada");
  }

  return rows;
}

export function publicTextFromRows(rows: PublicAttendanceRow[], date: string, category: string) {
  const playing = rows.filter((row) => row.estado === "Presente" || row.estado === "Tarde");
  const absent = rows.filter((row) => row.estado === "Ausente" || row.estado === "Justificada");
  const pending = rows.filter((row) => row.estado === "Sin registro");
  const block = (title: string, list: PublicAttendanceRow[]) =>
    list.length
      ? `\n${title}\n${list
          .map((row) => `- ${row.nombre}${row.estado && row.estado !== "Presente" ? ` (${row.estado})` : ""}${row.observacion ? ` - ${row.observacion}` : ""}`)
          .join("\n")}`
      : "";

  return `Asistencia ${date}\nCategoria: ${category}\nTotal mostrado: ${rows.length}${block("Presentes / tarde", playing)}${block(
    "Ausentes / justificados",
    absent
  )}${block("Sin registro", pending)}`;
}

export function backupFromData(settings: ClubSettings, players: Player[], payments: Payment[], attendance: AttendanceRecord[]): ClubBackup {
  return {
    version: "next-firestore-v1",
    exportedAt: new Date().toISOString(),
    settings,
    players,
    payments,
    attendance
  };
}

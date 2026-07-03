export type Group = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type Member = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceSession = {
  id: string;
  date: string;
  attendance: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
};

export type MemberSummary = {
  memberId: string;
  name: string;
  active: boolean;
  attended: number;
  percentage: number;
};

export type GroupSummary = {
  totalSessions: number;
  members: MemberSummary[];
};

export type ApiError = {
  error: string;
};

export type PlayerCategory = "Femenino +18" | "Femenino sub 18" | "Masculino +18" | "Masculino sub 18" | "Semillero";

export type AttendanceStatus = "Presente" | "Ausente" | "Justificada" | "Tarde";

export type PlayerStatus = "Activo" | "Pausado" | "Inactivo";

export type Gender = "Femenino" | "Masculino" | "Otro" | "No informado" | string;

export type PaymentStatus = "Pagado" | "Parcial" | "Pendiente";

export type PublicAttendanceMode = "all" | "playing" | "absent";

export type TimestampString = string | null;

export type ClubSettings = {
  clubName: string;
  defaultMonthly: number;
  semilleroMonthly: number;
  debtMessageTemplate: string;
  backupEmail: string;
  importNote?: string;
};

export type Club = {
  id: string;
  name: string;
  settings: ClubSettings;
  createdAt: TimestampString;
  updatedAt: TimestampString;
};

export type Player = {
  id: string;
  legacyId?: number | null;
  nombre: string;
  rut: string;
  categoria: PlayerCategory;
  genero: Gender;
  fechaNacimiento: string;
  edad: number | string;
  telefonoPersonal: string;
  telefonoEmergencia: string;
  telefono: string;
  estado: PlayerStatus;
  valor: number;
  enfermedad: string;
  observacion: string;
  posicion: string;
  createdAt: TimestampString;
  updatedAt: TimestampString;
};

export type Payment = {
  id: string;
  legacyId?: number | null;
  playerId: string | null;
  fecha: string;
  mes: string;
  mesNum: number;
  nombre: string;
  categoria: PlayerCategory;
  valor: number;
  monto: number;
  metodo: string;
  estado: string;
  deuda: number;
  observacion: string;
  createdAt: TimestampString;
  updatedAt: TimestampString;
};

export type AttendanceRecord = {
  id: string;
  legacyId?: number | null;
  playerId: string | null;
  fecha: string;
  mes: string;
  mesNum: number;
  nombre: string;
  categoria: PlayerCategory;
  estado: AttendanceStatus;
  observacion: string;
  createdAt: TimestampString;
  updatedAt: TimestampString;
};

export type MonthlySummaryRow = Player & {
  presentes: number;
  ausentes: number;
  justificadas: number;
  tardes: number;
  totalClases: number;
  asistenciaPct: number;
  pagado: number;
  deuda: number;
  estadoPago: PaymentStatus;
};

export type ClubDashboard = {
  totalJugadores: number;
  activos: number;
  totalRecaudado: number;
  totalDeuda: number;
  pagados: number;
  deudores: number;
  asistencias: number;
};

export type PublicAttendanceRow = {
  nombre: string;
  categoria: PlayerCategory;
  estado: AttendanceStatus | "Sin registro";
  observacion: string;
};

export type ClubPayload = {
  club: Club;
  players: Player[];
  payments: Payment[];
  attendance: AttendanceRecord[];
};

export type ClubSummary = {
  month: number;
  rows: MonthlySummaryRow[];
  dashboard: ClubDashboard;
};

export type ClubBackup = {
  version: string;
  exportedAt: string;
  settings: ClubSettings;
  players: Player[];
  payments: Payment[];
  attendance: AttendanceRecord[];
};

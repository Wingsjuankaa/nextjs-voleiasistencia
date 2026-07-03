import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";
import type { AttendanceRecord, Club, ClubBackup, ClubPayload, ClubSettings, Payment, Player } from "../../types/domain";
import {
  CLUB_ID,
  CLUB_NAME,
  DEFAULT_SETTINGS,
  backupFromData,
  calculateDashboard,
  calculateSummary,
  normalizeAttendance,
  normalizePayment,
  normalizePlayer,
  normalizeSettings
} from "../shared/club";

type AnyDoc = FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot;

function timestampToString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  return null;
}

function dataWithTimestamps(doc: AnyDoc) {
  const data = doc.data() ?? {};

  return {
    id: doc.id,
    ...data,
    createdAt: timestampToString(data.createdAt),
    updatedAt: timestampToString(data.updatedAt)
  };
}

function stripReadonly<T extends { id?: string; createdAt?: unknown; updatedAt?: unknown }>(value: T) {
  const rest = { ...value };
  delete rest.id;
  delete rest.createdAt;
  delete rest.updatedAt;
  return rest;
}

export function clubRef() {
  return adminDb().collection("clubs").doc(CLUB_ID);
}

export async function ensureClub() {
  const ref = clubRef();
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    const now = FieldValue.serverTimestamp();
    await ref.set({
      name: CLUB_NAME,
      settings: DEFAULT_SETTINGS,
      createdAt: now,
      updatedAt: now
    });
  }

  return ref;
}

export function serializeClub(doc: AnyDoc): Club {
  const data = dataWithTimestamps(doc) as Club;

  return {
    id: data.id,
    name: data.name || data.settings?.clubName || CLUB_NAME,
    settings: normalizeSettings(data.settings),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

export function serializePlayer(doc: AnyDoc, settings: ClubSettings): Player {
  return normalizePlayer(dataWithTimestamps(doc) as Partial<Player>, settings);
}

export function serializePayment(doc: AnyDoc, players: Player[]): Payment {
  return normalizePayment(dataWithTimestamps(doc) as Partial<Payment>, players);
}

export function serializeAttendance(doc: AnyDoc, players: Player[]): AttendanceRecord {
  return normalizeAttendance(dataWithTimestamps(doc) as Partial<AttendanceRecord>, players);
}

export async function getClubPayload(): Promise<ClubPayload> {
  const ref = await ensureClub();
  const clubSnapshot = await ref.get();
  const club = serializeClub(clubSnapshot);
  const [playersSnapshot, paymentsSnapshot, attendanceSnapshot] = await Promise.all([
    ref.collection("players").get(),
    ref.collection("payments").get(),
    ref.collection("attendanceRecords").get()
  ]);
  const players = playersSnapshot.docs
    .map((doc) => serializePlayer(doc, club.settings))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const payments = paymentsSnapshot.docs.map((doc) => serializePayment(doc, players)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const attendance = attendanceSnapshot.docs.map((doc) => serializeAttendance(doc, players)).sort((a, b) => `${b.fecha}${b.nombre}`.localeCompare(`${a.fecha}${a.nombre}`));

  return { club, players, payments, attendance };
}

export async function updateClubSettings(settings: Partial<ClubSettings>) {
  const ref = await ensureClub();
  const snapshot = await ref.get();
  const current = serializeClub(snapshot);
  const nextSettings = normalizeSettings({ ...current.settings, ...settings });
  const now = FieldValue.serverTimestamp();

  await ref.set(
    {
      name: nextSettings.clubName || CLUB_NAME,
      settings: nextSettings,
      updatedAt: now
    },
    { merge: true }
  );

  return serializeClub(await ref.get());
}

export async function upsertPlayer(input: Partial<Player>) {
  const { club } = await getClubPayload();
  const player = normalizePlayer(input, club.settings);
  const ref = clubRef().collection("players").doc(player.id || clubRef().collection("players").doc().id);
  const existing = await ref.get();
  const now = FieldValue.serverTimestamp();

  await ref.set(
    {
      ...stripReadonly(player),
      createdAt: existing.exists ? existing.data()?.createdAt ?? now : now,
      updatedAt: now
    },
    { merge: true }
  );
  await clubRef().update({ updatedAt: now });

  return serializePlayer(await ref.get(), club.settings);
}

export async function updatePlayer(playerId: string, input: Partial<Player>) {
  const { club } = await getClubPayload();
  const ref = clubRef().collection("players").doc(playerId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new Error("Jugador no encontrado.");
  }

  const current = serializePlayer(snapshot, club.settings);
  const next = normalizePlayer({ ...current, ...input, id: playerId }, club.settings);
  const now = FieldValue.serverTimestamp();

  await ref.set({ ...stripReadonly(next), updatedAt: now }, { merge: true });
  await clubRef().update({ updatedAt: now });

  return serializePlayer(await ref.get(), club.settings);
}

export async function upsertPayment(input: Partial<Payment>) {
  const payload = await getClubPayload();
  const payment = normalizePayment(input, payload.players);
  const ref = clubRef().collection("payments").doc(payment.id || clubRef().collection("payments").doc().id);
  const existing = await ref.get();
  const now = FieldValue.serverTimestamp();

  await ref.set(
    {
      ...stripReadonly(payment),
      createdAt: existing.exists ? existing.data()?.createdAt ?? now : now,
      updatedAt: now
    },
    { merge: true }
  );
  await clubRef().update({ updatedAt: now });

  return serializePayment(await ref.get(), payload.players);
}

export async function deletePayment(paymentId: string) {
  const now = FieldValue.serverTimestamp();
  await clubRef().collection("payments").doc(paymentId).delete();
  await clubRef().update({ updatedAt: now });
}

export async function saveAttendanceForDate(date: string, records: Partial<AttendanceRecord>[]) {
  const payload = await getClubPayload();
  const now = FieldValue.serverTimestamp();
  const writer = adminDb().bulkWriter();
  const normalized = records.map((record) => normalizeAttendance({ ...record, fecha: date }, payload.players));

  for (const record of normalized) {
    let ref: FirebaseFirestore.DocumentReference | null = null;

    if (record.playerId) {
      const existing = await clubRef().collection("attendanceRecords").where("fecha", "==", date).get();
      ref = existing.docs.find((doc) => doc.data().playerId === record.playerId)?.ref ?? null;
    }

    const docRef = ref ?? clubRef().collection("attendanceRecords").doc(record.id || `${date}_${record.playerId ?? record.legacyId ?? Date.now()}`);
    writer.set(
      docRef,
      {
        ...stripReadonly(record),
        createdAt: now,
        updatedAt: now
      },
      { merge: true }
    );
  }

  await writer.close();
  await clubRef().update({ updatedAt: now });

  return normalized.length;
}

export async function replaceClubBackup(backup: Pick<ClubBackup, "settings" | "players" | "payments" | "attendance">) {
  const ref = await ensureClub();
  const settings = normalizeSettings(backup.settings);
  const players = (backup.players ?? []).map((player) => normalizePlayer(player, settings));
  const payments = (backup.payments ?? []).map((payment) => normalizePayment(payment, players));
  const attendance = (backup.attendance ?? []).map((record) => normalizeAttendance(record, players));
  const writer = adminDb().bulkWriter();
  const now = FieldValue.serverTimestamp();

  for (const collectionName of ["players", "payments", "attendanceRecords"]) {
    const docs = await ref.collection(collectionName).listDocuments();
    docs.forEach((doc) => writer.delete(doc));
  }

  writer.set(
    ref,
    {
      name: settings.clubName || CLUB_NAME,
      settings,
      createdAt: now,
      updatedAt: now
    },
    { merge: true }
  );

  players.forEach((player) => {
    writer.set(ref.collection("players").doc(player.id || `player_${player.legacyId}`), {
      ...stripReadonly(player),
      createdAt: now,
      updatedAt: now
    });
  });
  payments.forEach((payment) => {
    writer.set(ref.collection("payments").doc(payment.id || `payment_${payment.legacyId}`), {
      ...stripReadonly(payment),
      createdAt: now,
      updatedAt: now
    });
  });
  attendance.forEach((record) => {
    writer.set(ref.collection("attendanceRecords").doc(record.id || `attendance_${record.legacyId}`), {
      ...stripReadonly(record),
      createdAt: now,
      updatedAt: now
    });
  });

  await writer.close();

  return { players: players.length, payments: payments.length, attendance: attendance.length };
}

export async function getClubSummary(month: number) {
  const payload = await getClubPayload();
  const rows = calculateSummary(payload.players, payload.payments, payload.attendance, month);

  return {
    month,
    rows,
    dashboard: calculateDashboard(rows, payload.attendance, month)
  };
}

export async function getClubBackup() {
  const payload = await getClubPayload();
  return backupFromData(payload.club.settings, payload.players, payload.payments, payload.attendance);
}

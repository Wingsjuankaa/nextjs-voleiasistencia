import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const dryRun = process.argv.includes("--dry-run");

function loadEnvFile() {
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    process.env[key] = process.env[key] || rest.join("=").replace(/^["']|["']$/g, "");
  }
}

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./serviceAccountKey.json";
  const source = raw ?? (encoded ? Buffer.from(encoded, "base64").toString("utf8") : fs.readFileSync(path.resolve(root, serviceAccountPath), "utf8"));
  const parsed = JSON.parse(source.trim());
  const serviceAccount = typeof parsed === "string" ? JSON.parse(parsed) : parsed;

  if (typeof serviceAccount.private_key === "string") {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  return serviceAccount;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function mapCategory(value) {
  const raw = String(value || "");
  const lower = raw.toLowerCase();
  if (lower.includes("semillero")) return "Semillero";
  if (lower.includes("femenino")) return lower.includes("sub") || lower.includes("-18") ? "Femenino sub 18" : "Femenino +18";
  if (lower.includes("masculino")) return lower.includes("sub") || lower.includes("-18") ? "Masculino sub 18" : "Masculino +18";
  return ["Femenino +18", "Femenino sub 18", "Masculino +18", "Masculino sub 18", "Semillero"].includes(raw) ? raw : "Femenino +18";
}

function categoryValue(category, settings) {
  return mapCategory(category) === "Semillero" ? Number(settings.semilleroMonthly || 1000) : Number(settings.defaultMonthly || 5000);
}

function genderFromCategory(category, current) {
  if (current) return current;
  const mapped = mapCategory(category);
  if (mapped.startsWith("Femenino")) return "Femenino";
  if (mapped.startsWith("Masculino")) return "Masculino";
  return "No informado";
}

function monthFromISO(iso) {
  const parsed = Number(String(iso || "").slice(5, 7));
  return parsed >= 1 && parsed <= 12 ? parsed : new Date().getMonth() + 1;
}

const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function extractInitialData() {
  const htmlPath = path.join(root, "asistencia.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const match = html.match(/const INITIAL_DATA = (.*?);\s*const MONTHS/s);

  if (!match) {
    throw new Error("No pude encontrar INITIAL_DATA en asistencia.html.");
  }

  return JSON.parse(match[1]);
}

const data = extractInitialData();

if (dryRun) {
  console.log(`Dry run: ${data.players?.length || 0} jugadores, ${data.payments?.length || 0} pagos, ${data.attendance?.length || 0} asistencias.`);
  process.exit(0);
}

loadEnvFile();

if (!getApps().length) {
  initializeApp({ credential: cert(parseServiceAccount()) });
}

const db = getFirestore();
const settings = {
  clubName: data.settings?.clubName || "Club de Voley",
  defaultMonthly: 5000,
  semilleroMonthly: Number(data.settings?.semilleroMonthly || 1000),
  debtMessageTemplate:
    data.settings?.debtMessageTemplate || "Hola {nombre}, te escribo para recordar que esta pendiente la mensualidad de {mes} por {deuda}. Muchas gracias.",
  backupEmail: data.settings?.backupEmail || "",
  importNote: data.settings?.importNote || "Backlog importado desde asistencia.html"
};
const now = FieldValue.serverTimestamp();
const clubRef = db.collection("clubs").doc("main");
const writer = db.bulkWriter();
const playerByName = new Map();

writer.set(
  clubRef,
  {
    name: settings.clubName,
    settings,
    createdAt: now,
    updatedAt: now
  },
  { merge: true }
);

const players = (data.players || []).map((raw) => {
  const categoria = mapCategory(raw.categoria);
  const id = `player_${raw.id}`;
  const player = {
    legacyId: Number(raw.id),
    nombre: String(raw.nombre || "").trim(),
    rut: raw.rut || "",
    categoria,
    genero: genderFromCategory(categoria, raw.genero || ""),
    fechaNacimiento: raw.fechaNacimiento || "",
    edad: raw.edad || "",
    telefonoPersonal: raw.telefonoPersonal || raw.telefono || "",
    telefonoEmergencia: raw.telefonoEmergencia || "",
    telefono: raw.telefonoPersonal || raw.telefono || "",
    estado: raw.estado || "Activo",
    valor: categoria === "Semillero" ? Number(settings.semilleroMonthly || 1000) : Number(raw.valor || categoryValue(categoria, settings)),
    enfermedad: raw.enfermedad || "",
    observacion: raw.observacion || "",
    posicion: raw.posicion || "",
    createdAt: now,
    updatedAt: now
  };

  if (player.nombre) {
    playerByName.set(normalizeName(player.nombre), { id, ...player });
  }

  writer.set(clubRef.collection("players").doc(id), player, { merge: true });
  return { id, ...player };
});

for (const raw of data.payments || []) {
  const player = playerByName.get(normalizeName(raw.nombre || ""));
  const fecha = raw.fecha || new Date().toISOString().slice(0, 10);
  const mesNum = Number(raw.mesNum || monthFromISO(fecha));

  writer.set(
    clubRef.collection("payments").doc(`payment_${raw.id}`),
    {
      legacyId: Number(raw.id),
      playerId: player?.id || null,
      fecha,
      mes: raw.mes || months[mesNum - 1],
      mesNum,
      nombre: raw.nombre || player?.nombre || "",
      categoria: mapCategory(raw.categoria || player?.categoria),
      valor: Number(raw.valor || player?.valor || 0),
      monto: Number(raw.monto || 0),
      metodo: raw.metodo || "No informado",
      estado: raw.estado || "",
      deuda: Number(raw.deuda || 0),
      observacion: raw.observacion || "",
      createdAt: now,
      updatedAt: now
    },
    { merge: true }
  );
}

for (const raw of data.attendance || []) {
  const player = playerByName.get(normalizeName(raw.nombre || ""));
  const fecha = raw.fecha || new Date().toISOString().slice(0, 10);
  const mesNum = Number(raw.mesNum || monthFromISO(fecha));

  writer.set(
    clubRef.collection("attendanceRecords").doc(`attendance_${raw.id}`),
    {
      legacyId: Number(raw.id),
      playerId: player?.id || null,
      fecha,
      mes: raw.mes || months[mesNum - 1],
      mesNum,
      nombre: raw.nombre || player?.nombre || "",
      categoria: mapCategory(raw.categoria || player?.categoria),
      estado: ["Presente", "Ausente", "Justificada", "Tarde"].includes(raw.estado) ? raw.estado : "Presente",
      observacion: raw.observacion || "",
      createdAt: now,
      updatedAt: now
    },
    { merge: true }
  );
}

await writer.close();

console.log(`Seed completado: ${players.length} jugadores, ${(data.payments || []).length} pagos, ${(data.attendance || []).length} asistencias.`);

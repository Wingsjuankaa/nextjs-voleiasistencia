import Head from "next/head";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import {
  ClipboardList,
  Copy,
  Download,
  FileDown,
  LogOut,
  MessageCircle,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  UserPlus,
  Users
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/client/api";
import { getFirebaseAuth, googleProvider } from "../lib/client/firebase";
import {
  ATTENDANCE_STATUSES,
  CATEGORIES,
  DEFAULT_SETTINGS,
  MONTHS,
  activePlayers,
  backupFromData,
  calculateDashboard,
  calculateSummary,
  categoryValue,
  messageForDebtor,
  money,
  monthFromISO,
  monthName,
  normalizePhone,
  publicAttendanceRows,
  publicTextFromRows,
  todayISO
} from "../lib/shared/club";
import type { AttendanceStatus, ClubPayload, Payment, Player, PlayerCategory, PublicAttendanceMode } from "../types/domain";
import styles from "../styles/Home.module.css";

type Tab = "panel" | "attendance" | "payments" | "summary" | "detail" | "public" | "players" | "debtors" | "backup";

type PlayerDraft = {
  nombre: string;
  rut: string;
  categoria: PlayerCategory;
  genero: string;
  fechaNacimiento: string;
  edad: string;
  telefonoPersonal: string;
  telefonoEmergencia: string;
  estado: "Activo" | "Pausado" | "Inactivo";
  valor: string;
  enfermedad: string;
  observacion: string;
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "panel", label: "Panel" },
  { id: "attendance", label: "Asistencia" },
  { id: "payments", label: "Pagos" },
  { id: "summary", label: "Resumen mensual" },
  { id: "detail", label: "Detalle fecha" },
  { id: "public", label: "Vista jugadores" },
  { id: "players", label: "Jugadores" },
  { id: "debtors", label: "Deudores" },
  { id: "backup", label: "Respaldo" }
];

const emptyPlayerDraft = (): PlayerDraft => ({
  nombre: "",
  rut: "",
  categoria: "Femenino +18",
  genero: "Femenino",
  fechaNacimiento: "",
  edad: "",
  telefonoPersonal: "",
  telefonoEmergencia: "",
  estado: "Activo",
  valor: "5000",
  enfermedad: "",
  observacion: ""
});

function getFriendlyError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";

  if (code === "auth/operation-not-allowed") return "Google no esta habilitado como proveedor en Firebase.";
  if (code === "auth/configuration-not-found") return "Firebase Auth no esta configurado para este proyecto.";
  if (code === "auth/unauthorized-domain") return "Este dominio no esta autorizado en Firebase Auth.";
  if (code === "auth/popup-blocked") return "El navegador bloqueo la ventana de Google.";
  if (code === "auth/popup-closed-by-user") return "La ventana de Google se cerro antes de completar el inicio de sesion.";

  return error instanceof Error ? error.message : "No se pudo completar la accion.";
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csv(rows: Array<Array<string | number>>) {
  return "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
}

function htmlEscape(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (match) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[match] ?? match);
}

function statusClass(status: string) {
  if (status === "Pagado") return styles.paid;
  if (status === "Parcial") return styles.partial;
  if (status === "Pendiente") return styles.pending;
  if (status === "Activo") return styles.active;
  return styles.inactive;
}

function StatusPill({ value }: { value: string }) {
  return <span className={`${styles.status} ${statusClass(value)}`}>{value}</span>;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [payload, setPayload] = useState<ClubPayload | null>(null);
  const [tab, setTab] = useState<Tab>("panel");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [globalDate, setGlobalDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [attCategory, setAttCategory] = useState<PlayerCategory | "Todas">("Todas");
  const [attSearch, setAttSearch] = useState("");
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, { estado: AttendanceStatus; observacion: string }>>({});
  const [paySearch, setPaySearch] = useState("");
  const [payPlayerId, setPayPlayerId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Transferencia");
  const [payObs, setPayObs] = useState("");
  const [sumSearch, setSumSearch] = useState("");
  const [detailSearch, setDetailSearch] = useState("");
  const [publicCategory, setPublicCategory] = useState<PlayerCategory | "Todas">("Todas");
  const [publicMode, setPublicMode] = useState<PublicAttendanceMode>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerDraft, setPlayerDraft] = useState<PlayerDraft>(emptyPlayerDraft);
  const [debtSearch, setDebtSearch] = useState("");
  const [debtTemplate, setDebtTemplate] = useState(DEFAULT_SETTINGS.debtMessageTemplate);
  const [backupText, setBackupText] = useState("");
  const [backupEmail, setBackupEmail] = useState("");

  const settings = useMemo(() => payload?.club.settings ?? DEFAULT_SETTINGS, [payload?.club.settings]);
  const players = useMemo(() => payload?.players ?? [], [payload?.players]);
  const payments = useMemo(() => payload?.payments ?? [], [payload?.payments]);
  const attendance = useMemo(() => payload?.attendance ?? [], [payload?.attendance]);
  const summary = useMemo(() => calculateSummary(players, payments, attendance, selectedMonth), [attendance, payments, players, selectedMonth]);
  const dashboard = useMemo(() => calculateDashboard(summary, attendance, selectedMonth), [attendance, selectedMonth, summary]);
  const active = useMemo(() => activePlayers(players), [players]);
  const selectedPlayer = players.find((player) => player.id === payPlayerId);

  const getToken = useCallback(async () => {
    if (!user) throw new Error("Debes iniciar sesion.");
    return user.getIdToken();
  }, [user]);

  const runAction = useCallback(async (action: () => Promise<void>, success?: string) => {
    setLoading(true);
    setNotice("");

    try {
      await action();
      if (success) setNotice(success);
    } catch (error) {
      setNotice(getFriendlyError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClub = useCallback(async () => {
    const token = await getToken();
    const data = await api.getClub(token);
    setPayload(data);
    setDebtTemplate(data.club.settings.debtMessageTemplate);
    setBackupEmail(data.club.settings.backupEmail || "");
  }, [getToken]);

  useEffect(() => {
    try {
      const auth = getFirebaseAuth();
      return onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setAuthReady(true);
      });
    } catch (error) {
      setAuthError(getFriendlyError(error));
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    if (user) {
      runAction(loadClub);
    } else {
      setPayload(null);
    }
  }, [loadClub, runAction, user]);

  useEffect(() => {
    const nextDraft = active.reduce<Record<string, { estado: AttendanceStatus; observacion: string }>>((acc, player) => {
      const record = attendance.find((item) => item.fecha === globalDate && item.playerId === player.id);
      acc[player.id] = { estado: record?.estado ?? "Presente", observacion: record?.observacion ?? "" };
      return acc;
    }, {});
    setAttendanceDraft(nextDraft);
  }, [active, attendance, globalDate]);

  useEffect(() => {
    if (selectedPlayer) {
      setPayAmount(String(selectedPlayer.valor || settings.defaultMonthly));
    }
  }, [selectedPlayer, settings.defaultMonthly]);

  const handleLogin = () =>
    runAction(async () => {
      await signInWithPopup(getFirebaseAuth(), googleProvider);
    });
  const handleLogout = () => runAction(async () => signOut(getFirebaseAuth()));

  const refresh = () => runAction(loadClub, "Datos actualizados.");

  const attendancePlayers = active.filter(
    (player) => (attCategory === "Todas" || player.categoria === attCategory) && player.nombre.toLowerCase().includes(attSearch.toLowerCase())
  );

  const saveAttendance = () =>
    runAction(async () => {
      const token = await getToken();
      await api.saveAttendance(
        token,
        globalDate,
        attendancePlayers.map((player) => ({
          playerId: player.id,
          nombre: player.nombre,
          categoria: player.categoria,
          fecha: globalDate,
          mesNum: monthFromISO(globalDate),
          mes: monthName(monthFromISO(globalDate)),
          estado: attendanceDraft[player.id]?.estado ?? "Presente",
          observacion: attendanceDraft[player.id]?.observacion ?? ""
        }))
      );
      await loadClub();
    }, `Asistencia del ${globalDate} guardada.`);

  const markAll = (estado: AttendanceStatus) => {
    setAttendanceDraft((current) => {
      const next = { ...current };
      attendancePlayers.forEach((player) => {
        next[player.id] = { ...(next[player.id] ?? { observacion: "" }), estado };
      });
      return next;
    });
  };

  const addPayment = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPlayer) {
      setNotice("Selecciona un jugador.");
      return;
    }

    runAction(async () => {
      const token = await getToken();
      await api.createPayment(token, {
        playerId: selectedPlayer.id,
        fecha: globalDate,
        mes: monthName(selectedMonth),
        mesNum: selectedMonth,
        nombre: selectedPlayer.nombre,
        categoria: selectedPlayer.categoria,
        valor: selectedPlayer.valor,
        monto: Number(payAmount || 0),
        metodo: payMethod,
        observacion: payObs
      });
      setPayObs("");
      await loadClub();
    }, "Pago guardado.");
  };

  const removePayment = (payment: Payment) =>
    runAction(async () => {
      if (!window.confirm(`Eliminar pago de ${payment.nombre}?`)) return;
      const token = await getToken();
      await api.deletePayment(token, payment.id);
      await loadClub();
    }, "Pago eliminado.");

  const addPlayer = (event: FormEvent) => {
    event.preventDefault();
    if (!playerDraft.nombre.trim()) {
      setNotice("Escribe el nombre del jugador.");
      return;
    }

    runAction(async () => {
      const token = await getToken();
      await api.createPlayer(token, {
        ...playerDraft,
        valor: Number(playerDraft.valor || categoryValue(playerDraft.categoria, settings))
      });
      setPlayerDraft(emptyPlayerDraft());
      await loadClub();
    }, "Jugador agregado.");
  };

  const updatePlayer = (player: Player, field: keyof Player, value: string) =>
    runAction(async () => {
      const token = await getToken();
      const patch: Partial<Player> = { [field]: field === "valor" || field === "edad" ? Number(value || 0) : value } as Partial<Player>;

      if (field === "categoria") {
        patch.valor = categoryValue(value, settings);
      }

      await api.updatePlayer(token, player.id, patch);
      await loadClub();
    }, "Jugador actualizado.");

  const togglePlayer = (player: Player) =>
    runAction(async () => {
      const token = await getToken();
      await api.updatePlayer(token, player.id, { estado: player.estado === "Inactivo" ? "Activo" : "Inactivo" });
      await loadClub();
    }, "Estado actualizado.");

  const saveDebtTemplate = () =>
    runAction(async () => {
      const token = await getToken();
      await api.updateClubSettings(token, { debtMessageTemplate: debtTemplate });
      await loadClub();
    }, "Plantilla guardada.");

  const saveBackupEmail = () =>
    runAction(async () => {
      const token = await getToken();
      await api.updateClubSettings(token, { backupEmail });
      await loadClub();
    }, "Correo guardado.");

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Texto copiado.");
    } catch {
      window.prompt("Copia el texto:", text);
    }
  };

  const exportBackup = () => {
    const backup = backupFromData(settings, players, payments, attendance);
    download(`backup_voley_${todayISO()}.json`, JSON.stringify(backup, null, 2), "application/json");
  };

  const importBackupObject = (backup: unknown) =>
    runAction(async () => {
      const token = await getToken();
      await api.importBackup(token, backup as never);
      setBackupText("");
      await loadClub();
    }, "Backup importado.");

  const importBackupFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importBackupObject(JSON.parse(String(reader.result || "")));
      } catch (error) {
        setNotice(getFriendlyError(error));
      }
    };
    reader.readAsText(file);
  };

  const rowsForExport = (type: "players" | "payments" | "attendance" | "summary" | "debtors" | "detail") => {
    if (type === "players") {
      return [
        ["Nombre", "RUT", "Categoria", "Genero", "Nacimiento", "Edad", "Telefono", "Emergencia", "Estado", "Valor", "Enfermedad", "Observacion"],
        ...players.map((player) => [
          player.nombre,
          player.rut,
          player.categoria,
          player.genero,
          player.fechaNacimiento,
          player.edad,
          player.telefonoPersonal,
          player.telefonoEmergencia,
          player.estado,
          player.valor,
          player.enfermedad,
          player.observacion
        ])
      ];
    }

    if (type === "payments") {
      return [
        ["Fecha", "Mes", "Nombre", "Categoria", "Valor mensual", "Monto", "Metodo", "Observacion"],
        ...payments.filter((payment) => payment.mesNum === selectedMonth).map((payment) => [payment.fecha, payment.mes, payment.nombre, payment.categoria, payment.valor, payment.monto, payment.metodo, payment.observacion])
      ];
    }

    if (type === "attendance") {
      return [["Fecha", "Mes", "Nombre", "Categoria", "Estado", "Observacion"], ...attendance.map((record) => [record.fecha, record.mes, record.nombre, record.categoria, record.estado, record.observacion])];
    }

    if (type === "detail") {
      return [
        ["Fecha", "Nombre", "Categoria", "Estado", "Observacion"],
        ...attendance.filter((record) => record.fecha === globalDate).map((record) => [record.fecha, record.nombre, record.categoria, record.estado, record.observacion])
      ];
    }

    if (type === "debtors") {
      return [
        ["Nombre", "Categoria", "Pagado", "Deuda", "Estado", "Telefono"],
        ...summary.filter((player) => player.estado !== "Inactivo" && player.deuda > 0).map((player) => [player.nombre, player.categoria, player.pagado, player.deuda, player.estadoPago, player.telefonoPersonal])
      ];
    }

    return [
      ["Nombre", "Categoria", "Estado", "Valor", "Presentes", "Ausentes", "Justificadas", "Tardes", "% Asist.", "Pagado", "Deuda", "Pago"],
      ...summary.map((player) => [player.nombre, player.categoria, player.estado, player.valor, player.presentes, player.ausentes, player.justificadas, player.tardes, player.asistenciaPct, player.pagado, player.deuda, player.estadoPago])
    ];
  };

  const exportCSV = (type: "players" | "payments" | "attendance" | "summary" | "debtors" | "detail") =>
    download(`${type}_${monthName(selectedMonth)}.csv`, csv(rowsForExport(type)), "text/csv;charset=utf-8");

  const exportExcel = () => {
    const sections: Array<[string, Array<Array<string | number>>]> = [
      ["Resumen mensual", rowsForExport("summary")],
      ["Deudores", rowsForExport("debtors")],
      ["Pagos del mes", rowsForExport("payments")],
      ["Asistencia completa", rowsForExport("attendance")],
      ["Jugadores", rowsForExport("players")]
    ];
    const html = `<html><head><meta charset="utf-8"><style>table{border-collapse:collapse;margin-bottom:25px}td,th{border:1px solid #999;padding:6px}th{background:#e8eefc}</style></head><body><h1>Control Club de Voley - ${monthName(
      selectedMonth
    )}</h1>${sections
      .map(([title, rows]) => `<h2>${htmlEscape(title)}</h2><table>${rows.map((row, index) => `<tr>${row.map((cell) => (index === 0 ? `<th>${htmlEscape(cell)}</th>` : `<td>${htmlEscape(cell)}</td>`)).join("")}</tr>`).join("")}</table>`)
      .join("")}</body></html>`;
    download(`control_voley_${monthName(selectedMonth)}.xls`, html, "application/vnd.ms-excel;charset=utf-8");
  };

  const publicRows = publicAttendanceRows(players, attendance, globalDate, publicCategory, publicMode);
  const publicText = publicTextFromRows(publicRows, globalDate, publicCategory);
  const filteredPayments = payments.filter(
    (payment) => payment.mesNum === selectedMonth && `${payment.nombre} ${payment.metodo} ${payment.observacion}`.toLowerCase().includes(paySearch.toLowerCase())
  );
  const filteredSummary = summary.filter((player) => player.nombre.toLowerCase().includes(sumSearch.toLowerCase()));
  const detailRows = attendance
    .filter((record) => record.fecha === globalDate && `${record.nombre} ${record.estado} ${record.observacion}`.toLowerCase().includes(detailSearch.toLowerCase()))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const filteredPlayers = players.filter((player) => `${player.nombre} ${player.rut} ${player.categoria} ${player.estado} ${player.telefonoPersonal}`.toLowerCase().includes(playerSearch.toLowerCase()));
  const debtors = summary
    .filter((player) => player.estado !== "Inactivo" && player.deuda > 0 && `${player.nombre} ${player.categoria} ${player.telefonoPersonal}`.toLowerCase().includes(debtSearch.toLowerCase()))
    .sort((a, b) => b.deuda - a.deuda);

  return (
    <>
      <Head>
        <title>Control Club de Voley</title>
        <meta name="description" content="Control de asistencia, jugadores y mensualidades." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className={styles.appShell}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.brand}>
              <ClipboardList aria-hidden="true" />
              <span>{settings.clubName || "Club de Voley"}</span>
            </div>
            {user ? (
              <div className={styles.headerActions}>
                <button className={styles.iconButton} onClick={refresh} title="Actualizar" disabled={loading}>
                  <RefreshCw aria-hidden="true" />
                </button>
                <button className={styles.iconButton} onClick={handleLogout} title="Cerrar sesion" disabled={loading}>
                  <LogOut aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {!authReady ? <div className={styles.container}><div className={styles.emptyState}>Preparando la app...</div></div> : null}

        {authReady && !user ? (
          <section className={`${styles.container} ${styles.loginPanel}`}>
            <div className={styles.loginIcon}>
              <Users aria-hidden="true" />
            </div>
            <h1>Control Club de Voley</h1>
            <p>Gestiona asistencia, jugadores, pagos y deudores desde celular o laptop.</p>
            <button className={styles.primaryButton} onClick={handleLogin} disabled={loading || Boolean(authError)}>
              Iniciar con Google
            </button>
            {notice ? <p className={styles.errorText}>{notice}</p> : null}
            {authError ? <p className={styles.errorText}>{authError}</p> : null}
          </section>
        ) : null}

        {authReady && user ? (
          <section className={styles.workspace}>
            <div className={styles.topbar}>
              <label>
                Mes
                <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha
                <input type="date" value={globalDate} onChange={(event) => setGlobalDate(event.target.value)} />
              </label>
              <button onClick={exportExcel} disabled={!payload}>
                <FileDown aria-hidden="true" />
                Excel
              </button>
              <button onClick={exportBackup} disabled={!payload}>
                <Download aria-hidden="true" />
                Backup
              </button>
            </div>

            <nav className={styles.tabs} aria-label="Secciones">
              {TABS.map((item) => (
                <button key={item.id} className={tab === item.id ? styles.activeTab : ""} onClick={() => setTab(item.id)}>
                  {item.label}
                </button>
              ))}
            </nav>

            {notice ? <div className={styles.notice}>{notice}</div> : null}
            {!payload && loading ? <div className={styles.emptyState}>Cargando datos del club...</div> : null}

            {payload && tab === "panel" ? (
              <section className={styles.viewStack}>
                <div className={styles.kpiGrid}>
                  <div className={styles.kpi}><span>Jugadores activos</span><strong>{dashboard.activos}</strong><small>{dashboard.totalJugadores} registrados</small></div>
                  <div className={styles.kpi}><span>Recaudado</span><strong>{money(dashboard.totalRecaudado)}</strong><small>{monthName(selectedMonth)}</small></div>
                  <div className={styles.kpi}><span>Deuda</span><strong>{money(dashboard.totalDeuda)}</strong><small>{dashboard.deudores} deudores</small></div>
                  <div className={styles.kpi}><span>Pagados</span><strong>{dashboard.pagados}</strong><small>{dashboard.asistencias} presentes</small></div>
                </div>
                <div className={styles.twoColumn}>
                  <div className={styles.card}>
                    <h2>Resumen mensual</h2>
                    <DataTable headers={["Nombre", "Categoria", "% Asist.", "Pagado", "Deuda", "Pago"]}>
                      {summary.slice(0, 12).map((player) => (
                        <tr key={player.id}>
                          <td>{player.nombre}</td><td>{player.categoria}</td><td className={styles.right}>{player.asistenciaPct}%</td><td className={styles.right}>{money(player.pagado)}</td><td className={styles.right}>{money(player.deuda)}</td><td><StatusPill value={player.estadoPago} /></td>
                        </tr>
                      ))}
                    </DataTable>
                  </div>
                  <div className={styles.card}>
                    <h2>Deudores principales</h2>
                    <DataTable headers={["Nombre", "Categoria", "Deuda"]}>
                      {debtors.slice(0, 12).map((player) => (
                        <tr key={player.id}>
                          <td>{player.nombre}</td><td>{player.categoria}</td><td className={styles.right}>{money(player.deuda)}</td>
                        </tr>
                      ))}
                    </DataTable>
                  </div>
                </div>
              </section>
            ) : null}

            {payload && tab === "attendance" ? (
              <section className={styles.card}>
                <h2>Asistencia</h2>
                <div className={styles.formGrid}>
                  <label>Categoria<SelectCategory value={attCategory} onChange={setAttCategory} includeAll /></label>
                  <label>Buscar jugador<input value={attSearch} onChange={(event) => setAttSearch(event.target.value)} placeholder="Nombre..." /></label>
                  <button className={styles.goodButton} onClick={() => markAll("Presente")}>Todos presente</button>
                  <button className={styles.warnButton} onClick={() => markAll("Ausente")}>Todos ausente</button>
                  <button className={styles.primaryMini} onClick={saveAttendance} disabled={loading}><Save aria-hidden="true" />Guardar</button>
                </div>
                <DataTable headers={["Nombre", "Categoria", "Estado", "Observacion"]}>
                  {attendancePlayers.map((player) => (
                    <tr key={player.id}>
                      <td>{player.nombre}</td>
                      <td>{player.categoria}</td>
                      <td>
                        <select value={attendanceDraft[player.id]?.estado ?? "Presente"} onChange={(event) => setAttendanceDraft((current) => ({ ...current, [player.id]: { ...(current[player.id] ?? { observacion: "" }), estado: event.target.value as AttendanceStatus } }))}>
                          {ATTENDANCE_STATUSES.map((status) => <option key={status}>{status}</option>)}
                        </select>
                      </td>
                      <td><input value={attendanceDraft[player.id]?.observacion ?? ""} onChange={(event) => setAttendanceDraft((current) => ({ ...current, [player.id]: { ...(current[player.id] ?? { estado: "Presente" }), observacion: event.target.value } }))} /></td>
                    </tr>
                  ))}
                </DataTable>
              </section>
            ) : null}

            {payload && tab === "payments" ? (
              <section className={styles.twoColumn}>
                <form className={styles.card} onSubmit={addPayment}>
                  <h2>Registrar pago</h2>
                  <div className={styles.formGrid}>
                    <label>Jugador<select value={payPlayerId} onChange={(event) => setPayPlayerId(event.target.value)}><option value="">Seleccionar</option>{active.map((player) => <option key={player.id} value={player.id}>{player.nombre}</option>)}</select></label>
                    <label>Monto<input type="number" min="0" step="1000" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} /></label>
                    <label>Metodo<select value={payMethod} onChange={(event) => setPayMethod(event.target.value)}><option>Transferencia</option><option>Efectivo</option><option>No informado</option><option>Otro</option></select></label>
                    <label className={styles.wideField}>Observacion<input value={payObs} onChange={(event) => setPayObs(event.target.value)} /></label>
                  </div>
                  <button className={styles.primaryButton} type="submit" disabled={loading}><Save aria-hidden="true" />Guardar pago</button>
                </form>
                <div className={styles.card}>
                  <h2>Pagos del mes</h2>
                  <div className={styles.search}><input value={paySearch} onChange={(event) => setPaySearch(event.target.value)} placeholder="Buscar pago..." /><button onClick={() => exportCSV("payments")}><Download aria-hidden="true" />CSV</button></div>
                  <DataTable headers={["Fecha", "Jugador", "Monto", "Metodo", "Obs.", ""]}>
                    {filteredPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{payment.fecha}</td><td>{payment.nombre}</td><td className={styles.right}>{money(payment.monto)}</td><td>{payment.metodo}</td><td>{payment.observacion}</td><td><button className={styles.tableButton} onClick={() => removePayment(payment)}><Trash2 aria-hidden="true" /></button></td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              </section>
            ) : null}

            {payload && tab === "summary" ? (
              <section className={styles.card}>
                <h2>Resumen mensual</h2>
                <div className={styles.search}><input value={sumSearch} onChange={(event) => setSumSearch(event.target.value)} placeholder="Buscar jugador..." /><button onClick={() => exportCSV("summary")}><Download aria-hidden="true" />Resumen</button><button onClick={() => exportCSV("attendance")}><Download aria-hidden="true" />Asistencia</button></div>
                <DataTable headers={["Nombre", "Categoria", "Estado", "Valor", "Pres.", "Aus.", "Just.", "Tarde", "%", "Pagado", "Deuda", "Pago"]}>
                  {filteredSummary.map((player) => (
                    <tr key={player.id}>
                      <td>{player.nombre}</td><td>{player.categoria}</td><td><StatusPill value={player.estado} /></td><td className={styles.right}>{money(player.valor)}</td><td className={styles.right}>{player.presentes}</td><td className={styles.right}>{player.ausentes}</td><td className={styles.right}>{player.justificadas}</td><td className={styles.right}>{player.tardes}</td><td className={styles.right}>{player.asistenciaPct}%</td><td className={styles.right}>{money(player.pagado)}</td><td className={styles.right}>{money(player.deuda)}</td><td><StatusPill value={player.estadoPago} /></td>
                    </tr>
                  ))}
                </DataTable>
              </section>
            ) : null}

            {payload && tab === "detail" ? (
              <section className={styles.card}>
                <h2>Detalle por fecha</h2>
                <div className={styles.search}><input value={detailSearch} onChange={(event) => setDetailSearch(event.target.value)} placeholder="Nombre o estado..." /><button onClick={() => exportCSV("detail")}><Download aria-hidden="true" />CSV</button></div>
                <DataTable headers={["Fecha", "Nombre", "Categoria", "Estado", "Observacion"]}>
                  {detailRows.map((record) => <tr key={record.id}><td>{record.fecha}</td><td>{record.nombre}</td><td>{record.categoria}</td><td>{record.estado}</td><td>{record.observacion}</td></tr>)}
                </DataTable>
              </section>
            ) : null}

            {payload && tab === "public" ? (
              <section className={styles.card}>
                <h2>Vista jugadores</h2>
                <div className={styles.formGrid}>
                  <label>Categoria<SelectCategory value={publicCategory} onChange={setPublicCategory} includeAll /></label>
                  <label>Mostrar<select value={publicMode} onChange={(event) => setPublicMode(event.target.value as PublicAttendanceMode)}><option value="all">Todos los registros</option><option value="playing">Solo presentes / tarde</option><option value="absent">Solo ausentes / justificados</option></select></label>
                  <button onClick={() => copyText(publicText)}><Copy aria-hidden="true" />Copiar</button>
                  <button className={styles.goodButton} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(publicText)}`, "_blank")}><MessageCircle aria-hidden="true" />WhatsApp</button>
                </div>
                <textarea className={styles.textarea} value={publicText} readOnly />
                <DataTable headers={["Nombre", "Categoria", "Estado", "Observacion"]}>
                  {publicRows.map((row) => <tr key={`${row.nombre}_${row.estado}`}><td>{row.nombre}</td><td>{row.categoria}</td><td>{row.estado}</td><td>{row.observacion}</td></tr>)}
                </DataTable>
              </section>
            ) : null}

            {payload && tab === "players" ? (
              <section className={styles.viewStack}>
                <form className={styles.card} onSubmit={addPlayer}>
                  <h2>Agregar jugador</h2>
                  <div className={styles.formGrid}>
                    <label>Nombre<input value={playerDraft.nombre} onChange={(event) => setPlayerDraft({ ...playerDraft, nombre: event.target.value })} /></label>
                    <label>RUT<input value={playerDraft.rut} onChange={(event) => setPlayerDraft({ ...playerDraft, rut: event.target.value })} /></label>
                    <label>Categoria<SelectCategory value={playerDraft.categoria} onChange={(categoria) => setPlayerDraft({ ...playerDraft, categoria, valor: String(categoryValue(categoria, settings)), genero: categoria.startsWith("Femenino") ? "Femenino" : categoria.startsWith("Masculino") ? "Masculino" : "No informado" })} /></label>
                    <label>Genero<select value={playerDraft.genero} onChange={(event) => setPlayerDraft({ ...playerDraft, genero: event.target.value })}><option>Femenino</option><option>Masculino</option><option>Otro</option><option>No informado</option></select></label>
                    <label>Nacimiento<input type="date" value={playerDraft.fechaNacimiento} onChange={(event) => setPlayerDraft({ ...playerDraft, fechaNacimiento: event.target.value })} /></label>
                    <label>Edad<input type="number" value={playerDraft.edad} onChange={(event) => setPlayerDraft({ ...playerDraft, edad: event.target.value })} /></label>
                    <label>Telefono<input value={playerDraft.telefonoPersonal} onChange={(event) => setPlayerDraft({ ...playerDraft, telefonoPersonal: event.target.value })} /></label>
                    <label>Emergencia<input value={playerDraft.telefonoEmergencia} onChange={(event) => setPlayerDraft({ ...playerDraft, telefonoEmergencia: event.target.value })} /></label>
                    <label>Estado<select value={playerDraft.estado} onChange={(event) => setPlayerDraft({ ...playerDraft, estado: event.target.value as PlayerDraft["estado"] })}><option>Activo</option><option>Pausado</option><option>Inactivo</option></select></label>
                    <label>Valor<input type="number" value={playerDraft.valor} onChange={(event) => setPlayerDraft({ ...playerDraft, valor: event.target.value })} /></label>
                    <label>Enfermedad<input value={playerDraft.enfermedad} onChange={(event) => setPlayerDraft({ ...playerDraft, enfermedad: event.target.value })} /></label>
                    <label>Observacion<input value={playerDraft.observacion} onChange={(event) => setPlayerDraft({ ...playerDraft, observacion: event.target.value })} /></label>
                  </div>
                  <button className={styles.primaryButton} type="submit"><UserPlus aria-hidden="true" />Agregar jugador</button>
                </form>
                <div className={styles.card}>
                  <div className={styles.search}><input value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Buscar jugador..." /><button onClick={() => exportCSV("players")}><Download aria-hidden="true" />CSV</button></div>
                  <DataTable headers={["Nombre", "RUT", "Categoria", "Genero", "Nacimiento", "Edad", "Telefono", "Emergencia", "Estado", "Valor", "Enfermedad", "Observacion", ""]}>
                    {filteredPlayers.map((player) => (
                      <tr key={player.id}>
                        <td><input className={styles.miniInput} defaultValue={player.nombre} onBlur={(event) => event.target.value !== player.nombre && updatePlayer(player, "nombre", event.target.value)} /></td>
                        <td><input className={styles.miniInput} defaultValue={player.rut} onBlur={(event) => event.target.value !== player.rut && updatePlayer(player, "rut", event.target.value)} /></td>
                        <td><select className={styles.miniSelect} defaultValue={player.categoria} onChange={(event) => updatePlayer(player, "categoria", event.target.value)}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></td>
                        <td><select className={styles.miniSelect} defaultValue={player.genero} onChange={(event) => updatePlayer(player, "genero", event.target.value)}><option>Femenino</option><option>Masculino</option><option>Otro</option><option>No informado</option></select></td>
                        <td><input className={styles.miniInput} type="date" defaultValue={player.fechaNacimiento} onBlur={(event) => event.target.value !== player.fechaNacimiento && updatePlayer(player, "fechaNacimiento", event.target.value)} /></td>
                        <td><input className={styles.miniInput} type="number" defaultValue={player.edad} onBlur={(event) => String(event.target.value) !== String(player.edad) && updatePlayer(player, "edad", event.target.value)} /></td>
                        <td><input className={styles.miniInput} defaultValue={player.telefonoPersonal} onBlur={(event) => event.target.value !== player.telefonoPersonal && updatePlayer(player, "telefonoPersonal", event.target.value)} /></td>
                        <td><input className={styles.miniInput} defaultValue={player.telefonoEmergencia} onBlur={(event) => event.target.value !== player.telefonoEmergencia && updatePlayer(player, "telefonoEmergencia", event.target.value)} /></td>
                        <td><select className={styles.miniSelect} defaultValue={player.estado} onChange={(event) => updatePlayer(player, "estado", event.target.value)}><option>Activo</option><option>Pausado</option><option>Inactivo</option></select></td>
                        <td><input className={styles.miniInput} type="number" defaultValue={player.valor} onBlur={(event) => Number(event.target.value) !== Number(player.valor) && updatePlayer(player, "valor", event.target.value)} /></td>
                        <td><input className={styles.miniInput} defaultValue={player.enfermedad} onBlur={(event) => event.target.value !== player.enfermedad && updatePlayer(player, "enfermedad", event.target.value)} /></td>
                        <td><input className={styles.miniInput} defaultValue={player.observacion} onBlur={(event) => event.target.value !== player.observacion && updatePlayer(player, "observacion", event.target.value)} /></td>
                        <td><button className={styles.tableButton} onClick={() => togglePlayer(player)}>{player.estado === "Inactivo" ? "Activar" : "Inactivar"}</button></td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              </section>
            ) : null}

            {payload && tab === "debtors" ? (
              <section className={styles.viewStack}>
                <div className={styles.card}>
                  <h2>Mensaje de deuda</h2>
                  <textarea className={styles.textarea} value={debtTemplate} onChange={(event) => setDebtTemplate(event.target.value)} />
                  <div className={styles.search}><button className={styles.primaryMini} onClick={saveDebtTemplate}><Save aria-hidden="true" />Guardar plantilla</button><button onClick={() => setDebtTemplate(DEFAULT_SETTINGS.debtMessageTemplate)}>Restaurar mensaje base</button></div>
                </div>
                <div className={styles.card}>
                  <div className={styles.search}><input value={debtSearch} onChange={(event) => setDebtSearch(event.target.value)} placeholder="Buscar deudor..." /><button onClick={() => exportCSV("debtors")}><Download aria-hidden="true" />CSV</button></div>
                  <DataTable headers={["Nombre", "Categoria", "Pagado", "Deuda", "Estado", "Telefono", "Mensaje", ""]}>
                    {debtors.map((player) => {
                      const message = messageForDebtor(player, { ...settings, debtMessageTemplate: debtTemplate }, selectedMonth);
                      const phone = normalizePhone(player.telefonoPersonal);
                      return (
                        <tr key={player.id}>
                          <td>{player.nombre}</td><td>{player.categoria}</td><td className={styles.right}>{money(player.pagado)}</td><td className={styles.right}>{money(player.deuda)}</td><td><StatusPill value={player.estadoPago} /></td><td>{player.telefonoPersonal || "Sin telefono"}</td><td><textarea className={styles.miniTextarea} defaultValue={message} id={`msg_${player.id}`} /></td><td><div className={styles.rowActions}><button className={styles.tableButton} onClick={() => copyText((document.getElementById(`msg_${player.id}`) as HTMLTextAreaElement | null)?.value || message)}><Copy aria-hidden="true" /></button><button className={styles.tableButton} onClick={() => phone ? window.open(`https://wa.me/${phone}?text=${encodeURIComponent((document.getElementById(`msg_${player.id}`) as HTMLTextAreaElement | null)?.value || message)}`, "_blank") : setNotice("Este jugador no tiene telefono personal.")}><MessageCircle aria-hidden="true" /></button></div></td>
                        </tr>
                      );
                    })}
                  </DataTable>
                </div>
              </section>
            ) : null}

            {payload && tab === "backup" ? (
              <section className={styles.twoColumn}>
                <div className={styles.card}>
                  <h2>Backup JSON</h2>
                  <div className={styles.search}><button className={styles.primaryMini} onClick={exportBackup}><Download aria-hidden="true" />Descargar</button><button onClick={() => copyText(JSON.stringify(backupFromData(settings, players, payments, attendance), null, 2))}><Copy aria-hidden="true" />Copiar JSON</button></div>
                  <label>Correo de respaldo<input value={backupEmail} onChange={(event) => setBackupEmail(event.target.value)} placeholder="correo@ejemplo.com" /></label>
                  <div className={styles.search}><button onClick={saveBackupEmail}><Save aria-hidden="true" />Guardar correo</button><button onClick={() => window.location.href = `mailto:${backupEmail}?subject=${encodeURIComponent("Backup control club de voley " + todayISO())}&body=${encodeURIComponent("Adjunto/pego el backup JSON generado el " + todayISO() + ".")}`}>Abrir correo</button></div>
                </div>
                <div className={styles.card}>
                  <h2>Importar backup</h2>
                  <label className={styles.fileInput}><Upload aria-hidden="true" />Importar archivo JSON<input type="file" accept="application/json" onChange={(event) => importBackupFile(event.target.files?.[0] ?? null)} /></label>
                  <textarea className={styles.textarea} value={backupText} onChange={(event) => setBackupText(event.target.value)} placeholder="Pega aqui el contenido del backup JSON..." />
                  <button className={styles.primaryButton} onClick={() => importBackupObject(JSON.parse(backupText))} disabled={!backupText.trim()}><Upload aria-hidden="true" />Importar JSON pegado</button>
                </div>
              </section>
            ) : null}
          </section>
        ) : null}
      </main>
    </>
  );
}

function SelectCategory<T extends PlayerCategory | "Todas">({ value, onChange, includeAll = false }: { value: T; onChange: (value: T) => void; includeAll?: boolean }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as T)}>
      {includeAll ? <option value="Todas">Todas</option> : null}
      {CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </select>
  );
}

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className={styles.tableWrap}>
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{hasRows ? children : <tr><td className={styles.center} colSpan={headers.length}>Sin datos para mostrar</td></tr>}</tbody>
      </table>
    </div>
  );
}

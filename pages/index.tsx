import Head from "next/head";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import {
  BarChart3,
  CalendarCheck,
  Check,
  ChevronLeft,
  ClipboardList,
  Edit3,
  LogOut,
  Plus,
  Trash2,
  UserPlus,
  Users
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/client/api";
import { getFirebaseAuth, googleProvider } from "../lib/client/firebase";
import type { Group, GroupSummary, Member } from "../types/domain";
import styles from "../styles/Home.module.css";

type View = "groups" | "detail" | "attendance" | "summary";

function todayInputValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function getFriendlyError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";

  if (code === "auth/operation-not-allowed") {
    return "Google no esta habilitado como proveedor. En Firebase Console activa Authentication > Sign-in method > Google.";
  }

  if (code === "auth/configuration-not-found") {
    return "Firebase Auth no esta configurado para este proyecto. En Firebase Console entra a Authentication, presiona Comenzar y habilita Google como proveedor.";
  }

  if (code === "auth/unauthorized-domain") {
    return "Este dominio no esta autorizado en Firebase Auth. Agrega localhost y 127.0.0.1 en Authentication > Settings > Authorized domains.";
  }

  if (code === "auth/popup-blocked") {
    return "El navegador bloqueo la ventana de Google. Permite ventanas emergentes para esta pagina.";
  }

  if (code === "auth/popup-closed-by-user") {
    return "La ventana de Google se cerro antes de completar el inicio de sesion.";
  }

  return error instanceof Error ? error.message : "No se pudo completar la accion.";
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [view, setView] = useState<View>("groups");
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(todayInputValue());
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const activeMembers = useMemo(() => members.filter((member) => member.active), [members]);

  const getToken = useCallback(async () => {
    if (!user) {
      throw new Error("Debes iniciar sesion.");
    }

    return user.getIdToken();
  }, [user]);

  const runAction = useCallback(async (action: () => Promise<void>, success?: string) => {
    setLoading(true);
    setNotice("");

    try {
      await action();
      if (success) {
        setNotice(success);
      }
    } catch (error) {
      setNotice(getFriendlyError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    if (!user) return;

    const token = await getToken();
    const payload = await api.listGroups(token);
    setGroups(payload.groups);
  }, [getToken, user]);

  const loadMembers = useCallback(async (groupId: string) => {
    const token = await getToken();
    const payload = await api.listMembers(token, groupId);
    setMembers(payload.members);
  }, [getToken]);

  const openGroup = useCallback(async (group: Group) => {
    setSelectedGroup(group);
    setSummary(null);
    setView("detail");
    await runAction(async () => {
      await loadMembers(group.id);
    });
  }, [loadMembers, runAction]);

  const goGroups = useCallback(async () => {
    setSelectedGroup(null);
    setMembers([]);
    setSummary(null);
    setView("groups");
    await runAction(loadGroups);
  }, [loadGroups, runAction]);

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
      runAction(loadGroups);
    } else {
      setGroups([]);
      setMembers([]);
      setSelectedGroup(null);
      setView("groups");
    }
  }, [loadGroups, runAction, user]);

  const handleLogin = async () => {
    await runAction(async () => {
      const auth = getFirebaseAuth();
      await signInWithPopup(auth, googleProvider);
    });
  };

  const handleLogout = async () => {
    await runAction(async () => {
      await signOut(getFirebaseAuth());
    });
  };

  const handleCreateGroup = async (event: FormEvent) => {
    event.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;

    await runAction(async () => {
      const token = await getToken();
      const payload = await api.createGroup(token, name);
      setGroups((current) => [payload.group, ...current]);
      setNewGroupName("");
    }, "Grupo creado.");
  };

  const handleRenameGroup = async () => {
    if (!selectedGroup) return;
    const name = window.prompt("Nuevo nombre del grupo", selectedGroup.name)?.trim();
    if (!name || name === selectedGroup.name) return;

    await runAction(async () => {
      const token = await getToken();
      const payload = await api.updateGroup(token, selectedGroup.id, name);
      setSelectedGroup(payload.group);
      setGroups((current) => current.map((group) => (group.id === payload.group.id ? payload.group : group)));
    }, "Grupo actualizado.");
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;
    const confirmed = window.confirm(`Eliminar "${selectedGroup.name}" y todo su historial?`);
    if (!confirmed) return;

    await runAction(async () => {
      const token = await getToken();
      await api.deleteGroup(token, selectedGroup.id);
      await goGroups();
    }, "Grupo eliminado.");
  };

  const handleCreateMember = async (event: FormEvent) => {
    event.preventDefault();
    const name = newMemberName.trim();
    if (!selectedGroup || !name) return;

    await runAction(async () => {
      const token = await getToken();
      const payload = await api.createMember(token, selectedGroup.id, name);
      setMembers((current) => [...current, payload.member]);
      setNewMemberName("");
    }, "Integrante agregado.");
  };

  const handleRenameMember = async (member: Member) => {
    if (!selectedGroup) return;
    const name = window.prompt("Nuevo nombre del integrante", member.name)?.trim();
    if (!name || name === member.name) return;

    await runAction(async () => {
      const token = await getToken();
      const payload = await api.updateMember(token, selectedGroup.id, member.id, name);
      setMembers((current) => current.map((item) => (item.id === payload.member.id ? payload.member : item)));
    }, "Integrante actualizado.");
  };

  const handleDeactivateMember = async (member: Member) => {
    if (!selectedGroup) return;
    const confirmed = window.confirm(`Desactivar a "${member.name}"? Su historial se conservara.`);
    if (!confirmed) return;

    await runAction(async () => {
      const token = await getToken();
      const payload = await api.deactivateMember(token, selectedGroup.id, member.id);
      setMembers((current) => current.map((item) => (item.id === payload.member.id ? payload.member : item)));
    }, "Integrante desactivado.");
  };

  const openAttendance = async () => {
    if (!selectedGroup) return;
    setView("attendance");

    await runAction(async () => {
      const token = await getToken();
      const payload = await api.getSession(token, selectedGroup.id, attendanceDate);
      const baseline = activeMembers.reduce<Record<string, boolean>>((acc, member) => {
        acc[member.id] = payload.attendance?.[member.id] ?? true;
        return acc;
      }, {});
      setAttendance(baseline);
    });
  };

  const handleAttendanceDateChange = async (date: string) => {
    setAttendanceDate(date);
    if (!selectedGroup || view !== "attendance") return;

    await runAction(async () => {
      const token = await getToken();
      const payload = await api.getSession(token, selectedGroup.id, date);
      setAttendance(
        activeMembers.reduce<Record<string, boolean>>((acc, member) => {
          acc[member.id] = payload.attendance?.[member.id] ?? true;
          return acc;
        }, {})
      );
    });
  };

  const handleSaveAttendance = async () => {
    if (!selectedGroup) return;

    await runAction(async () => {
      const token = await getToken();
      await api.saveSession(token, selectedGroup.id, attendanceDate, attendance);
      setView("detail");
    }, `Asistencia del ${attendanceDate} guardada.`);
  };

  const openSummary = async () => {
    if (!selectedGroup) return;
    setView("summary");

    await runAction(async () => {
      const token = await getToken();
      const payload = await api.getSummary(token, selectedGroup.id);
      setSummary(payload.summary);
    });
  };

  return (
    <>
      <Head>
        <title>Control de Asistencia</title>
        <meta name="description" content="App para registrar asistencia de equipos y grupos." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className={styles.appShell}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.brand}>
              <ClipboardList aria-hidden="true" />
              <span>Control de Asistencia</span>
            </div>
            {user ? (
              <button className={styles.iconButton} onClick={handleLogout} title="Cerrar sesion" disabled={loading}>
                <LogOut aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </header>

        <section className={styles.container}>
          {!authReady ? <div className={styles.emptyState}>Preparando la app...</div> : null}

          {authReady && !user ? (
            <section className={styles.loginPanel}>
              <div className={styles.loginIcon}>
                <Users aria-hidden="true" />
              </div>
              <h1>Organiza tus grupos sin planillas sueltas</h1>
              <p>Crea grupos, registra asistencia por fecha y revisa porcentajes desde el celular.</p>
              <button className={styles.primaryButton} onClick={handleLogin} disabled={loading || Boolean(authError)}>
                Iniciar con Google
              </button>
              {notice ? <p className={styles.errorText}>{notice}</p> : null}
              {authError ? <p className={styles.errorText}>{authError}</p> : null}
            </section>
          ) : null}

          {authReady && user ? (
            <>
              {notice ? <div className={styles.notice}>{notice}</div> : null}

              {view === "groups" ? (
                <section className={styles.viewStack}>
                  <div className={styles.userStrip}>
                    <div>
                      <span>Sesion activa</span>
                      <strong>{user.displayName ?? user.email}</strong>
                    </div>
                  </div>

                  <form className={styles.formPanel} onSubmit={handleCreateGroup}>
                    <label htmlFor="newGroupName">Crear nuevo grupo</label>
                    <div className={styles.inputRow}>
                      <input
                        id="newGroupName"
                        type="text"
                        placeholder="Ej: Equipo Voleibol A"
                        value={newGroupName}
                        onChange={(event) => setNewGroupName(event.target.value)}
                        disabled={loading}
                      />
                      <button className={styles.squareButton} type="submit" title="Crear grupo" disabled={loading}>
                        <Plus aria-hidden="true" />
                      </button>
                    </div>
                  </form>

                  <div className={styles.sectionTitle}>
                    <Users aria-hidden="true" />
                    <span>Mis grupos</span>
                  </div>

                  {groups.length === 0 ? (
                    <div className={styles.emptyState}>No hay grupos creados.</div>
                  ) : (
                    <div className={styles.list}>
                      {groups.map((group) => (
                        <button className={styles.listItem} key={group.id} onClick={() => openGroup(group)} disabled={loading}>
                          <span>{group.name}</span>
                          <strong>Abrir</strong>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

              {view === "detail" && selectedGroup ? (
                <section className={styles.viewStack}>
                  <div className={styles.navBar}>
                    <button className={styles.textButton} onClick={goGroups} disabled={loading}>
                      <ChevronLeft aria-hidden="true" />
                      Volver
                    </button>
                    <div className={styles.navActions}>
                      <button className={styles.iconButtonLight} onClick={handleRenameGroup} title="Editar grupo" disabled={loading}>
                        <Edit3 aria-hidden="true" />
                      </button>
                      <button className={styles.iconButtonDanger} onClick={handleDeleteGroup} title="Eliminar grupo" disabled={loading}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className={styles.titleBlock}>
                    <span>Grupo</span>
                    <h1>{selectedGroup.name}</h1>
                  </div>

                  <div className={styles.actionGrid}>
                    <button className={styles.primaryButton} onClick={openAttendance} disabled={loading || activeMembers.length === 0}>
                      <CalendarCheck aria-hidden="true" />
                      Pasar asistencia
                    </button>
                    <button className={styles.secondaryButton} onClick={openSummary} disabled={loading}>
                      <BarChart3 aria-hidden="true" />
                      Ver resumen
                    </button>
                  </div>

                  <form className={styles.formPanel} onSubmit={handleCreateMember}>
                    <label htmlFor="newMemberName">Agregar integrante</label>
                    <div className={styles.inputRow}>
                      <input
                        id="newMemberName"
                        type="text"
                        placeholder="Nombre de la persona"
                        value={newMemberName}
                        onChange={(event) => setNewMemberName(event.target.value)}
                        disabled={loading}
                      />
                      <button className={styles.squareButton} type="submit" title="Agregar integrante" disabled={loading}>
                        <UserPlus aria-hidden="true" />
                      </button>
                    </div>
                  </form>

                  <div className={styles.sectionTitle}>
                    <Users aria-hidden="true" />
                    <span>Integrantes ({activeMembers.length})</span>
                  </div>

                  {members.length === 0 ? (
                    <div className={styles.emptyState}>Agrega integrantes para pasar lista.</div>
                  ) : (
                    <div className={styles.list}>
                      {members.map((member) => (
                        <div className={`${styles.memberItem} ${!member.active ? styles.inactiveItem : ""}`} key={member.id}>
                          <div>
                            <strong>{member.name}</strong>
                            {!member.active ? <span>Desactivado</span> : null}
                          </div>
                          {member.active ? (
                            <div className={styles.navActions}>
                              <button className={styles.iconButtonLight} onClick={() => handleRenameMember(member)} title="Editar integrante" disabled={loading}>
                                <Edit3 aria-hidden="true" />
                              </button>
                              <button
                                className={styles.iconButtonDanger}
                                onClick={() => handleDeactivateMember(member)}
                                title="Desactivar integrante"
                                disabled={loading}
                              >
                                <Trash2 aria-hidden="true" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

              {view === "attendance" && selectedGroup ? (
                <section className={styles.viewStack}>
                  <div className={styles.navBar}>
                    <button className={styles.textButton} onClick={() => setView("detail")} disabled={loading}>
                      <ChevronLeft aria-hidden="true" />
                      Cancelar
                    </button>
                    <strong>Asistencia</strong>
                  </div>

                  <div className={styles.formPanel}>
                    <label htmlFor="attendanceDate">Fecha</label>
                    <input
                      id="attendanceDate"
                      type="date"
                      value={attendanceDate}
                      onChange={(event) => handleAttendanceDateChange(event.target.value)}
                      disabled={loading}
                    />
                  </div>

                  {activeMembers.length === 0 ? (
                    <div className={styles.emptyState}>No hay integrantes activos.</div>
                  ) : (
                    <div className={styles.checklist}>
                      {activeMembers.map((member) => (
                        <label className={styles.checkRow} key={member.id}>
                          <span>{member.name}</span>
                          <input
                            type="checkbox"
                            checked={attendance[member.id] ?? true}
                            onChange={(event) => setAttendance((current) => ({ ...current, [member.id]: event.target.checked }))}
                            disabled={loading}
                          />
                        </label>
                      ))}
                    </div>
                  )}

                  <button className={styles.primaryButton} onClick={handleSaveAttendance} disabled={loading || activeMembers.length === 0}>
                    <Check aria-hidden="true" />
                    Guardar asistencia
                  </button>
                </section>
              ) : null}

              {view === "summary" && selectedGroup ? (
                <section className={styles.viewStack}>
                  <div className={styles.navBar}>
                    <button className={styles.textButton} onClick={() => setView("detail")} disabled={loading}>
                      <ChevronLeft aria-hidden="true" />
                      Volver
                    </button>
                    <strong>Resumen</strong>
                  </div>

                  <div className={styles.summaryHeader}>
                    <span>Total de fechas</span>
                    <strong>{summary?.totalSessions ?? 0}</strong>
                  </div>

                  {!summary || summary.totalSessions === 0 ? (
                    <div className={styles.emptyState}>No hay asistencias registradas aun.</div>
                  ) : (
                    <div className={styles.list}>
                      {summary.members.map((member) => (
                        <div className={`${styles.summaryRow} ${!member.active ? styles.inactiveItem : ""}`} key={member.memberId}>
                          <div>
                            <strong>{member.name}</strong>
                            {!member.active ? <span>Desactivado</span> : null}
                          </div>
                          <span>
                            {member.attended} asistencias ({member.percentage}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}
            </>
          ) : null}
        </section>
      </main>
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Attendance, EventRow, Participant } from "@/lib/types";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
  TextRun
} from "docx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const formatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta"
});

function formatDate(value: string) {
  return formatter.format(new Date(`${value.slice(0, 10)}T00:00:00+07:00`));
}

function eventStatus(event: EventRow): [string, "yellow" | "green" | "gray"] {
  const now = Date.now();
  const open = new Date(event.open_at).getTime();
  const close = new Date(event.close_at).getTime();
  if (Number.isNaN(open) || Number.isNaN(close)) return ["Jadwal tidak valid", "gray"];
  if (now < open) return ["Belum dibuka", "yellow"];
  if (now >= close) return ["Selesai", "gray"];
  return ["Sedang dibuka", "green"];
}

function toInputDateTime(value: string) {
  const d = new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function toIso(value: string) {
  return new Date(value).toISOString();
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 500);
}

export default function AdminPage() {
  const demo = !isSupabaseConfigured;
  const [session, setSession] = useState<unknown>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState("overview");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [participantQuery, setParticipantQuery] = useState("");
  const [participantForm, setParticipantForm] = useState({ id: "", full_name: "", address: "" });
  const [eventForm, setEventForm] = useState({
    id: "",
    name: "",
    event_date: "",
    location: "",
    open_at: "",
    close_at: "",
    is_active: true
  });

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const loadData = useCallback(async () => {
    setError("");
    if (demo || !supabase) {
      const es: EventRow[] = JSON.parse(localStorage.getItem("demo_events_v2") || "[]");
      const ps: Participant[] = JSON.parse(localStorage.getItem("demo_participants_v2") || "[]");
      const ats: any[] = JSON.parse(localStorage.getItem("demo_attendance_v2") || "[]");
      const normalizedEvents = es.length ? es : [{
        id: "demo-event",
        name: "Pertemuan Lansia",
        event_date: "2026-09-25",
        location: "Gunungkidul, Yogyakarta",
        open_at: "2026-09-25T06:00:00+07:00",
        close_at: "2026-09-25T08:00:00+07:00",
        is_active: true,
        created_at: new Date().toISOString()
      }];
      const normalizedParticipants = ps.length ? ps : [
        ["Aulia Barokah", "Getas, Playen, Gunungkidul"],
        ["Budi Santoso", "Getas, Playen, Gunungkidul"],
        ["Dewi Lestari", "Getas, Playen, Gunungkidul"],
        ["Jumilah", "Getas, Playen, Gunungkidul"],
        ["Siti Aminah", "Getas, Playen, Gunungkidul"],
        ["Sri Wahyuni", "Getas, Playen, Gunungkidul"]
      ].map(([full_name, address], i) => ({
        id: `demo-${i + 1}`,
        full_name,
        address,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      if (!es.length) localStorage.setItem("demo_events_v2", JSON.stringify(normalizedEvents));
      if (!ps.length) localStorage.setItem("demo_participants_v2", JSON.stringify(normalizedParticipants));

      setEvents(normalizedEvents);
      setParticipants(normalizedParticipants);
      const active = normalizedEvents.find((item) => item.is_active) || normalizedEvents[0];
      const eventId = selectedEventId || active?.id || "";
      if (!selectedEventId && eventId) setSelectedEventId(eventId);
      setAttendance(
        ats
          .filter((item) => item.event_id === eventId)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((item) => ({ ...item, participant: normalizedParticipants.find((p) => p.id === item.participant_id) }))
      );
      return;
    }

    const [{ data: es, error: e1 }, { data: ps, error: e2 }] = await Promise.all([
      supabase.from("events").select("*").order("event_date", { ascending: false }),
      supabase.from("participants").select("*").order("full_name")
    ]);

    if (e1 || e2) setError((e1 || e2)?.message || "Gagal mengambil data.");
    const nextEvents = (es || []) as EventRow[];
    const nextParticipants = (ps || []) as Participant[];
    setEvents(nextEvents);
    setParticipants(nextParticipants);

    const targetId = selectedEventId || nextEvents.find((e) => e.is_active)?.id || nextEvents[0]?.id || "";
    if (!selectedEventId && targetId) setSelectedEventId(targetId);

    if (targetId) {
      const { data: ats, error: aError } = await supabase
        .from("attendance")
        .select("id,event_id,participant_id,created_at,participant:participants(id,full_name,address)")
        .eq("event_id", targetId)
        .order("created_at", { ascending: true });
      if (aError) setError(aError.message);
      const normalizedAttendance = (ats || []).map((entry) => ({
        ...entry,
        participant: Array.isArray(entry.participant)
          ? entry.participant[0]
          : entry.participant
      }));
      setAttendance(normalizedAttendance as unknown as Attendance[]);
    } else {
      setAttendance([]);
    }
  }, [demo, selectedEventId]);

  useEffect(() => {
    (async () => {
      if (demo || !supabase) {
        setSession({ demo: true });
        setCheckingAuth(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setCheckingAuth(false);
    })();
  }, [demo]);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoginError("");
    if (demo) {
      setSession({ demo: true });
      return;
    }
    if (!supabase) return;
    const { data, error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
    if (loginErr) {
      setLoginError(loginErr.message);
      return;
    }
    const { data: allowed, error: adminErr } = await supabase.rpc("is_admin");
    if (adminErr || !allowed) {
      await supabase.auth.signOut();
      setLoginError("Akun ini belum terdaftar sebagai admin.");
      return;
    }
    setSession(data.session);
  }

  async function logout() {
    if (supabase && !demo) await supabase.auth.signOut();
    setSession(null);
  }

  function resetParticipant() {
    setParticipantForm({ id: "", full_name: "", address: "" });
  }

  async function saveParticipant(e: React.FormEvent) {
    e.preventDefault();
    const full_name = participantForm.full_name.trim().replace(/\s+/g, " ");
    const address = participantForm.address.trim();
    if (!full_name) {
      showToast("Nama lengkap wajib diisi.");
      return;
    }

    const duplicate = participants.some(
      (p) => p.id !== participantForm.id && p.is_active && p.full_name.trim().replace(/\s+/g, " ").toLowerCase() === full_name.toLowerCase()
    );
    if (duplicate) {
      showToast("Peserta dengan nama tersebut sudah ada.");
      return;
    }

    if (demo || !supabase) {
      const next = [...participants];
      if (participantForm.id) {
        const index = next.findIndex((p) => p.id === participantForm.id);
        if (index >= 0) next[index] = { ...next[index], full_name, address, updated_at: new Date().toISOString() };
      } else {
        next.push({
          id: crypto.randomUUID?.() || String(Date.now()),
          full_name,
          address,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      localStorage.setItem("demo_participants_v2", JSON.stringify(next));
      setParticipants(next);
      resetParticipant();
      showToast("Peserta tersimpan.");
      return;
    }

    const payload = { full_name, address, is_active: true, updated_at: new Date().toISOString() };
    const result = participantForm.id
      ? await supabase.from("participants").update(payload).eq("id", participantForm.id)
      : await supabase.from("participants").insert(payload);

    if (result.error) {
      showToast(result.error.message);
      return;
    }
    await loadData();
    resetParticipant();
    showToast("Peserta tersimpan.");
  }

  function editParticipant(participant: Participant) {
    setParticipantForm({ id: participant.id, full_name: participant.full_name, address: participant.address });
    setTab("participants");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deactivateParticipant(id: string) {
    if (!window.confirm("Nonaktifkan peserta ini? Riwayat kehadirannya tetap disimpan.")) return;
    if (demo || !supabase) {
      const next = participants.map((p) => p.id === id ? { ...p, is_active: false, updated_at: new Date().toISOString() } : p);
      localStorage.setItem("demo_participants_v2", JSON.stringify(next));
      setParticipants(next);
      showToast("Peserta dinonaktifkan.");
      return;
    }
    const { error: updateError } = await supabase.from("participants").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
    if (updateError) showToast(updateError.message);
    else {
      await loadData();
      showToast("Peserta dinonaktifkan.");
    }
  }

  function resetEvent() {
    setEventForm({ id: "", name: "", event_date: "", location: "", open_at: "", close_at: "", is_active: true });
  }

  function editEvent(event: EventRow) {
    setEventForm({
      id: event.id,
      name: event.name,
      event_date: event.event_date,
      location: event.location,
      open_at: toInputDateTime(event.open_at),
      close_at: toInputDateTime(event.close_at),
      is_active: event.is_active
    });
    setTab("events");
  }

  async function saveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!eventForm.name.trim() || !eventForm.event_date || !eventForm.location.trim() || !eventForm.open_at || !eventForm.close_at) {
      showToast("Lengkapi semua data kegiatan.");
      return;
    }
    if (new Date(eventForm.close_at) <= new Date(eventForm.open_at)) {
      showToast("Waktu tutup harus setelah waktu mulai.");
      return;
    }

    if (demo || !supabase) {
      let next = [...events];
      const row: EventRow = {
        id: eventForm.id || crypto.randomUUID?.() || String(Date.now()),
        name: eventForm.name.trim(),
        event_date: eventForm.event_date,
        location: eventForm.location.trim(),
        open_at: toIso(eventForm.open_at),
        close_at: toIso(eventForm.close_at),
        is_active: eventForm.is_active,
        created_at: new Date().toISOString()
      };
      if (row.is_active) next = next.map((x) => ({ ...x, is_active: false }));
      const index = next.findIndex((x) => x.id === row.id);
      if (index >= 0) next[index] = row;
      else next.unshift(row);
      localStorage.setItem("demo_events_v2", JSON.stringify(next));
      setEvents(next);
      setSelectedEventId(row.id);
      resetEvent();
      showToast("Kegiatan tersimpan.");
      return;
    }

    if (eventForm.is_active) {
      const { error: clearError } = await supabase.from("events").update({ is_active: false }).eq("is_active", true);
      if (clearError) {
        showToast(clearError.message);
        return;
      }
    }

    const payload = {
      name: eventForm.name.trim(),
      event_date: eventForm.event_date,
      location: eventForm.location.trim(),
      open_at: toIso(eventForm.open_at),
      close_at: toIso(eventForm.close_at),
      is_active: eventForm.is_active
    };

    const result = eventForm.id
      ? await supabase.from("events").update(payload).eq("id", eventForm.id)
      : await supabase.from("events").insert(payload);
    if (result.error) {
      showToast(result.error.message);
      return;
    }
    await loadData();
    resetEvent();
    showToast("Kegiatan tersimpan.");
  }

async function deleteEvent(event: EventRow) {
  const confirmed = window.confirm(
    `Hapus kegiatan "${event.name}"?\n\nData kehadiran untuk kegiatan ini juga akan dihapus dan tidak bisa dikembalikan.`
  );

  if (!confirmed) return;

  if (demo || !supabase) {
    const next = events.filter((x) => x.id !== event.id);

    localStorage.setItem("demo_events_v2", JSON.stringify(next));
    localStorage.setItem(
      "demo_attendance_v2",
      JSON.stringify(
        JSON.parse(localStorage.getItem("demo_attendance_v2") || "[]")
          .filter((x: any) => x.event_id !== event.id)
      )
    );

    setEvents(next);

    if (selectedEventId === event.id) {
      setSelectedEventId(next[0]?.id || "");
    }

    showToast("Kegiatan berhasil dihapus.");
    return;
  }

  const { error: deleteError } = await supabase
    .from("events")
    .delete()
    .eq("id", event.id);

  if (deleteError) {
    showToast(deleteError.message);
    return;
  }

  await loadData();

  if (selectedEventId === event.id) {
    setSelectedEventId("");
  }

  showToast("Kegiatan berhasil dihapus.");
}

  async function toggleEvent(event: EventRow) {
    if (event.is_active) {
      if (!window.confirm("Tutup kegiatan publik ini sekarang?")) return;
      if (demo || !supabase) {
        const next = events.map((x) => x.id === event.id ? { ...x, is_active: false } : x);
        localStorage.setItem("demo_events_v2", JSON.stringify(next));
        setEvents(next);
        showToast("Kegiatan ditutup.");
        return;
      }
      const { error: updateError } = await supabase.from("events").update({ is_active: false }).eq("id", event.id);
      if (updateError) showToast(updateError.message);
      else { await loadData(); showToast("Kegiatan ditutup."); }
      return;
    }

    if (demo || !supabase) {
      const next = events.map((x) => ({ ...x, is_active: x.id === event.id }));
      localStorage.setItem("demo_events_v2", JSON.stringify(next));
      setEvents(next);
      setSelectedEventId(event.id);
      showToast("Kegiatan diaktifkan.");
      return;
    }

    const { error: clearError } = await supabase.from("events").update({ is_active: false }).eq("is_active", true);
    if (clearError) { showToast(clearError.message); return; }
    const { error: updateError } = await supabase.from("events").update({ is_active: true }).eq("id", event.id);
    if (updateError) showToast(updateError.message);
    else { await loadData(); setSelectedEventId(event.id); showToast("Kegiatan diaktifkan."); }
  }

  const selectedEvent = events.find((item) => item.id === selectedEventId) || null;
  const filteredParticipants = useMemo(() => {
    const query = participantQuery.trim().toLowerCase();
    if (!query) return participants;
    return participants.filter((p) => p.full_name.toLowerCase().includes(query) || p.address.toLowerCase().includes(query));
  }, [participants, participantQuery]);

  const attendanceCount = attendance.length;
  const activeParticipantCount = participants.filter((p) => p.is_active).length;
  const attendanceRate = selectedEvent && activeParticipantCount ? Math.round(attendanceCount / activeParticipantCount * 100) : 0;

  const dailyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (demo && typeof window !== "undefined") {
      const ats: any[] = JSON.parse(localStorage.getItem("demo_attendance_v2") || "[]");
      ats.forEach((item) => {
        const eventForDate = events.find((e) => e.id === item.event_id);
        if (eventForDate) counts.set(eventForDate.event_date, (counts.get(eventForDate.event_date) || 0) + 1);
      });
    }
    return counts;
  }, [demo, events, attendance]);

  if (checkingAuth) return <div className="login-screen"><div className="login-box"><h2>Memuat dashboard...</h2></div></div>;

  if (!session) {
    return (
      <div className="login-screen">
        <div className="login-box">
          <div className="admin-title">Dashboard Admin</div>
          <div className="admin-sub">Lansia SMART RSUD Wonosari</div>
          <form onSubmit={login} style={{ marginTop: 20 }}>
            <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@rsudwonosari.go.id" required /></div>
            <div className="field" style={{ marginTop: 12 }}><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password admin" required={true} /></div>
            <button className="btn btn-primary" style={{ marginTop: 14, width: "100%" }}>Masuk</button>
            {demo && <div className="success">Mode demo aktif. Login bypass untuk testing lokal.</div>}
            {loginError && <div className="error">{loginError}</div>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="admin-wrap">
        <div className="admin-head">
          <div>
            <h1 className="admin-title">Dashboard Admin</h1>
            <div className="admin-sub">Kelola kegiatan, peserta, kehadiran, dan laporan.</div>
          </div>
          <div className="actions"><a className="btn btn-secondary" href="/">Halaman Lansia</a><button className="btn btn-secondary" onClick={logout}>Keluar</button></div>
        </div>

        {demo && <div className="mode-banner">Mode demo aktif karena Supabase belum disambungkan. Data demo tersimpan di browser ini.</div>}
        {error && <div className="error">{error}</div>}

        <div className="tabs">
          {[["overview","Ringkasan"],["events","Kegiatan"],["participants","Peserta"],["attendance","Kehadiran"],["reports","Laporan"]].map(([value,label]) => (
            <button key={value} className={`tab ${tab === value ? "active" : ""}`} onClick={() => setTab(value)}>{label}</button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <div className="grid4">
              <div className="stat"><div className="stat-label">Total peserta aktif</div><div className="stat-value">{activeParticipantCount}</div></div>
              <div className="stat"><div className="stat-label">Hadir kegiatan terpilih</div><div className="stat-value">{attendanceCount}</div></div>
              <div className="stat"><div className="stat-label">Belum hadir</div><div className="stat-value">{Math.max(activeParticipantCount - attendanceCount, 0)}</div></div>
              <div className="stat"><div className="stat-label">Persentase hadir</div><div className="stat-value">{attendanceRate}%</div></div>
            </div>
            <div className="panel">
              <div className="toolbar">
                <div><h3>Kegiatan aktif</h3><div className="muted">{selectedEvent ? `${selectedEvent.name} • ${formatDate(selectedEvent.event_date)}` : "Belum ada"}</div></div>
                {selectedEvent && <span className={`pill pill-${eventStatus(selectedEvent)[1]}`}>{eventStatus(selectedEvent)[0]}</span>}
              </div>
            </div>
          </>
        )}

        {tab === "events" && (
          <section>
            <div className="admin-head"><div><h1 className="admin-title">Kegiatan</h1><div className="admin-sub">Atur tanggal, lokasi, waktu buka, waktu tutup, dan kegiatan aktif.</div></div></div>
            <div className="panel">
              <h3>{eventForm.id ? "Edit kegiatan" : "Tambah kegiatan"}</h3>
              <form onSubmit={saveEvent}>
                <div className="form-grid" style={{ marginTop: 14 }}>
                  <div className="field"><label>Nama kegiatan</label><input value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} placeholder="Senam Lansia September" /></div>
                  <div className="field"><label>Lokasi</label><input value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} placeholder="Balai Desa Getas" /></div>
                  <div className="field"><label>Tanggal kegiatan</label><input type="date" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} /></div>
                  <div className="field"><label>Mulai menerima konfirmasi</label><input type="datetime-local" value={eventForm.open_at} onChange={(e) => setEventForm({ ...eventForm, open_at: e.target.value })} /></div>
                  <div className="field"><label>Tutup menerima konfirmasi</label><input type="datetime-local" value={eventForm.close_at} onChange={(e) => setEventForm({ ...eventForm, close_at: e.target.value })} /></div>
                  <div className="field"><label><input type="checkbox" checked={eventForm.is_active} onChange={(e) => setEventForm({ ...eventForm, is_active: e.target.checked })} /> Jadikan kegiatan aktif</label></div>
                </div>
                <div className="actions" style={{ marginTop: 14 }}><button className="btn btn-primary">Simpan kegiatan</button><button type="button" className="btn btn-secondary" onClick={resetEvent}>Bersihkan</button></div>
              </form>
            </div>
            <div className="panel"><h3>Daftar kegiatan</h3><div className="table-wrap"><table className="table"><thead><tr><th>Nama</th><th>Tanggal</th><th>Periode</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
              {events.map((item) => { const [label, color] = eventStatus(item); return <tr key={item.id}><td><b>{item.name}</b><div className="muted">{item.location}</div></td><td>{formatDate(item.event_date)}</td><td>{new Date(item.open_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}<br/>s/d<br/>{new Date(item.close_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td><td><span className={`pill pill-${color}`}>{label}</span>{item.is_active && <span className="pill pill-green" style={{ marginLeft: 6 }}>Aktif</span>}</td><td><div className="actions"><button className="btn btn-secondary" onClick={() => editEvent(item)}>Edit</button><button className={item.is_active ? "btn btn-danger" : "btn btn-secondary"} onClick={() => toggleEvent(item)}>{item.is_active ? "Tutup Publik" : "Aktifkan"}</button>
              <button
  className="btn btn-danger"
  onClick={() => deleteEvent(item)}
>
  Hapus
</button></div></td></tr> })}
            </tbody></table></div></div>
          </section>
        )}

        {tab === "participants" && (
          <section>
            <div className="admin-head"><div><h1 className="admin-title">Peserta</h1><div className="admin-sub">Tambah nama lengkap dan alamat. Peserta nonaktif tidak dapat dikonfirmasi.</div></div></div>
            <div className="panel"><h3>{participantForm.id ? "Edit peserta" : "Tambah peserta baru"}</h3><form onSubmit={saveParticipant}><div className="form-grid" style={{ marginTop: 14 }}><div className="field"><label>Nama lengkap</label><input value={participantForm.full_name} onChange={(e) => setParticipantForm({ ...participantForm, full_name: e.target.value })} placeholder="Nama lengkap peserta" /></div><div className="field"><label>Alamat</label><textarea value={participantForm.address} onChange={(e) => setParticipantForm({ ...participantForm, address: e.target.value })} placeholder="Alamat peserta" /></div></div><div className="actions" style={{ marginTop: 14 }}><button className="btn btn-primary">Simpan peserta</button><button type="button" className="btn btn-secondary" onClick={resetParticipant}>Bersihkan</button></div></form></div>
            <div className="panel"><div className="toolbar"><h3>Daftar peserta</h3><input value={participantQuery} onChange={(e) => setParticipantQuery(e.target.value)} placeholder="Cari nama atau alamat..." /></div><div className="table-wrap"><table className="table"><thead><tr><th>Nama</th><th>Alamat</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{filteredParticipants.map((p) => <tr key={p.id}><td><b>{p.full_name}</b></td><td>{p.address || "-"}</td><td>{p.is_active ? <span className="pill pill-green">Aktif</span> : <span className="pill pill-gray">Nonaktif</span>}</td><td>{p.is_active ? <div className="actions"><button className="btn btn-secondary" onClick={() => editParticipant(p)}>Edit</button><button className="btn btn-danger" onClick={() => deactivateParticipant(p.id)}>Nonaktifkan</button></div> : <span className="muted">Tidak tampil di publik</span>}</td></tr>)}</tbody></table></div></div>
          </section>
        )}

        {tab === "attendance" && (
          <section>
            <div className="admin-head"><div><h1 className="admin-title">Kehadiran</h1><div className="admin-sub">Daftar peserta yang berhasil dikonfirmasi untuk kegiatan terpilih.</div></div></div>
            <div className="panel"><div className="field"><label>Pilih kegiatan</label><select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>{events.map((e) => <option key={e.id} value={e.id}>{e.name} • {formatDate(e.event_date)}</option>)}</select></div></div>
            <div className="grid4"><div className="stat"><div className="stat-label">Kegiatan</div><div className="stat-value" style={{ fontSize: 22 }}>{selectedEvent?.name || "-"}</div></div><div className="stat"><div className="stat-label">Tanggal</div><div className="stat-value" style={{ fontSize: 22 }}>{selectedEvent ? formatDate(selectedEvent.event_date) : "-"}</div></div><div className="stat"><div className="stat-label">Hadir</div><div className="stat-value">{attendanceCount}</div></div><div className="stat"><div className="stat-label">Belum hadir</div><div className="stat-value">{Math.max(activeParticipantCount - attendanceCount, 0)}</div></div></div>
            <div className="panel"><div className="toolbar"><h3>Daftar hadir</h3><div className="actions"><button className="btn btn-primary" disabled={!selectedEvent} onClick={() => exportWord(selectedEvent, attendance)}>Export Word</button><button className="btn btn-secondary" disabled={!selectedEvent} onClick={() => exportPdf(selectedEvent, attendance)}>Export PDF</button></div></div><div className="table-wrap"><table className="table"><thead><tr><th>No</th><th>Nama</th><th>Tanggal</th></tr></thead><tbody>{attendance.length ? attendance.map((a, i) => <tr key={a.id}><td>{i + 1}</td><td>{a.participant?.full_name || "Peserta"}</td><td>{selectedEvent ? formatDate(selectedEvent.event_date) : formatDate(a.created_at)}</td></tr>) : <tr><td colSpan={3}>Belum ada peserta hadir.</td></tr>}</tbody></table></div></div>
          </section>
        )}

        {tab === "reports" && (
          <section>
            <div className="admin-head"><div><h1 className="admin-title">Laporan</h1><div className="admin-sub">Export daftar hadir berdasarkan kegiatan. Jam tidak dicantumkan pada file laporan.</div></div></div>
            <div className="panel"><div className="field"><label>Pilih kegiatan</label><select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>{events.map((e) => <option key={e.id} value={e.id}>{e.name} • {formatDate(e.event_date)}</option>)}</select></div><div className="actions" style={{ marginTop: 16 }}><button className="btn btn-primary" disabled={!selectedEvent || !attendance.length} onClick={() => exportWord(selectedEvent, attendance)}>Export Word – Daftar Hadir</button><button className="btn btn-secondary" disabled={!selectedEvent || !attendance.length} onClick={() => exportPdf(selectedEvent, attendance)}>Export PDF – Daftar Hadir</button></div></div>
            <div className="panel"><h3>Analisis sederhana</h3><p className="muted" style={{ lineHeight: 1.6 }}>{selectedEvent ? `Untuk kegiatan ${selectedEvent.name}, ${attendanceCount} dari ${activeParticipantCount} peserta aktif sudah melakukan konfirmasi. Persentase kehadiran saat ini ${attendanceRate}%.` : "Belum ada kegiatan yang dipilih."}</p></div>
          </section>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

async function exportWord(event: EventRow | null, attendance: Attendance[]) {
  if (!event) return;
 const rows = [
  new TableRow({
    children: [
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: "No", bold: true })]
          })
        ]
      }),
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Nama", bold: true })]
          })
        ]
      }),
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Tanggal", bold: true })]
          })
        ]
      })
    ]
  })
];
  attendance.forEach((item, index) => {
    rows.push(new TableRow({
      children: [
        new TableCell({
  children: [
    new Paragraph({
      children: [new TextRun({ text: "No", bold: true })]
    })
  ]
}),
new TableCell({
  children: [
    new Paragraph({
      children: [new TextRun({ text: "Nama", bold: true })]
    })
  ]
}),
new TableCell({
  children: [
    new Paragraph({
      children: [new TextRun({ text: "Tanggal", bold: true })]
    })
  ]
})
      ]
    }));
  });

  const document = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: "DAFTAR KEHADIRAN LANSIA", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
        new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [
    new TextRun({
      text: event.name,
      bold: true
    })
  ]
}),
        new Paragraph({ text: `${formatDate(event.event_date)} • ${event.location}`, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "" }),
        new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        new Paragraph({ text: "" }),
        new Paragraph({
  children: [
    new TextRun({
      text: `Total hadir: ${attendance.length} peserta`,
      bold: true
    })
  ]
})
      ]
    }]
  });

  const blob = await Packer.toBlob(document);
  downloadBlob(blob, `daftar-hadir-${safeFileName(event.name)}-${event.event_date}.docx`);
}

function exportPdf(event: EventRow | null, attendance: Attendance[]) {
  if (!event) return;
  const document = new jsPDF();
  document.setFontSize(18);
  document.text("DAFTAR KEHADIRAN LANSIA", 105, 18, { align: "center" });
  document.setFontSize(12);
  document.text(event.name, 105, 27, { align: "center" });
  document.setFontSize(10);
  document.text(`${formatDate(event.event_date)} • ${event.location}`, 105, 35, { align: "center" });
  autoTable(document, {
    startY: 43,
    head: [["No", "Nama", "Tanggal"]],
    body: attendance.map((item, index) => [index + 1, item.participant?.full_name || "Peserta", formatDate(event.event_date)]),
    styles: { fontSize: 9 },
    foot: [[`Total hadir: ${attendance.length}`, "", ""]]
  });
  document.save(`daftar-hadir-${safeFileName(event.name)}-${event.event_date}.pdf`);
}

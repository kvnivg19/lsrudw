"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { EventRow, Participant } from "@/lib/types";

const DEMO_EVENT: EventRow = {
  id: "demo-event",
  name: "Pertemuan Lansia",
  event_date: "2026-09-25",
  location: "Gunungkidul, Yogyakarta",
  open_at: "2026-09-25T06:00:00+07:00",
  close_at: "2026-09-25T08:00:00+07:00",
  is_active: true,
  created_at: new Date().toISOString()
};

const DEMO_PARTICIPANTS: Participant[] = [
  ["Aulia Barokah", "Getas, Playen, Gunungkidul"],
  ["Budi Santoso", "Getas, Playen, Gunungkidul"],
  ["Dewi Lestari", "Getas, Playen, Gunungkidul"],
  ["Jumilah", "Getas, Playen, Gunungkidul"],
  ["Karsini", "Getas, Playen, Gunungkidul"],
  ["Maryati", "Getas, Playen, Gunungkidul"],
  ["Mulyono", "Getas, Playen, Gunungkidul"],
  ["Nanik Sulastri", "Getas, Playen, Gunungkidul"],
  ["Paini", "Getas, Playen, Gunungkidul"],
  ["Sri Wahyuni", "Getas, Playen, Gunungkidul"],
  ["Siti Aminah", "Getas, Playen, Gunungkidul"],
  ["Siti Rahayu", "Getas, Playen, Gunungkidul"]
].map(([full_name, address], index) => ({
  id: `demo-${index + 1}`,
  full_name,
  address,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}));

type DemoAttendance = { id: string; event_id: string; participant_id: string; created_at: string };

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta"
});

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value.slice(0, 10)}T00:00:00+07:00`));
}

function countdownText(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function HomePage() {
  const demo = !isSupabaseConfigured;
  const [event, setEvent] = useState<EventRow | null>(null);
  const [search, setSearch] = useState("");
  const [matched, setMatched] = useState<Participant | null>(null);
  const [alreadyPresent, setAlreadyPresent] = useState(false);
  const [status, setStatus] = useState<"loading" | "not-started" | "open" | "closed" | "none">("loading");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }, []);

  const loadEvent = useCallback(async () => {
    setError("");
    if (demo || !supabase) {
      const stored = localStorage.getItem("demo_events_v2");
      const events: EventRow[] = stored ? JSON.parse(stored) : [DEMO_EVENT];
      const active = events.find((item) => item.is_active) || events[0] || DEMO_EVENT;
      setEvent(active);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .order("open_at", { ascending: false })
      .limit(1);

    if (queryError) {
      setError(queryError.message);
      setStatus("none");
      return;
    }

    setEvent((data?.[0] as EventRow | undefined) || null);
  }, [demo]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    if (!event) return;
    const tick = () => {
      const now = Date.now();
      const open = new Date(event.open_at).getTime();
      const close = new Date(event.close_at).getTime();
      if (now < open) {
        setStatus("not-started");
        setSecondsLeft(Math.floor((open - now) / 1000));
      } else if (now >= close) {
        setStatus("closed");
        setSecondsLeft(0);
      } else {
        setStatus("open");
        setSecondsLeft(Math.floor((close - now) / 1000));
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [event]);

  useEffect(() => {
    setMatched(null);
    setAlreadyPresent(false);
    if (status !== "open") return;

    const normalized = normalizeName(search);
    if (!normalized || normalized.length < 3 || !event) return;

    const timer = window.setTimeout(async () => {
      if (demo || !supabase) {
        const participants: Participant[] = JSON.parse(localStorage.getItem("demo_participants_v2") || "null") || DEMO_PARTICIPANTS;
        const found = participants.find((p) => normalizeName(p.full_name) === normalized && p.is_active);
        if (!found) return;
        setMatched(found);
        const attendance: DemoAttendance[] = JSON.parse(localStorage.getItem("demo_attendance_v2") || "[]");
        setAlreadyPresent(attendance.some((a) => a.event_id === event?.id && a.participant_id === found.id));
        return;
      }

      const { data, error: rpcError } = await supabase.rpc("get_public_participant_by_name", {
        p_full_name: search.trim(),
        p_event_id: event.id
      });
      if (rpcError || !data?.[0]) return;

      setMatched({
        id: data[0].id,
        full_name: data[0].full_name,
        address: data[0].address || "",
        is_active: true,
        created_at: "",
        updated_at: ""
      });
      setAlreadyPresent(Boolean(data[0].already_present));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [search, status, demo, event]);

  const normalizedSearch = useMemo(() => normalizeName(search), [search]);

  async function confirmAttendance() {
    if (!event || !matched || status !== "open" || alreadyPresent) return;

    if (demo || !supabase) {
      const list: DemoAttendance[] = JSON.parse(localStorage.getItem("demo_attendance_v2") || "[]");
      if (list.some((item) => item.event_id === event.id && item.participant_id === matched.id)) {
        setAlreadyPresent(true);
        setConfirming(false);
        showToast("Peserta ini sudah tercatat hadir.");
        return;
      }
      list.push({
        id: crypto.randomUUID?.() || String(Date.now()),
        event_id: event.id,
        participant_id: matched.id,
        created_at: new Date().toISOString()
      });
      localStorage.setItem("demo_attendance_v2", JSON.stringify(list));
      setAlreadyPresent(true);
      setConfirming(false);
      setSearch("");
      showToast("✓ Kehadiran berhasil dicatat.");
      return;
    }

    const { error: insertError } = await supabase.from("attendance").insert({
      event_id: event.id,
      participant_id: matched.id
    });

    setConfirming(false);
    if (insertError) {
      showToast(insertError.code === "23505" ? "Peserta ini sudah tercatat hadir." : insertError.message);
      if (insertError.code === "23505") setAlreadyPresent(true);
      return;
    }

    setAlreadyPresent(true);
    setSearch("");
    showToast("✓ Kehadiran berhasil dicatat.");
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div>
            <div className="brand">Lansia SMART RSUD Wonosari</div>
            <div className="subbrand">Sederhana • Cepat • Mudah digunakan</div>
          </div>
          <a className="admin-link" href="/admin">Admin</a>
        </div>
      </header>

      <main className="container">
        {demo && <div className="mode-banner">Mode demo aktif. Supabase belum disambungkan.</div>}
        {error && <div className="error">{error}</div>}

        {!event || status === "none" ? (
          <section className="status-card">
            <div className="status-icon">📋</div>
            <h2>Belum ada kegiatan</h2>
            <p>Admin belum menyiapkan kegiatan yang dapat digunakan untuk konfirmasi kehadiran.</p>
          </section>
        ) : status === "not-started" ? (
          <section className="status-card">
            <div className="status-icon">🕐</div>
            <h2>Belum dibuka</h2>
            <p><b>{event.name}</b> akan dibuka pada <b>{formatDate(event.event_date)}</b>.</p>
          </section>
        ) : status === "closed" ? (
          <section className="status-card">
            <div className="status-icon">🔒</div>
            <h2>Konfirmasi Kehadiran Telah Ditutup</h2>
            <p>Pendaftaran untuk <b>{event.name}</b> sudah berakhir. Terima kasih.</p>
          </section>
        ) : (
          <section className="hero">
            <div className="center">
              <h1>{event.name}</h1>
              <div className="location">{event.location}</div>
              <div className="date-big">{formatDate(event.event_date)}</div>
            </div>

            <label className="search-label" htmlFor="search">Cari nama lengkap Anda</label>
            <input
              id="search"
              className="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik nama lengkap..."
              autoComplete="off"
            />
            <div className="hint">
              Ketik nama lengkap sesuai data peserta. Nama akan muncul jika sesuai.
            </div>

            {secondsLeft <= 300 && (
              <div className="countdown">Pendaftaran ditutup dalam {countdownText(secondsLeft)}</div>
            )}

            <div className="results">
              {normalizedSearch && normalizedSearch.split(" ").length >= 2 && !matched && (
                <div className="empty">Nama lengkap tidak ditemukan. Periksa kembali penulisan nama Anda.</div>
              )}

              {matched && (
                <button
                  type="button"
                  className={`result-card ${alreadyPresent ? "done" : ""}`}
                  disabled={alreadyPresent}
                  onClick={() => !alreadyPresent && setConfirming(true)}
                >
                  <div className="result-main">
                    <div className="result-name">{matched.full_name}</div>
                    <div className="result-address">{matched.address || "Alamat belum diisi"}</div>
                  </div>
                  <span className="result-action">
                    {alreadyPresent ? "✓ Sudah hadir" : "Hadir"}
                  </span>
                </button>
              )}
            </div>
          </section>
        )}
      </main>

      {confirming && matched && (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-box">
            <h3>Pastikan nama Anda</h3>
            <p>
              Apakah benar Anda <b>{matched.full_name}</b> dari <b>{matched.address || "alamat belum diisi"}</b>?
            </p>
            <div className="actions">
              <button className="btn btn-secondary" onClick={() => setConfirming(false)}>Batal</button>
              <button className="btn btn-primary" onClick={confirmAttendance}>Ya, Saya Hadir</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

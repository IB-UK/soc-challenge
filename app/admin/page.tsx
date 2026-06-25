'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { TASKS } from '@/lib/challenge-data'

type TeamSummary = {
  id: string; name: string; pin: string
  started_at: string | null; duration_mins: number
  members: { id: string; name: string }[]
  tasks: { task_id: string; member_name: string | null; status: string; answer: string | null; score: number; hints_used: number }[]
}

type FiredAlert = { id: string; title: string; bonus_points: number; fired_at: string }

const PREDEFINED_ALERTS = [
  {
    title: '🚨 Ransomware Outbreak',
    description: 'Files are being encrypted across WORKSTATION-04 right now. Every second counts — what is your IMMEDIATE first action?',
    options: [
      'Isolate the machine from the network',
      'Run a full antivirus scan first',
      'Email the user a warning',
      'Wait 10 minutes to assess the full impact',
    ],
    correct_answer: 'Isolate the machine from the network',
    bonus_points: 25,
    duration_secs: 45,
  },
  {
    title: '⚠️ Suspicious Admin Login',
    description: 'An admin account has just authenticated from 185.220.101.45 — a known Tor exit node in Russia — at 03:17 AM. No travel notice on file.',
    options: [
      'Disable the account immediately',
      'Send a verification email and wait',
      'Monitor the session for 10 minutes',
      'Mark it as a false positive',
    ],
    correct_answer: 'Disable the account immediately',
    bonus_points: 25,
    duration_secs: 45,
  },
  {
    title: '📧 CEO Fraud Email',
    description: 'Finance just received an urgent email from "ceo@company-secure.com" requesting an immediate £50,000 transfer. The real CEO domain is @company.com. What type of attack is this?',
    options: [
      'Business Email Compromise (BEC)',
      'Ransomware delivery mechanism',
      'SQL Injection attempt',
      'Distributed Denial of Service (DDoS)',
    ],
    correct_answer: 'Business Email Compromise (BEC)',
    bonus_points: 20,
    duration_secs: 60,
  },
]

export default function AdminPage() {
  const [authed,       setAuthed]       = useState(false)
  const [pw,           setPw]           = useState('')
  const [teams,        setTeams]        = useState<TeamSummary[]>([])
  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [busy,         setBusy]         = useState<string | null>(null)
  const [newPin,       setNewPin]       = useState<Record<string, string>>({})
  const [confirm,      setConfirm]      = useState<{ label: string; action: () => Promise<void> } | null>(null)
  const [firedAlerts,  setFiredAlerts]  = useState<FiredAlert[]>([])
  const [globalDur,    setGlobalDur]    = useState(45)
  const [alertScores,  setAlertScores]  = useState<Record<string, Record<string, number>>>({})
  const [customDurs,   setCustomDurs]   = useState<Record<number, number>>({})

  async function fetchAll() {
    const [{ data: ts }, { data: ms }, { data: ps }] = await Promise.all([
      supabase.from('soc_teams').select('id, name, pin, started_at, duration_mins').order('created_at'),
      supabase.from('soc_members').select('id, team_id, name'),
      supabase.from('soc_task_progress').select('team_id, task_id, member_name, status, answer, score, hints_used'),
    ])
    if (!ts) return
    setTeams(ts.map(t => ({
      id: t.id, name: t.name, pin: t.pin, started_at: t.started_at ?? null, duration_mins: t.duration_mins ?? 45,
      members: (ms ?? []).filter(m => m.team_id === t.id).map(m => ({ id: m.id, name: m.name })),
      tasks:   (ps ?? []).filter(p => p.team_id === t.id),
    })))
  }

  async function fetchAlerts() {
    const { data: alerts } = await supabase
      .from('soc_alerts').select('id, title, bonus_points, fired_at')
      .order('fired_at', { ascending: false }).limit(10)
    if (alerts) setFiredAlerts(alerts)

    const { data: responses } = await supabase
      .from('soc_alert_responses').select('alert_id, team_id, score')
    if (responses) {
      const map: Record<string, Record<string, number>> = {}
      for (const r of responses) {
        if (!map[r.alert_id]) map[r.alert_id] = {}
        map[r.alert_id][r.team_id] = r.score
      }
      setAlertScores(map)
    }
  }

  // ── Session control actions ──────────────────────────────────────────────

  async function startAllTimers() {
    setBusy('start_all')
    const now = new Date().toISOString()
    await supabase.from('soc_teams').update({ started_at: now, duration_mins: globalDur }).neq('id', '')
    await fetchAll()
    setBusy(null)
  }

  async function startTeamTimer(teamId: string) {
    setBusy(`start_${teamId}`)
    await supabase.from('soc_teams')
      .update({ started_at: new Date().toISOString() })
      .eq('id', teamId)
    await fetchAll()
    setBusy(null)
  }

  async function resetTeamTimer(teamId: string) {
    setBusy(`timer_reset_${teamId}`)
    await supabase.from('soc_teams').update({ started_at: null }).eq('id', teamId)
    await fetchAll()
    setBusy(null)
  }

  async function setTeamDuration(teamId: string, mins: number) {
    await supabase.from('soc_teams').update({ duration_mins: mins }).eq('id', teamId)
    await fetchAll()
  }

  async function forceLogoutAll() {
    setBusy('force_logout')
    await supabase.from('soc_task_progress').delete().neq('id', '')
    await supabase.from('soc_members').delete().neq('id', '')
    await supabase.from('soc_teams').delete().neq('id', '')
    await supabase.from('soc_alerts').delete().neq('id', '')
    await Promise.all([fetchAll(), fetchAlerts()])
    setBusy(null)
    setConfirm(null)
    setExpanded(null)
  }

  useEffect(() => {
    if (!authed) return
    fetchAll()
    fetchAlerts()
    const ch = supabase.channel('admin_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_task_progress' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_members' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_teams' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_alerts' }, fetchAlerts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_alert_responses' }, fetchAlerts)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [authed])

  // ── Actions ───────────────────────────────────────────────────────────────

  async function fireAlert(preset: typeof PREDEFINED_ALERTS[number], idx: number, customDur?: number) {
    const key = `alert_${preset.title}`
    setBusy(key)
    await supabase.from('soc_alerts').insert({
      title: preset.title,
      description: preset.description,
      options: preset.options,
      correct_answer: preset.correct_answer,
      bonus_points: preset.bonus_points,
      duration_secs: customDur ?? customDurs[idx] ?? preset.duration_secs,
      fired_at: new Date().toISOString(),
    })
    await fetchAlerts()
    setBusy(null)
  }

  async function deleteTeam(team: TeamSummary) {
    setBusy(team.id)
    await supabase.from('soc_teams').delete().eq('id', team.id)
    await fetchAll()
    setBusy(null)
    setConfirm(null)
    if (expanded === team.id) setExpanded(null)
  }

  async function deleteMember(memberId: string) {
    setBusy(memberId)
    await supabase.from('soc_members').delete().eq('id', memberId)
    await fetchAll()
    setBusy(null)
    setConfirm(null)
  }

  async function releaseTask(teamId: string, taskId: string) {
    const key = `${teamId}_${taskId}`
    setBusy(key)
    await supabase.from('soc_task_progress')
      .update({ status: 'available', member_id: null, member_name: null, grabbed_at: null })
      .eq('team_id', teamId).eq('task_id', taskId)
    await fetchAll()
    setBusy(null)
  }

  async function resetTasksForTeam(teamId: string) {
    setBusy(`reset_${teamId}`)
    await supabase.from('soc_task_progress').delete().eq('team_id', teamId)
    await fetchAll()
    setBusy(null)
    setConfirm(null)
  }

  async function resetPin(team: TeamSummary) {
    const pin = newPin[team.id]?.trim()
    if (!pin || !/^\d{4}$/.test(pin)) return
    setBusy(`pin_${team.id}`)
    await supabase.from('soc_teams').update({ pin }).eq('id', team.id)
    setNewPin(p => ({ ...p, [team.id]: '' }))
    await fetchAll()
    setBusy(null)
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0d1b2e' }}>
      <form onSubmit={e => { e.preventDefault(); if (pw === 'newman2026') setAuthed(true); else alert('Wrong password') }}
        className="rounded-lg border p-8 w-80 space-y-4" style={{ backgroundColor: '#0f2340', borderColor: '#1B3A6B' }}>
        <h1 className="text-white font-bold">Facilitator Access</h1>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Password"
          className="w-full bg-[#0d1b2e] border rounded px-3 py-2 text-white font-mono text-sm focus:outline-none"
          style={{ borderColor: '#1B3A6B' }} autoFocus />
        <button className="w-full py-2 rounded font-bold text-sm" style={{ backgroundColor: '#00AEEF', color: '#0d1b2e' }}>Enter</button>
      </form>
    </div>
  )

  const totalScore  = (t: TeamSummary) => t.tasks.reduce((s, p) => s + (p.score ?? 0), 0)
  const sortedTeams = [...teams].sort((a, b) => totalScore(b) - totalScore(a))

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: '#0d1b2e' }}>
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Facilitator Dashboard</h1>
            <p className="text-xs font-mono text-slate-400">
              Operation: Dark Harbour · {teams.length} active team{teams.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={fetchAll}
            className="text-xs font-mono px-3 py-1.5 rounded border border-slate-600 text-slate-400 hover:border-[#00AEEF] transition-all">
            ↻ Refresh
          </button>
        </div>

        {/* ── Session Controls ──────────────────────────────────────────── */}
        <div className="mb-6 rounded-lg border overflow-hidden" style={{ borderColor: '#1B3A6B' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#0f2340' }}>
            <div>
              <h2 className="text-sm font-bold text-white">Session Controls</h2>
              <p className="text-xs text-slate-400 font-mono">Start timers, configure duration, reset for new group</p>
            </div>
          </div>
          <div className="p-4 flex flex-wrap items-center gap-4" style={{ backgroundColor: '#0d1b2e' }}>
            {/* Global duration + start all */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Default duration:</span>
              <input type="number" min={5} max={120} step={5} value={globalDur}
                onChange={e => setGlobalDur(Math.max(5, Math.min(120, Number(e.target.value))))}
                className="w-16 bg-[#0f2340] border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-[#00AEEF] text-center" />
              <span className="text-xs font-mono text-slate-400">mins</span>
            </div>
            <button onClick={startAllTimers} disabled={busy === 'start_all'}
              className="text-xs font-mono px-4 py-2 rounded border font-bold transition-all disabled:opacity-40"
              style={{ backgroundColor: '#00AEEF', color: '#0d1b2e', borderColor: '#00AEEF' }}>
              {busy === 'start_all' ? '...' : '▶ Start All Timers'}
            </button>
            <div className="h-6 border-l border-slate-700" />
            <button
              onClick={() => setConfirm({
                label: 'Force logout ALL teams? This permanently deletes all teams, members, progress and alerts.',
                action: forceLogoutAll,
              })}
              disabled={busy === 'force_logout'}
              className="text-xs font-mono px-4 py-2 rounded border border-red-800 text-red-400 hover:border-red-500 hover:text-red-300 transition-all disabled:opacity-40">
              {busy === 'force_logout' ? '...' : '⚠️ Force Logout All'}
            </button>
          </div>
        </div>

        {/* ── Fire Live Alert ─────────────────────────────────────────────── */}
        <div className="mb-6 rounded-lg border overflow-hidden" style={{ borderColor: '#991b1b' }}>
          <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#7f1d1d' }}>
            <span className="text-lg">🚨</span>
            <div>
              <h2 className="text-sm font-bold text-white">Fire Live Alert</h2>
              <p className="text-xs text-red-300 font-mono">Fires to ALL teams simultaneously — timed bonus points</p>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3" style={{ backgroundColor: '#1c0a0a' }}>
            {PREDEFINED_ALERTS.map((preset, i) => {
              const lastFired = firedAlerts.find(a => a.title === preset.title)
              const responses = lastFired ? alertScores[lastFired.id] ?? {} : {}
              const responded = Object.keys(responses).length
              const correct   = Object.values(responses).filter(s => s > 0).length
              const dur = customDurs[i] ?? preset.duration_secs
              return (
                <div key={i} className="rounded-lg border border-red-900 p-4 flex flex-col gap-3"
                  style={{ backgroundColor: '#0f2340' }}>
                  <div>
                    <p className="text-sm font-bold text-white leading-snug">{preset.title}</p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">{preset.description}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
                    <span className="text-green-400 font-bold">+{preset.bonus_points}pts</span>
                    <span>·</span>
                    <label className="flex items-center gap-1.5">
                      <span>Window:</span>
                      <input
                        type="number" min={10} max={300} step={5}
                        value={dur}
                        onChange={e => setCustomDurs(d => ({ ...d, [i]: Math.max(10, Math.min(300, Number(e.target.value))) }))}
                        className="w-16 bg-[#0d1b2e] border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono text-xs focus:outline-none focus:border-red-500 text-center"
                      />
                      <span>s</span>
                    </label>
                  </div>
                  {lastFired && (
                    <div className="text-xs font-mono text-slate-500 border-t border-slate-800 pt-2">
                      Last fired {new Date(lastFired.fired_at).toLocaleTimeString()} ·
                      <span className="text-green-400 ml-1">{correct}/{responded} correct</span>
                    </div>
                  )}
                  <button
                    onClick={() => fireAlert(preset, i)}
                    disabled={busy === `alert_${preset.title}`}
                    className="w-full py-2 rounded text-xs font-mono font-bold transition-all disabled:opacity-40 hover:opacity-90"
                    style={{ backgroundColor: '#dc2626', color: '#fff' }}>
                    {busy === `alert_${preset.title}` ? '⏳ Firing...' : '🚨 Fire Now'}
                  </button>
                </div>
              )
            })}
          </div>
          {/* Recent alert history */}
          {firedAlerts.length > 0 && (
            <div className="px-4 py-3 border-t border-red-900/50" style={{ backgroundColor: '#160606' }}>
              <p className="text-xs font-mono text-red-900 uppercase tracking-widest mb-2">Recent Alerts</p>
              <div className="flex flex-col gap-1">
                {firedAlerts.slice(0, 5).map(a => {
                  const responses = alertScores[a.id] ?? {}
                  const responded = Object.keys(responses).length
                  const correct   = Object.values(responses).filter(s => s > 0).length
                  return (
                    <div key={a.id} className="flex items-center gap-3 text-xs font-mono">
                      <span className="text-slate-600">{new Date(a.fired_at).toLocaleTimeString()}</span>
                      <span className="text-slate-400">{a.title}</span>
                      <span className="text-slate-600">+{a.bonus_points}pts</span>
                      <span className="ml-auto text-green-400">{correct}/{responded} correct</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Answer Key ──────────────────────────────────────────────────── */}
        <details className="mb-6 rounded-lg border" style={{ borderColor: '#1B3A6B' }}>
          <summary className="px-4 py-3 text-sm font-mono text-slate-400 cursor-pointer hover:text-white">
            📋 Answer Key (click to expand)
          </summary>
          <div className="px-4 pb-4 space-y-1">
            {TASKS.map((t, i) => (
              <div key={t.id} className="text-xs font-mono">
                <span className="text-slate-500">S{t.stage} Q{i+1}: </span>
                <span className="text-slate-300">{t.title}</span>
                {t.answer
                  ? <span className="text-green-400 ml-2">→ {t.answer}</span>
                  : <span className="text-yellow-400 ml-2">→ Free text — {t.answerGuidance}</span>}
              </div>
            ))}
          </div>
        </details>

        {/* ── Team Cards ──────────────────────────────────────────────────── */}
        {sortedTeams.length === 0
          ? <p className="text-center text-slate-500 font-mono py-16">No teams yet.</p>
          : sortedTeams.map((team, rank) => (
            <div key={team.id} className="mb-4 rounded-lg border overflow-hidden" style={{ borderColor: '#1B3A6B' }}>
              <div className="flex items-center" style={{ backgroundColor: '#0f2340' }}>
                <button
                  onClick={() => setExpanded(expanded === team.id ? null : team.id)}
                  className="flex-1 flex items-center justify-between px-4 py-3 text-left hover:bg-[#162d52] transition-all">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank+1}`}</span>
                    <div>
                      <span className="font-bold text-white font-mono">{team.name}</span>
                      <span className="text-xs font-mono text-slate-400 ml-3">
                        {team.members.map(m => m.name).join(', ')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-right">
                      <div className="text-lg font-bold font-mono" style={{ color: '#00AEEF' }}>{totalScore(team)}</div>
                      <div className="text-xs font-mono text-slate-500">
                        {team.tasks.filter(t => t.status === 'completed').length}/{TASKS.length} tasks
                      </div>
                    </div>
                    <span className="text-slate-500 text-sm">{expanded === team.id ? '▲' : '▼'}</span>
                  </div>
                </button>
                <div className="flex items-center gap-1 px-3 shrink-0">
                  <button
                    onClick={() => setConfirm({ label: `Reset all task progress for "${team.name}"?`, action: () => resetTasksForTeam(team.id) })}
                    disabled={busy === `reset_${team.id}`}
                    className="text-xs font-mono px-2 py-1.5 rounded border border-slate-700 text-slate-400 hover:border-yellow-600 hover:text-yellow-400 transition-all disabled:opacity-40">
                    ↺ Reset
                  </button>
                  <button
                    onClick={() => setConfirm({ label: `Delete team "${team.name}" and all their data?`, action: () => deleteTeam(team) })}
                    disabled={busy === team.id}
                    className="text-xs font-mono px-2 py-1.5 rounded border border-slate-700 text-slate-400 hover:border-red-600 hover:text-red-400 transition-all disabled:opacity-40">
                    🗑 Delete
                  </button>
                </div>
              </div>

              {expanded === team.id && (
                <div className="border-t" style={{ borderColor: '#1B3A6B', backgroundColor: '#0d1b2e' }}>

                  {/* Members */}
                  <div className="px-4 py-3 border-b" style={{ borderColor: '#1B3A6B' }}>
                    <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">Members</p>
                    <div className="flex flex-wrap gap-2">
                      {team.members.length === 0
                        ? <span className="text-xs font-mono text-slate-600">No members</span>
                        : team.members.map(m => (
                          <div key={m.id} className="flex items-center gap-1.5 bg-[#0f2340] border border-[#1B3A6B] rounded px-2 py-1">
                            <span className="text-xs font-mono text-slate-300">{m.name}</span>
                            <button
                              onClick={() => setConfirm({ label: `Remove "${m.name}" from "${team.name}"?`, action: () => deleteMember(m.id) })}
                              disabled={busy === m.id}
                              className="text-slate-600 hover:text-red-400 transition-colors text-xs ml-1 disabled:opacity-40">✕</button>
                          </div>
                        ))
                      }
                    </div>
                  </div>

                  {/* Reset PIN */}
                  <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: '#1B3A6B' }}>
                    <p className="text-xs font-mono text-slate-500 uppercase tracking-widest shrink-0">Reset PIN</p>
                    <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-1 rounded">Current: {team.pin}</span>
                    <input type="text" maxLength={4} placeholder="New PIN"
                      value={newPin[team.id] ?? ''}
                      onChange={e => setNewPin(p => ({ ...p, [team.id]: e.target.value.replace(/\D/g, '') }))}
                      className="w-28 bg-[#0f2340] border rounded px-2 py-1 text-white font-mono text-xs focus:outline-none"
                      style={{ borderColor: '#1B3A6B' }} />
                    <button
                      onClick={() => resetPin(team)}
                      disabled={!/^\d{4}$/.test(newPin[team.id] ?? '') || busy === `pin_${team.id}`}
                      className="text-xs font-mono px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:border-[#00AEEF] hover:text-white transition-all disabled:opacity-40">
                      {busy === `pin_${team.id}` ? 'Saving...' : 'Save'}
                    </button>
                  </div>

                  {/* Timer controls */}
                  <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3" style={{ borderColor: '#1B3A6B' }}>
                    <p className="text-xs font-mono text-slate-500 uppercase tracking-widest shrink-0">Timer</p>
                    {team.started_at ? (
                      <span className="text-xs font-mono text-green-400 bg-green-900/20 border border-green-800 rounded px-2 py-1">
                        ▶ Running — {Math.max(0, Math.ceil(team.duration_mins - (Date.now() - new Date(team.started_at).getTime()) / 60000))}m left
                      </span>
                    ) : (
                      <span className="text-xs font-mono text-slate-500 bg-slate-800 rounded px-2 py-1">Not started</span>
                    )}
                    <label className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                      Duration:
                      <input type="number" min={5} max={120} step={5}
                        defaultValue={team.duration_mins}
                        onBlur={e => setTeamDuration(team.id, Math.max(5, Math.min(120, Number(e.target.value))))}
                        className="w-16 bg-[#0d1b2e] border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono text-xs focus:outline-none focus:border-[#00AEEF] text-center" />
                      mins
                    </label>
                    {!team.started_at ? (
                      <button onClick={() => startTeamTimer(team.id)} disabled={busy === `start_${team.id}`}
                        className="text-xs font-mono px-3 py-1.5 rounded border font-bold transition-all disabled:opacity-40"
                        style={{ backgroundColor: '#00AEEF', color: '#0d1b2e', borderColor: '#00AEEF' }}>
                        {busy === `start_${team.id}` ? '...' : '▶ Start'}
                      </button>
                    ) : (
                      <button onClick={() => resetTeamTimer(team.id)} disabled={busy === `timer_reset_${team.id}`}
                        className="text-xs font-mono px-3 py-1.5 rounded border border-slate-600 text-slate-400 hover:border-yellow-600 hover:text-yellow-400 transition-all disabled:opacity-40">
                        {busy === `timer_reset_${team.id}` ? '...' : '↺ Reset Timer'}
                      </button>
                    )}
                  </div>

                  {/* Task table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead style={{ backgroundColor: '#162d52' }}>
                        <tr>
                          <th className="text-left px-4 py-2 text-slate-400">Task</th>
                          <th className="text-left px-3 py-2 text-slate-400">Analyst</th>
                          <th className="text-center px-3 py-2 text-slate-400">Status</th>
                          <th className="text-center px-3 py-2 text-slate-400">Hints</th>
                          <th className="text-center px-3 py-2 text-slate-400">Score</th>
                          <th className="text-left px-3 py-2 text-slate-400">Answer</th>
                          <th className="text-center px-3 py-2 text-slate-400">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {TASKS.map(task => {
                          const tp  = team.tasks.find(p => p.task_id === task.id)
                          const key = `${team.id}_${task.id}`
                          return (
                            <tr key={task.id} className="border-t" style={{ borderColor: '#1B3A6B', backgroundColor: '#0f2340' }}>
                              <td className="px-4 py-2 text-slate-300">{task.categoryIcon} {task.title}</td>
                              <td className="px-3 py-2 text-slate-400">{tp?.member_name ?? '—'}</td>
                              <td className="px-3 py-2 text-center">
                                {!tp || tp.status === 'available' ? <span className="text-slate-600">—</span>
                                  : tp.status === 'in_progress' ? <span className="text-yellow-400">In Progress</span>
                                  : <span className="text-green-400">✓ Done</span>}
                              </td>
                              <td className="px-3 py-2 text-center text-slate-400">{tp?.hints_used ?? 0}</td>
                              <td className="px-3 py-2 text-center font-bold" style={{ color: '#00AEEF' }}>
                                {tp?.status === 'completed' ? tp.score : '—'}
                              </td>
                              <td className="px-3 py-2 text-slate-400 max-w-xs truncate">
                                {tp?.answer ?? '—'}
                                {task.type === 'multiple_choice' && tp?.answer && (
                                  <span className={`ml-2 ${tp.answer === task.answer ? 'text-green-400' : 'text-red-400'}`}>
                                    {tp.answer === task.answer ? '✓' : '✗'}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {tp && tp.status !== 'available' ? (
                                  <button
                                    onClick={() => tp.status === 'completed'
                                      ? setConfirm({ label: `Clear completed task "${task.title}" for ${team.name}?`, action: () => releaseTask(team.id, task.id) })
                                      : releaseTask(team.id, task.id)}
                                    disabled={busy === key}
                                    className="text-xs font-mono px-2 py-1 rounded border border-slate-700 text-slate-500 hover:border-yellow-600 hover:text-yellow-400 transition-all disabled:opacity-40">
                                    {busy === key ? '...' : tp.status === 'in_progress' ? '↺ Release' : '✕ Clear'}
                                  </button>
                                ) : <span className="text-slate-700">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))
        }
      </div>

      {/* Confirm modal */}
      {confirm && (
        <>
          <div className="fixed inset-0 bg-black/70 z-50" onClick={() => setConfirm(null)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="rounded-lg border p-6 w-full max-w-sm space-y-4 shadow-2xl"
              style={{ backgroundColor: '#0f2340', borderColor: '#1B3A6B' }}>
              <p className="text-sm font-mono text-white">{confirm.label}</p>
              <p className="text-xs font-mono text-slate-400">This cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirm(null)}
                  className="flex-1 py-2 rounded border border-slate-600 text-slate-400 text-sm font-mono hover:border-slate-400 transition-all">
                  Cancel
                </button>
                <button onClick={async () => { await confirm.action() }}
                  className="flex-1 py-2 rounded text-sm font-mono font-bold"
                  style={{ backgroundColor: '#dc2626', color: '#fff' }}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

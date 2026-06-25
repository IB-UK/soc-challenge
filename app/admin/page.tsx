'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { TASKS } from '@/lib/challenge-data'

type TeamSummary = {
  id: string; name: string; pin: string; members: { id: string; name: string }[]
  tasks: { task_id: string; member_name: string | null; status: string; answer: string | null; score: number; hints_used: number }[]
}

export default function AdminPage() {
  const [authed,   setAuthed]   = useState(false)
  const [pw,       setPw]       = useState('')
  const [teams,    setTeams]    = useState<TeamSummary[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy,     setBusy]     = useState<string | null>(null)   // id of item being actioned
  const [newPin,   setNewPin]   = useState<Record<string, string>>({})
  const [confirm,  setConfirm]  = useState<{ label: string; action: () => Promise<void> } | null>(null)

  async function fetchAll() {
    const [{ data: ts }, { data: ms }, { data: ps }] = await Promise.all([
      supabase.from('soc_teams').select('id, name, pin').order('created_at'),
      supabase.from('soc_members').select('id, team_id, name'),
      supabase.from('soc_task_progress').select('team_id, task_id, member_name, status, answer, score, hints_used'),
    ])
    if (!ts) return
    setTeams(ts.map(t => ({
      id: t.id, name: t.name, pin: t.pin,
      members: (ms ?? []).filter(m => m.team_id === t.id).map(m => ({ id: m.id, name: m.name })),
      tasks:   (ps ?? []).filter(p => p.team_id === t.id),
    })))
  }

  useEffect(() => {
    if (!authed) return
    fetchAll()
    const ch = supabase.channel('admin_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_task_progress' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_members' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_teams' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [authed])

  // ── Actions ──────────────────────────────────────────────────────────────

  async function deleteTeam(team: TeamSummary) {
    setBusy(team.id)
    await supabase.from('soc_teams').delete().eq('id', team.id)
    await fetchAll()
    setBusy(null)
    setConfirm(null)
    if (expanded === team.id) setExpanded(null)
  }

  async function deleteMember(memberId: string, memberName: string) {
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

  const totalScore = (t: TeamSummary) => t.tasks.reduce((s, p) => s + (p.score ?? 0), 0)
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

        {/* Answer key */}
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

        {/* Team cards */}
        {sortedTeams.length === 0
          ? <p className="text-center text-slate-500 font-mono py-16">No teams yet.</p>
          : sortedTeams.map((team, rank) => (
            <div key={team.id} className="mb-4 rounded-lg border overflow-hidden" style={{ borderColor: '#1B3A6B' }}>

              {/* Team header row */}
              <div className="flex items-center gap-0" style={{ backgroundColor: '#0f2340' }}>
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

                {/* Quick-action buttons visible on header */}
                <div className="flex items-center gap-1 px-3 shrink-0">
                  <button
                    onClick={() => setConfirm({
                      label: `Reset all task progress for "${team.name}"?`,
                      action: () => resetTasksForTeam(team.id),
                    })}
                    disabled={busy === `reset_${team.id}`}
                    title="Reset all task progress"
                    className="text-xs font-mono px-2 py-1.5 rounded border border-slate-700 text-slate-400 hover:border-yellow-600 hover:text-yellow-400 transition-all disabled:opacity-40">
                    ↺ Reset
                  </button>
                  <button
                    onClick={() => setConfirm({
                      label: `Delete team "${team.name}" and all their data?`,
                      action: () => deleteTeam(team),
                    })}
                    disabled={busy === team.id}
                    title="Delete team"
                    className="text-xs font-mono px-2 py-1.5 rounded border border-slate-700 text-slate-400 hover:border-red-600 hover:text-red-400 transition-all disabled:opacity-40">
                    🗑 Delete
                  </button>
                </div>
              </div>

              {/* Expanded panel */}
              {expanded === team.id && (
                <div className="border-t" style={{ borderColor: '#1B3A6B', backgroundColor: '#0d1b2e' }}>

                  {/* ── Members ── */}
                  <div className="px-4 py-3 border-b" style={{ borderColor: '#1B3A6B' }}>
                    <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">Team Members</p>
                    <div className="flex flex-wrap gap-2">
                      {team.members.length === 0
                        ? <span className="text-xs font-mono text-slate-600">No members</span>
                        : team.members.map(m => (
                          <div key={m.id} className="flex items-center gap-1.5 bg-[#0f2340] border border-[#1B3A6B] rounded px-2 py-1">
                            <span className="text-xs font-mono text-slate-300">{m.name}</span>
                            <button
                              onClick={() => setConfirm({
                                label: `Remove member "${m.name}" from "${team.name}"?`,
                                action: () => deleteMember(m.id, m.name),
                              })}
                              disabled={busy === m.id}
                              className="text-slate-600 hover:text-red-400 transition-colors text-xs ml-1 disabled:opacity-40"
                              title="Remove member">✕</button>
                          </div>
                        ))
                      }
                    </div>
                  </div>

                  {/* ── Reset PIN ── */}
                  <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: '#1B3A6B' }}>
                    <p className="text-xs font-mono text-slate-500 uppercase tracking-widest shrink-0">Reset PIN</p>
                    <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-1 rounded">
                      Current: {team.pin}
                    </span>
                    <input
                      type="text" maxLength={4} placeholder="New 4-digit PIN"
                      value={newPin[team.id] ?? ''}
                      onChange={e => setNewPin(p => ({ ...p, [team.id]: e.target.value.replace(/\D/g, '') }))}
                      className="w-32 bg-[#0f2340] border rounded px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-[#00AEEF]"
                      style={{ borderColor: '#1B3A6B' }}
                    />
                    <button
                      onClick={() => resetPin(team)}
                      disabled={!/^\d{4}$/.test(newPin[team.id] ?? '') || busy === `pin_${team.id}`}
                      className="text-xs font-mono px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:border-[#00AEEF] hover:text-white transition-all disabled:opacity-40">
                      {busy === `pin_${team.id}` ? 'Saving...' : 'Save PIN'}
                    </button>
                  </div>

                  {/* ── Task Progress Table ── */}
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
                                {!tp || tp.status === 'available'
                                  ? <span className="text-slate-600">—</span>
                                  : tp.status === 'in_progress'
                                  ? <span className="text-yellow-400">In Progress</span>
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
                                      : releaseTask(team.id, task.id)
                                    }
                                    disabled={busy === key}
                                    className="text-xs font-mono px-2 py-1 rounded border border-slate-700 text-slate-500 hover:border-yellow-600 hover:text-yellow-400 transition-all disabled:opacity-40">
                                    {busy === key ? '...' : tp.status === 'in_progress' ? '↺ Release' : '✕ Clear'}
                                  </button>
                                ) : (
                                  <span className="text-slate-700">—</span>
                                )}
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

      {/* ── Confirmation modal ── */}
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
                <button
                  onClick={async () => { await confirm.action() }}
                  className="flex-1 py-2 rounded text-sm font-mono font-bold transition-all"
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

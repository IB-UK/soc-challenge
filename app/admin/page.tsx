'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { TASKS } from '@/lib/challenge-data'

type TeamSummary = {
  id: string; name: string; members: string[]
  tasks: { task_id: string; member_name: string | null; status: string; answer: string | null; score: number; hints_used: number }[]
}

export default function AdminPage() {
  const [authed, setAuthed]   = useState(false)
  const [pw, setPw]           = useState('')
  const [teams, setTeams]     = useState<TeamSummary[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  async function fetchAll() {
    const [{ data: ts }, { data: ms }, { data: ps }] = await Promise.all([
      supabase.from('soc_teams').select('id, name').order('created_at'),
      supabase.from('soc_members').select('team_id, name'),
      supabase.from('soc_task_progress').select('team_id, task_id, member_name, status, answer, score, hints_used'),
    ])
    if (!ts) return
    setTeams(ts.map(t => ({
      id: t.id, name: t.name,
      members: (ms ?? []).filter(m => m.team_id === t.id).map(m => m.name),
      tasks:   (ps ?? []).filter(p => p.team_id === t.id),
    })))
  }

  useEffect(() => {
    if (!authed) return
    fetchAll()
    const ch = supabase.channel('admin_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_task_progress' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_members' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [authed])

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
            <p className="text-xs font-mono text-slate-400">Operation: Dark Harbour · {teams.length} active team{teams.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={fetchAll} className="text-xs font-mono px-3 py-1.5 rounded border border-slate-600 text-slate-400 hover:border-[#00AEEF] transition-all">
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
              {/* Team header */}
              <button
                onClick={() => setExpanded(expanded === team.id ? null : team.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#162d52] transition-all"
                style={{ backgroundColor: '#0f2340' }}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank+1}`}</span>
                  <div>
                    <span className="font-bold text-white font-mono">{team.name}</span>
                    <span className="text-xs font-mono text-slate-400 ml-3">{team.members.join(', ')}</span>
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

              {/* Task breakdown */}
              {expanded === team.id && (
                <div className="border-t overflow-x-auto" style={{ borderColor: '#1B3A6B' }}>
                  <table className="w-full text-xs font-mono">
                    <thead style={{ backgroundColor: '#162d52' }}>
                      <tr>
                        <th className="text-left px-4 py-2 text-slate-400">Task</th>
                        <th className="text-left px-3 py-2 text-slate-400">Analyst</th>
                        <th className="text-center px-3 py-2 text-slate-400">Status</th>
                        <th className="text-center px-
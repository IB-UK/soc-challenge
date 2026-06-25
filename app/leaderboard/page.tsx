'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TASKS } from '@/lib/challenge-data'

type TeamRow = {
  id: string
  name: string
  score: number
  completed: number
  members: string[]
}

export default function LeaderboardPage() {
  const router  = useRouter()
  const [rows, setRows] = useState<TeamRow[]>([])
  const myTeamId = typeof window !== 'undefined' ? localStorage.getItem('soc_team_id') : null

  async function fetchData() {
    const [{ data: teams }, { data: progress }, { data: members }] = await Promise.all([
      supabase.from('soc_teams').select('id, name'),
      supabase.from('soc_task_progress').select('team_id, score, status'),
      supabase.from('soc_members').select('team_id, name'),
    ])
    if (!teams) return

    const rows: TeamRow[] = teams.map(t => ({
      id:        t.id,
      name:      t.name,
      score:     (progress ?? []).filter(p => p.team_id === t.id).reduce((s, p) => s + (p.score ?? 0), 0),
      completed: (progress ?? []).filter(p => p.team_id === t.id && p.status === 'completed').length,
      members:   (members  ?? []).filter(m => m.team_id === t.id).map(m => m.name),
    }))

    rows.sort((a, b) => b.score - a.score || b.completed - a.completed)
    setRows(rows)
  }

  useEffect(() => {
    fetchData()
    const ch = supabase.channel('lb_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_task_progress' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_members' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const medals = ['🥇', '🥈', '🥉']
  const maxScore = TASKS.reduce((s, t) => s + t.points, 0)

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: '#0d1b2e' }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <img src="/logo.png" alt="CNC" className="h-8 mb-2 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <h1 className="text-xl font-bold text-white">Live Leaderboard</h1>
            <p className="text-xs font-mono text-slate-400">Operation: Dark Harbour · Max {maxScore} pts</p>
          </div>
          <button onClick={() => router.push('/dashboard')}
            className="text-xs font-mono px-3 py-1.5 rounded border border-slate-600 text-slate-400 hover:border-[#00AEEF] hover:text-white transition-all">
            ← Dashboard
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-16 text-slate-500 font-mono text-sm">
            No teams yet — be the first to start!
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={row.id}
                className={`rounded-lg border p-4 transition-all
                  ${row.id === myTeamId ? 'border-[#00AEEF] bg-[#00AEEF]/5' : 'border-[#1B3A6B] bg-[#0f2340]'}`}>
                <div className="flex items-center gap-4">
                  <span className="text-2xl w-8 shrink-0 text-center">
                    {i < 3 ? medals[i] : <span className="text-slate-500 font-mono text-sm">#{i+1}</span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white font-mono">{row.name}</span>
                      {row.id === myTeamId && (
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: '#00AEEF', color: '#0d1b2e' }}>YOUR TEAM</span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-slate-500 mt-0.5 truncate">
                      {row.members.join(' · ')} · {row.completed}/{TASKS.length} tasks
                    </p>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 bg-slate-800 rounded-full">
                      <div className="h-1.5 rounded-full transition-all duration-700"
                        style={{ width: `${(row.score / maxScore) * 100}%`, backgroundColor: '#00AEEF' }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold font-mono" style={{ color: i === 0 ? '#00AEEF' : '#e2e8f0' }}>
                      {row.score}
                    </div
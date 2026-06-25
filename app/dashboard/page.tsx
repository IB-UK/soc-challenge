'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Team, type Member, type TaskProgress } from '@/lib/supabase'
import { TASKS, SCENARIO, STAGE_UNLOCK_REQUIREMENTS, type Task } from '@/lib/challenge-data'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<number, string> = {
  1: 'Stage 1 — Initial Triage',
  2: 'Stage 2 — Deep Investigation',
  3: 'Stage 3 — Incident Response',
}

const CAT_COLOURS: Record<string, string> = {
  network:      'bg-blue-900/40 text-blue-300 border-blue-700',
  email:        'bg-purple-900/40 text-purple-300 border-purple-700',
  osint:        'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  files:        'bg-orange-900/40 text-orange-300 border-orange-700',
  response:     'bg-red-900/40 text-red-300 border-red-700',
  threat_intel: 'bg-green-900/40 text-green-300 border-green-700',
}

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()

  const [team,     setTeam]     = useState<Team | null>(null)
  const [member,   setMember]   = useState<Member | null>(null)
  const [members,  setMembers]  = useState<Member[]>([])
  const [progress, setProgress] = useState<TaskProgress[]>([])
  const [active,   setActive]   = useState<Task | null>(null)
  const [timeLeft, setTimeLeft] = useState(SCENARIO.duration * 60)
  const [startTs]               = useState(Date.now())

  // Load session from localStorage
  useEffect(() => {
    const teamId   = localStorage.getItem('soc_team_id')
    const teamName = localStorage.getItem('soc_team_name')
    const memberId = localStorage.getItem('soc_member_id')
    const memberName = localStorage.getItem('soc_member_name')
    if (!teamId || !memberId) { router.push('/'); return }

    setTeam({ id: teamId, name: teamName ?? '', pin: '', created_at: '' })
    setMember({ id: memberId, team_id: teamId, name: memberName ?? '', created_at: '' })

    // Fetch members
    supabase.from('soc_members').select('*').eq('team_id', teamId)
      .then(({ data }) => { if (data) setMembers(data) })

    // Fetch task progress
    supabase.from('soc_task_progress').select('*').eq('team_id', teamId)
      .then(({ data }) => { if (data) setProgress(data) })

    // Realtime
    const channel = supabase.channel(`dashboard_${teamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_task_progress',
          filter: `team_id=eq.${teamId}` }, () => {
        supabase.from('soc_task_progress').select('*').eq('team_id', teamId)
          .then(({ data }) => { if (data) setProgress(data) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_members',
          filter: `team_id=eq.${teamId}` }, () => {
        supabase.from('soc_members').select('*').eq('team_id', teamId)
          .then(({ data }) => { if (data) setMembers(data) })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  // Countdown
  useEffect(() => {
    const iv = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTs) / 1000)
      setTimeLeft(Math.max(0, SCENARIO.duration * 60 - elapsed))
    }, 1000)
    return () => clearInterval(iv)
  }, [startTs])

  // Computed values
  const getProgress = useCallback((taskId: string) =>
    progress.find(p => p.task_id === taskId), [progress])

  const completedInStage = useCallback((stage: number) =>
    TASKS.filter(t => t.stage === stage)
         .filter(t => getProgress(t.id)?.status === 'completed').length,
  [getProgress])

  function isStageUnlocked(stage: number): boolean {
    if (stage === 1) return true
    const req = STAGE_UNLOCK_REQUIREMENTS[stage as 2 | 3]
    return completedInStage(stage - 1) >= req
  }

  const teamScore = progress.reduce((sum, p) => sum + (p.score ?? 0), 0)
  const completedCount = progress.filter(p => p.status === 'completed').length

  // Actions
  async function grabTask(task: Task) {
    if (!team || !member) return
    const { error } = await supabase.from('soc_task_progress').upsert({
      team_id:     team.id,
      task_id:     task.id,
      member_id:   member.id,
      member_name: member.name,
      status:      'in_progress',
      grabbed_at:  new Date().toISOString(),
    }, { onConflict: 'team_id,task_id' })
    if (!error) setActive(task)
  }

  async function releaseTask(task: Task) {
    if (!team) return
    await supabase.from('soc_task_progress')
      .update({ status: 'available', member_id: null, member_name: null, grabbed_at: null })
      .eq('team_id', team.id).eq('task_id', task.id)
    setActive(null)
  }

  async function submitAnswer(task: Task, answer: string, hintsUsed: number) {
    if (!team) return
    let score = task.points - hintsUsed * 5
    if (task.type === 'multiple_choice' && answer !== task.answer) score = 0
    if (task.type === 'free_text' || task.type === 'external_lookup') score = Math.max(score, 0)
    score = Math.max(0, score)

    await supabase.from('soc_task_progress').upsert({
      team_id:      team.id,
      task_id:      task.id,
      member_id:    member?.id,
      member_name:  member?.name,
      status:       'completed',
      answer,
      score,
      hints_used:   hintsUsed,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'team_id,task_id' })
    setActive(null)
  }

  if (!team) return null

  const stages = [1, 2, 3] as const

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0d1b2e' }}>

      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b shrink-0"
        style={{ backgroundColor: '#0f2340', borderColor: '#1B3A6B' }}>
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="CNC" className="h-8 object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <div>
            <div className="text-xs font-mono text-slate-400">OPERATION: DARK HARBOUR</div>
            <div className="text-xs font-mono font-bold" style={{ color: '#00AEEF' }}>
              TEAM: {team.name.toUpperCase()} · {member?.name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`font-mono font-bold text-lg ${timeLeft < 120 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
            ⏱ {formatTime(timeLeft)}
          </div>
          <button onClick={() => router.push('/leaderboard')}
            className="text-xs font-mono px-3 py-1.5 rounded border border-slate-600 text-slate-400 hover:border-[#00AEEF] hover:text-white transition-all">
            Leaderboard
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-52 shrink-0 border-r p-3 flex flex-col gap-4 overflow-y-auto"
          style={{ backgroundColor: '#0f2340', borderColor: '#1B3A6B' }}>

          {/* Score */}
          <div>
            <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-1">Team Score</p>
            <div className="text-3xl font-bold font-mono" style={{ color: '#00AEEF' }}>{teamScore}</div>
            <p className="text-xs font-mono text-slate-500">{completedCount}/{TASKS.length} tasks done</p>
          </div>

          {/* Stage progress */}
          <div>
            <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">Progress</p>
            {stages.map(s => {
              const total = TASKS.filter(t => t.stage === s).length
              const done  = completedInStage(s)
              const unlocked = isStageUnlocked(s)
              return (
                <div key={s} className="mb-2">
                  <div className="flex justify-between text-xs font-mono mb-0.5">
                    <span className={unlocked ? 'text-slate-300' : 'text-slate-600'}>Stage {s}</span>
                    <span className={unlocked ? 'text-slate-400' : 'text-slate-600'}>{done}/{total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800">
                    <div className="h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${total > 0 ? (done / total) * 100 : 0}%`, backgroundColor: unlocked ? '#00AEEF' : '#334155' }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Team members */}
          <div>
            <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">Team Members</p>
            {members.length === 0
              ? <p className="text-xs font-mono text-slate-600">No teammates yet</p>
              : members.map(m => (
                  <div key={m.id} className="flex items-center gap-2 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className={`text-xs font-mono ${m.id === member?.id ? 'text-white font-bold' : 'text-slate-400'}`}>
                      {m.name}{m.id === member?.id ? ' (you)' : ''}
                    </span>
                  </div>
                ))
            }
          </div>

          {/* Invite hint */}
          <div className="text-xs font-mono text-slate-600 leading-relaxed border-t border-slate-800 pt-3">
            Share your team name &amp; PIN so teammates can join from the login page.
          </div>
        </aside>

        {/* Task board */}
        <main className="flex-1 overflow-y-auto p-4">
          {stages.map(stage => {
            const stageTasks  = TASKS.filter(t => t.stage === stage)
            const unlocked    = isStageUnlocked(stage)
            const req         = STAGE_UNLOCK_REQUIREMENTS[stage as 2 | 3]
            const prevDone    = stage > 1 ? completedInStage(stage - 1) : 0

            return (
              <section key={stage} className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <h2 className={`text-sm font-bold font-mono uppercase tracking-widest ${unlocked ? 'text-white' : 'text-slate-600'}`}>
                    {STAGE_LABELS[stage]}
                  </h2>
                  {!unlocked && (
                    <span className="text-xs font-mono text-slate-500 border border-slate-700 rounded px-2 py-0.5">
                      🔒 Unlocks when {req - prevDone} more Stage {stage - 1} task{req - prevDone !== 1 ? 's' : ''} complete
                    </span>
                  )}
                  {unlocked && (
                    <span className="text-xs font-mono text-green-400 border border-green-800 bg-green-900/20 rounded px-2 py-0.5">
                      ✓ UNLOCKED
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {stageTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      progress={getProgress(task.id)}
                      myId={member?.id ?? ''}
                      locked={!unlocked}
                      onOpen={() => {
                        if (!unlocked) return
                        setActive(task)
                      }}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </main>
      </div>

      {/* Task panel overlay */}
      {active && (
        <TaskPanel
          task={active}
          progress={getProgress(active.id)}
          myId={member?.id ?? ''}
          onClose={() => setActive(null)}
          onGrab={() => grabTask(active)}
          onRelease={() => releaseTask(active)}
          onSubmit={(answer, hints) => submitAnswer(active, answer, hints)}
        />
      )}
    </div>
  )
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({ task, progress, myId, locked, onOpen }: {
  task: Task
  progress: TaskProgress | undefined
  myId: string
  locked: boolean
  onOpen: () => void
}) {
  const status = progress?.status ?? 'available'
  const ismine = progress?.member_id === myId

  const statusStyle =
    locked         ? 'border-slate-800 opacity-50 cursor-not-allowed' :
    status === 'completed'  ? 'border-green-700 bg-green-950/20 cursor-pointer' :
    status === 'in_progress' && ismine ? 'border-[#00AEEF] cursor-pointer' :
    status === 'in_progress' ? 'border-yellow-700 bg-yellow-950/10 cursor-pointer' :
    'border-[#1B3A6B] hover:border-[#00AEEF] cursor-pointer'

  return (
    <div
      onClick={onOpen}
      className={`rounded-lg border p-3 flex flex-col gap-2 transition-all ${statusStyle}`}
      style={{ backgroundColor: locked ? '#0d1b2e' : '#0f2340' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg">{task.categoryIcon}</span>
        <span className="text-xs font-mono font-bold" style={{ color: '#00AEEF' }}>{task.points}pts</span>
      </div>

      <div>
        <p className={`text-xs font-bold leading-snug ${locked ? 'text-slate-600' : 'text-white'}`}>{task.title}</p>
        <span className={`inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${CAT_COLOURS[task.category]}`}>
          {task.categoryLabel}
        </span>
      </div>

      <div className="mt-auto">
        {locked ? (
          <span className="text-xs font-mono text-slate-600">🔒 Locked</span>
        ) : status === 'completed' ? (
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-green-400">✓ Done</span>
            <span className="text-xs font-mono text-green-300 font-bold">+{progress?.score}pts</span>
          </div>
        ) : status === 'in_progress' ? (
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            <span className={`text-xs font-mono ${ismine ? 'text-[#00AEEF] font-bold' : 'text-yellow-400'}`}>
              {ismine ? 'You — click to continue' : progress?.member_name}
            </span>
          </div>
        ) : (
          <span className="text-xs font-mono text-slate-500">Available — click to grab</span>
        )}
      </div>
    </div>
  )
}

// ── TaskPanel ─────────────────────────────────────────────────────────────────

function TaskPanel({ task, progress, myId, onClose, onGrab, onRelease, onSubmit }: {
  task: Task
  progress: TaskProgress | undefined
  myId: string
  onClose: () => void
  onGrab: () => void
  onRelease: () => void
  onSubmit: (answer: string, hintsUsed: number) => void
}) {
  const [answer,    setAnswer]    = useState('')
  const [hintsShown, setHints]   = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const status  = progress?.status ?? 'available'
  const ismine  = progress?.member_id === myId
  const done    = status === 'completed'
  const grabbed = status === 'in_progress'

  async function handleSubmit() {
    if (!answer.trim()) return
    setSubmitting(true)
    await onSubmit(answer, hintsShown)
    setSubmitting(false)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl z-50 flex flex-col overflow-hidden shadow-2xl"
        style={{ backgroundColor: '#0f2340', borderLeft: '1px solid #1B3A6B' }}>

        {/* Panel header */}
        <div className="flex items-start justify-between p-4 border-b shrink-0"
          style={{ borderColor: '#1B3A6B' }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-mono px-2 py-0.5 rounded border ${CAT_COLOURS[task.category]}`}>
                {task.categoryIcon} {task.categoryLabel}
              </span>
              <span className="text-xs font-mono font-bold" style={{ color: '#00AEEF' }}>{task.points} pts</span>
            </div>
            <h2 className="text-lg font-bold text-white">{task.title}</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none ml-4">✕</button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Description */}
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{task.description}</p>

          {/* Evidence */}
          {task.evidence && (
            <div>
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">
                📋 Evidence: {task.evidence.label}
              </p>
              <div className="rounded border overflow-hidden" style={{ borderColor: '#1B3A6B' }}>
                {task.evidence.rows.map((row, i) => (
                  <div key={i}
                    className={`flex gap-3 px-3 py-1.5 font-mono text-xs
                      ${row.highlight ? 'bg-red-950/40 text-red-200' : i % 2 === 0 ? 'bg-[#0d1b2e] text-slate-400' : 'bg-[#111f38] text-slate-400'}`}>
                    {row.cols.map((c, j) => (
                      <span key={j} className="shrink-0">{c}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* External resource */}
          {task.resource && (
            <a href={task.resource.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded border text-sm font-mono transition-all w-full
                         border-[#1B3A6B] text-slate-300 hover:border-[#00AEEF] hover:text-white"
              style={{ backgroundColor: '#162d52' }}>
              {task.resource.label}
              <span className="ml-auto text-slate-500 text-xs">opens in new tab ↗</span>
            </a>
          )}

          {/* Hints */}
          {!done && (
            <div>
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">
                Hints — each hint costs 5 points
              </p>
              <div className="space-y-2">
                {task.hints.map((hint, i) => (
                  <div key={i}>
                    {hintsShown > i ? (
                      <div className="flex gap-2 text-xs font-mono bg-yellow-900/20 border border-yellow-800 rounded px-3 py-2 text-yellow-200">
                        <span>💡</span><span>{hint}</span>
                      </div>
                    ) : i === hintsShown ? (
                      <button onClick={() => setHints(h => h + 1)}
                        className="text-xs font-mono px-3 py-1.5 rounded border border-slate-700 text-slate-500
                                   hover:border-yellow-700 hover:text-yellow-400 transition-all w-full text-left">
                        💡 Reveal Hint {i + 1} (−5 pts)
                      </button>
                    ) : (
                      <div className="text-xs font-mono text-slate-700 px-3 py-1.5">
                        💡 Hint {i + 1} — reveal earlier hints first
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Answer area */}
          {done ? (
            <div className="rounded border border-green-700 bg-green-950/20 p-4">
              <p className="text-xs font-mono text-green-400 mb-1">✓ Completed — +{progress?.score} points</p>
              {progress?.answer && (
                <p className="text-sm text-slate-300 font-mono">"{progress.answer}"</p>
              )}
            </div>
          ) : grabbed && ismine ? (
            <div>
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">Your Answer</p>

              {task.type === 'multiple_choice' && task.options && (
                <div className="space-y-2">
                  {task.options.map(opt => (
                    <button key={opt} onClick={() => setAnswer(opt)}
                      className={`w-full text-left px-3 py-2.5 rounded text-sm font-mono border transition-all
                        ${answer === opt
                          ? 'border-[#00AEEF] text-white bg-[#00AEEF]/10'
                          : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}>
                      {answer === opt ? '▶ ' : '  '}{opt}
                    </button>
                  ))}
                </div>
              )}

              {(task.type === 'free_text' || task.type === 'external_lookup') && (
                <textarea
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  placeholder={task.type === 'external_lookup'
                    ? 'Record what you found in the external tool...'
                    : 'Type your findings here...'}
                  rows={4}
                  className="w-full bg-[#0d1b2e] border rounded px-3 py-2 text-white font-mono text-sm
                             focus:outline-none focus:border-[#00AEEF] resize-none transition-colors"
                  style={{ borderColor: '#1B3A6B' }}
                />
              )}
            </div>
          ) : grabbed && !ismine ? (
            <div className="rounded border border-yellow-800 bg-yellow-950/20 p-4 text-sm font-mono text-yellow-300">
              🔒 {progress?.member_name} is working on this task
            </div>
          ) : null}
        </div>

        {/* Panel footer */}
        {!done && (
          <div className="p-4 border-t shrink-0 flex gap-3" style={{ borderColor: '#1B3A6B' }}>
            {status === 'available' ? (
              <button onClick={onGrab}
                className="flex-1 py-3 rounded font-bold text-sm transition-all"
                style={{ backgroundColor: '#00AEEF', color: '#0d1b2e' }}>
                🎯 Grab This Task
              </button>
            ) : grabbed && ismine ? (
              <>
                <button onClick={onRelease}
                  className="px-4 py-3 rounded border border-slate-600 text-slate-400 text-sm font-mono
                             hover:border-red-700 hover:text-red-400 transition-all">
                  Release
                </button>
                <button onClick={handleSubmit} disabled={!answer.trim() || submitting}
                  className="flex-1 py-3 rounded font-bold text-sm disabled:opacity-40 transition-all"
                  style={{ backgroundColor: '#00AEEF', color: '#0d1b2e' }}>
                  {submitting ? 'Submitting...' : '📤 Submit Findings'}
                </button>
              </>
            ) : (
              <p className="text-sm font-mono text-slate-500 py-3">
                Assigned to {progress?.member_name}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}

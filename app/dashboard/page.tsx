'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Team, type Member, type TaskProgress } from '@/lib/supabase'
import { TASKS, SCENARIO, STAGE_UNLOCK_REQUIREMENTS, type Task } from '@/lib/challenge-data'

// ── Theme ─────────────────────────────────────────────────────────────────────

type Theme = { bg: string; panel: string; panel2: string; border: string; accent: string; fg: string }

function mkTheme(hc: boolean): Theme {
  return hc
    ? { bg: '#000', panel: '#111', panel2: '#222', border: '#fff', accent: '#facc15', fg: '#000' }
    : { bg: '#0d1b2e', panel: '#0f2340', panel2: '#162d52', border: '#1B3A6B', accent: '#00AEEF', fg: '#0d1b2e' }
}

const ThemeCtx = createContext<Theme>(mkTheme(false))

// ── Alert types ───────────────────────────────────────────────────────────────

type AlertEvent = {
  id: string
  title: string
  description: string
  options: string[]
  correct_answer: string
  bonus_points: number
  duration_secs: number
  fired_at: string
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

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
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [hc, setHc]           = useState(false)
  const [team, setTeam]       = useState<Team | null>(null)
  const [member, setMember]   = useState<Member | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [progress, setProgress] = useState<TaskProgress[]>([])
  const [active, setActive]   = useState<Task | null>(null)
  const [timeLeft, setTimeLeft] = useState(SCENARIO.duration * 60)
  const [teamTimer, setTeamTimer] = useState<{ startedAt: string | null; durationMins: number }>({ startedAt: null, durationMins: SCENARIO.duration })

  // Alert state
  const [alert, setAlert]         = useState<AlertEvent | null>(null)
  const [alertAnswer, setAnswer]  = useState<{ text: string; score: number } | null>(null)
  const [alertSecs, setAlertSecs] = useState(0)

  useEffect(() => {
    if (localStorage.getItem('soc_hc') === 'true') setHc(true)
  }, [])

  function toggleHC() {
    setHc(h => {
      localStorage.setItem('soc_hc', String(!h))
      return !h
    })
  }

  // Bootstrap + subscriptions
  useEffect(() => {
    const teamId     = localStorage.getItem('soc_team_id')
    const teamName   = localStorage.getItem('soc_team_name')
    const memberId   = localStorage.getItem('soc_member_id')
    const memberName = localStorage.getItem('soc_member_name')
    if (!teamId || !memberId) { router.push('/'); return }
    setMember({ id: memberId, team_id: teamId, name: memberName ?? '', created_at: '' })
    // Fetch full team record for timer
    supabase.from('soc_teams').select('*').eq('id', teamId).single()
      .then(({ data }) => {
        if (data) {
          setTeam(data)
          setTeamTimer({ startedAt: data.started_at, durationMins: data.duration_mins })
        } else {
          setTeam({ id: teamId, name: teamName ?? '', pin: '', started_at: null, duration_mins: SCENARIO.duration, created_at: '' })
        }
      })

    const loadProgress = () =>
      supabase.from('soc_task_progress').select('*').eq('team_id', teamId)
        .then(({ data }) => { if (data) setProgress(data) })
    supabase.from('soc_members').select('*').eq('team_id', teamId)
      .then(({ data }) => { if (data) setMembers(data) })
    loadProgress()

    // Check for any alert that fired recently and is still live
    const checkAlert = async () => {
      const { data } = await supabase
        .from('soc_alerts').select('*').order('fired_at', { ascending: false }).limit(1)
      if (!data?.length) return
      const a = data[0] as AlertEvent & { options: string[] }
      const age = (Date.now() - new Date(a.fired_at).getTime()) / 1000
      if (age >= a.duration_secs) return
      // Already responded?
      const { data: resp } = await supabase
        .from('soc_alert_responses').select('answer, score')
        .eq('alert_id', a.id).eq('team_id', teamId).single()
      setAlert(a)
      if (resp) {
        setAnswer({ text: resp.answer, score: resp.score })
        setAlertSecs(0)
      } else {
        setAlertSecs(Math.ceil(a.duration_secs - age))
      }
    }
    checkAlert()

    const ch = supabase.channel(`dash_${teamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_task_progress',
          filter: `team_id=eq.${teamId}` }, loadProgress)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_members',
          filter: `team_id=eq.${teamId}` }, () => {
        supabase.from('soc_members').select('*').eq('team_id', teamId)
          .then(({ data }) => { if (data) setMembers(data) })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'soc_teams',
          filter: `id=eq.${teamId}` }, (payload) => {
        const t = payload.new as { started_at: string | null; duration_mins: number; name: string; pin: string; id: string; created_at: string }
        setTeam(prev => prev ? { ...prev, ...t } : prev)
        setTeamTimer({ startedAt: t.started_at, durationMins: t.duration_mins })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'soc_alerts' },
        (payload) => {
          const a = payload.new as AlertEvent
          setAlert({ ...a, options: a.options as unknown as string[] })
          setAnswer(null)
          setAlertSecs(a.duration_secs)
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [router])

  // Main timer — driven by team's started_at from Supabase
  useEffect(() => {
    const iv = setInterval(() => {
      if (!teamTimer.startedAt) {
        setTimeLeft(teamTimer.durationMins * 60)
        return
      }
      const elapsed = Math.floor((Date.now() - new Date(teamTimer.startedAt).getTime()) / 1000)
      setTimeLeft(Math.max(0, teamTimer.durationMins * 60 - elapsed))
    }, 1000)
    return () => clearInterval(iv)
  }, [teamTimer])

  // Alert countdown
  useEffect(() => {
    if (!alert || alertAnswer || alertSecs <= 0) return
    const iv = setInterval(() => {
      setAlertSecs(s => {
        if (s <= 1) {
          setAnswer({ text: '', score: 0 })   // expired
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [alert, alertAnswer, alertSecs])

  const getProgress = useCallback((taskId: string) => progress.find(p => p.task_id === taskId), [progress])

  const completedInStage = useCallback((stage: number) =>
    TASKS.filter(t => t.stage === stage && getProgress(t.id)?.status === 'completed').length, [getProgress])

  function isUnlocked(stage: number) {
    if (stage === 1) return true
    return completedInStage(stage - 1) >= STAGE_UNLOCK_REQUIREMENTS[stage as 2 | 3]
  }

  const teamScore = progress.reduce((s, p) => s + (p.score ?? 0), 0)
  const completedCount = progress.filter(p => p.status === 'completed' && !p.task_id.startsWith('alert_')).length

  async function grabTask(task: Task) {
    if (!team || !member) return
    await supabase.from('soc_task_progress').upsert({
      team_id: team.id, task_id: task.id,
      member_id: member.id, member_name: member.name,
      status: 'in_progress', grabbed_at: new Date().toISOString(),
    }, { onConflict: 'team_id,task_id' })
    setActive(task)
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
    score = Math.max(0, score)
    await supabase.from('soc_task_progress').upsert({
      team_id: team.id, task_id: task.id,
      member_id: member?.id, member_name: member?.name,
      status: 'completed', answer, score, hints_used: hintsUsed,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'team_id,task_id' })
    setActive(null)
  }

  async function submitAlertAnswer(a: AlertEvent, answer: string) {
    if (!team) return
    const correct = answer === a.correct_answer
    // Score scales with how fast they answered
    const elapsed = (Date.now() - new Date(a.fired_at).getTime()) / 1000
    const remaining = Math.max(0, a.duration_secs - elapsed)
    const score = correct ? Math.max(1, Math.ceil(a.bonus_points * remaining / a.duration_secs)) : 0
    await supabase.from('soc_alert_responses').upsert(
      { alert_id: a.id, team_id: team.id, answer, score, answered_at: new Date().toISOString() },
      { onConflict: 'alert_id,team_id' }
    )
    if (correct) {
      await supabase.from('soc_task_progress').upsert({
        team_id: team.id, task_id: `alert_${a.id}`,
        member_id: member?.id, member_name: member?.name,
        status: 'completed', answer, score, hints_used: 0,
        completed_at: new Date().toISOString(),
      }, { onConflict: 'team_id,task_id' })
    }
    setAnswer({ text: answer, score })
  }

  const th = mkTheme(hc)
  if (!team) return null

  return (
    <ThemeCtx.Provider value={th}>
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: th.bg }}>

        {/* Header */}
        <header className="flex items-center justify-between px-4 py-2 border-b shrink-0"
          style={{ backgroundColor: th.panel, borderColor: th.border }}>
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="CNC" className="h-8 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <div>
              <div className="text-xs font-mono text-slate-400">OPERATION: DARK HARBOUR</div>
              <div className="text-xs font-mono font-bold" style={{ color: th.accent }}>
                TEAM: {team.name.toUpperCase()} · {member?.name}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {teamTimer.startedAt ? (
              <div className={"font-mono font-bold text-lg " + (timeLeft < 120 ? 'text-red-400 animate-pulse' : 'text-white')}>
                ⏱ {formatTime(timeLeft)}
              </div>
            ) : (
              <div className="font-mono text-sm text-slate-500 border border-slate-700 rounded px-3 py-1.5">
                ⏱ Waiting to start…
              </div>
            )}
            <button onClick={toggleHC} title={hc ? 'High contrast ON' : 'High contrast OFF'}
              className={"text-xs font-mono px-2 py-1.5 rounded border transition-all " +
                (hc ? 'border-yellow-400 text-yellow-300 bg-yellow-900/20'
                    : 'border-slate-600 text-slate-400 hover:border-slate-400 hover:text-white')}>
              ◑ {hc ? 'HC ON' : 'HC'}
            </button>
            <button onClick={() => router.push('/leaderboard')}
              className="text-xs font-mono px-3 py-1.5 rounded border border-slate-600 text-slate-400 hover:border-[#00AEEF] hover:text-white transition-all">
              Leaderboard
            </button>
          </div>
        </header>

        {/* Live alert banner */}
        {alert && !alertAnswer && alertSecs > 0 && (
          <div className="px-4 py-2 flex items-center gap-3 border-b"
            style={{ backgroundColor: '#7f1d1d', borderColor: '#dc2626' }}>
            <span className="text-red-300 font-mono text-xs font-bold animate-pulse shrink-0">🚨 LIVE ALERT</span>
            <span className="text-red-200 font-mono text-xs flex-1">{alert.title}</span>
            <span className="font-mono text-xs font-bold text-red-300">{alertSecs}s remaining</span>
            <button onClick={() => setAlert(null)}
              className="text-red-600 hover:text-red-300 text-xs font-mono px-2 py-1 rounded border border-red-800 hover:border-red-600 transition-all">
              Open ↑
            </button>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-52 shrink-0 border-r p-3 flex flex-col gap-4 overflow-y-auto"
            style={{ backgroundColor: th.panel, borderColor: th.border }}>
            <div>
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-1">Team Score</p>
              <div className="text-3xl font-bold font-mono" style={{ color: th.accent }}>{teamScore}</div>
              <p className="text-xs font-mono text-slate-500">{completedCount}/{TASKS.length} tasks done</p>
            </div>
            <div>
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">Progress</p>
              {([1, 2, 3] as const).map(s => {
                const total    = TASKS.filter(t => t.stage === s).length
                const done     = completedInStage(s)
                const unlocked = isUnlocked(s)
                return (
                  <div key={s} className="mb-2">
                    <div className="flex justify-between text-xs font-mono mb-0.5">
                      <span className={unlocked ? 'text-slate-300' : 'text-slate-600'}>Stage {s}</span>
                      <span className={unlocked ? 'text-slate-400' : 'text-slate-600'}>{done}/{total}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800">
                      <div className="h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${total > 0 ? done / total * 100 : 0}%`,
                                 backgroundColor: unlocked ? th.accent : '#334155' }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div>
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">Team Members</p>
              {members.length === 0
                ? <p className="text-xs font-mono text-slate-600">No teammates yet</p>
                : members.map(m => (
                    <div key={m.id} className="flex items-center gap-2 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      <span className={"text-xs font-mono " + (m.id === member?.id ? 'text-white font-bold' : 'text-slate-400')}>
                        {m.name}{m.id === member?.id ? ' (you)' : ''}
                      </span>
                    </div>
                  ))
              }
            </div>
            <div className="text-xs font-mono text-slate-600 leading-relaxed border-t border-slate-800 pt-3">
              Share your team name and PIN so teammates can join from the login page.
            </div>
          </aside>

          {/* Task grid */}
          <main className="flex-1 overflow-y-auto p-4">
            {([1, 2, 3] as const).map(stage => {
              const stageTasks = TASKS.filter(t => t.stage === stage)
              const unlocked   = isUnlocked(stage)
              const req        = STAGE_UNLOCK_REQUIREMENTS[stage as 2 | 3]
              const prevDone   = stage > 1 ? completedInStage(stage - 1) : 0
              return (
                <section key={stage} className="mb-8">
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className={"text-sm font-bold font-mono uppercase tracking-widest " + (unlocked ? 'text-white' : 'text-slate-600')}>
                      {STAGE_LABELS[stage]}
                    </h2>
                    {!unlocked ? (
                      <span className="text-xs font-mono text-slate-500 border border-slate-700 rounded px-2 py-0.5">
                        🔒 Complete {req - prevDone} more Stage {stage - 1} task{req - prevDone !== 1 ? 's' : ''} to unlock
                      </span>
                    ) : (
                      <span className="text-xs font-mono text-green-400 border border-green-800 bg-green-900/20 rounded px-2 py-0.5">
                        ✓ UNLOCKED
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {stageTasks.map(task => (
                      <TaskCard key={task.id} task={task}
                        progress={getProgress(task.id)}
                        myId={member?.id ?? ''}
                        locked={!unlocked}
                        onOpen={() => { if (unlocked) setActive(task) }}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </main>
        </div>

        {/* Task detail panel */}
        {active && (
          <TaskPanel task={active} progress={getProgress(active.id)}
            myId={member?.id ?? ''}
            onClose={() => setActive(null)}
            onGrab={() => grabTask(active)}
            onRelease={() => releaseTask(active)}
            onSubmit={(answer, hints) => submitAnswer(active, answer, hints)}
          />
        )}

        {/* Alert popup */}
        {alert && (
          <AlertPopup alert={alert} answer={alertAnswer} timeLeft={alertSecs}
            onAnswer={ans => submitAlertAnswer(alert, ans)}
            onDismiss={() => setAlert(null)}
          />
        )}
      </div>
    </ThemeCtx.Provider>
  )
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({ task, progress, myId, locked, onOpen }: {
  task: Task; progress: TaskProgress | undefined
  myId: string; locked: boolean; onOpen: () => void
}) {
  const th     = useContext(ThemeCtx)
  const status = progress?.status ?? 'available'
  const ismine = progress?.member_id === myId

  const border =
    locked              ? 'border-slate-800 opacity-50 cursor-not-allowed' :
    status === 'completed'              ? 'border-green-700 bg-green-950/20 cursor-pointer' :
    status === 'in_progress' && ismine  ? 'cursor-pointer' :
    status === 'in_progress'            ? 'border-yellow-700 bg-yellow-950/10 cursor-pointer' :
    'cursor-pointer hover:opacity-90'

  return (
    <div onClick={onOpen}
      className={"rounded-lg border p-3 flex flex-col gap-2 transition-all " + border}
      style={{
        backgroundColor: locked ? th.bg : th.panel,
        borderColor: status === 'in_progress' && ismine ? th.accent :
                     status === 'completed' ? undefined : th.border,
      }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg">{task.categoryIcon}</span>
        <span className="text-xs font-mono font-bold" style={{ color: th.accent }}>{task.points}pts</span>
      </div>
      <div>
        <p className={"text-xs font-bold leading-snug " + (locked ? 'text-slate-600' : 'text-white')}>{task.title}</p>
        <span className={"inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded border " + CAT_COLOURS[task.category]}>
          {task.categoryLabel}
        </span>
        {task.tutorial && !locked && (
          <span className="inline-block mt-1 ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-yellow-800 bg-yellow-900/20 text-yellow-400">
            🛠 Guide
          </span>
        )}
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
            <span className={"text-xs font-mono " + (ismine ? 'font-bold' : 'text-yellow-400')}
              style={ismine ? { color: th.accent } : {}}>
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
  task: Task; progress: TaskProgress | undefined; myId: string
  onClose: () => void; onGrab: () => void; onRelease: () => void
  onSubmit: (answer: string, hintsUsed: number) => void
}) {
  const th = useContext(ThemeCtx)
  const [answer,       setAnswer]  = useState('')
  const [hintsShown,   setHints]   = useState(0)
  const [submitting,   setSub]     = useState(false)
  const [tutorialOpen, setTut]     = useState(!!task.tutorial)

  const status = progress?.status ?? 'available'
  const ismine = progress?.member_id === myId
  const done   = status === 'completed'
  const grabbed = status === 'in_progress'

  async function handleSubmit() {
    if (!answer.trim()) return
    setSub(true)
    await onSubmit(answer, hintsShown)
    setSub(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl z-50 flex flex-col overflow-hidden shadow-2xl"
        style={{ backgroundColor: th.panel, borderLeft: `1px solid ${th.border}` }}>

        <div className="flex items-start justify-between p-4 border-b shrink-0" style={{ borderColor: th.border }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={"text-xs font-mono px-2 py-0.5 rounded border " + CAT_COLOURS[task.category]}>
                {task.categoryIcon} {task.categoryLabel}
              </span>
              <span className="text-xs font-mono font-bold" style={{ color: th.accent }}>{task.points} pts</span>
            </div>
            <h2 className="text-lg font-bold text-white">{task.title}</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none ml-4">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Tutorial */}
          {task.tutorial && (
            <div className="rounded-lg border border-yellow-700 overflow-hidden">
              <button onClick={() => setTut(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-left bg-yellow-900/30 hover:bg-yellow-900/40 transition-all">
                <div className="flex items-center gap-2">
                  <span>🛠</span>
                  <span className="text-sm font-bold text-yellow-300">How to use {task.tutorial.toolName}</span>
                </div>
                <span className="text-yellow-600 text-sm">{tutorialOpen ? '▲' : '▼'}</span>
              </button>
              {tutorialOpen && (
                <div className="px-4 pb-4 pt-3 space-y-4 bg-yellow-950/20">
                  <div>
                    <p className="text-xs font-mono text-yellow-500 uppercase tracking-widest mb-1">What is it?</p>
                    <p className="text-sm text-slate-300 leading-relaxed">{task.tutorial.whatItIs}</p>
                  </div>
                  <div>
                    <p className="text-xs font-mono text-yellow-500 uppercase tracking-widest mb-1">Why SOC analysts use it</p>
                    <p className="text-sm text-slate-300 leading-relaxed">{task.tutorial.whySocUseIt}</p>
                  </div>
                  <div>
                    <p className="text-xs font-mono text-yellow-500 uppercase tracking-widest mb-2">Step-by-step</p>
                    <ol className="space-y-1.5">
                      {task.tutorial.steps.map((step, i) => (
                        <li key={i} className="flex gap-3 text-sm text-slate-300">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-yellow-800 text-yellow-300 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <p className="text-xs font-mono text-yellow-500 uppercase tracking-widest mb-2">What to look for</p>
                    <ul className="space-y-1">
                      {task.tutorial.lookFor.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-300">
                          <span className="text-yellow-500 shrink-0">→</span><span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded border border-yellow-600 bg-yellow-900/40 p-3">
                    <p className="text-xs font-mono text-yellow-400 uppercase tracking-widest mb-1">{task.tutorial.lookupLabel}</p>
                    <p className="font-mono text-lg font-bold text-white tracking-widest">{task.tutorial.lookupValue}</p>
                    <p className="text-xs text-yellow-600 mt-1">Type this into the tool — do not follow a pre-filled link.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{task.description}</p>

          {/* Evidence */}
          {task.evidence && (
            <div>
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">📋 {task.evidence.label}</p>
              <div className="rounded border overflow-hidden" style={{ borderColor: th.border }}>
                {task.evidence.rows.map((row, i) => (
                  <div key={i}
                    className={"flex gap-3 px-3 py-1.5 font-mono text-xs " +
                      (row.highlight ? 'bg-red-950/40 text-red-200' : i % 2 === 0 ? 'text-slate-400' : 'text-slate-400')}
                    style={{ backgroundColor: row.highlight ? undefined : i % 2 === 0 ? th.bg : th.panel }}>
                    {row.cols.map((c, j) => <span key={j} className="shrink-0">{c}</span>)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resource link */}
          {task.resource && (
            <a href={task.resource.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded border text-sm font-mono transition-all w-full hover:opacity-90"
              style={{ backgroundColor: th.panel2, borderColor: th.border, color: '#e2e8f0' }}>
              {task.resource.label}
              <span className="ml-auto text-slate-500 text-xs">↗</span>
            </a>
          )}

          {/* Hints */}
          {!done && (
            <div>
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">Hints — each costs 5 points</p>
              <div className="space-y-2">
                {task.hints.map((hint, i) => (
                  <div key={i}>
                    {hintsShown > i ? (
                      <div className="flex gap-2 text-xs font-mono bg-yellow-900/20 border border-yellow-800 rounded px-3 py-2 text-yellow-200">
                        <span>💡</span><span>{hint}</span>
                      </div>
                    ) : i === hintsShown ? (
                      <button onClick={() => setHints(h => h + 1)}
                        className="text-xs font-mono px-3 py-1.5 rounded border border-slate-700 text-slate-500 hover:border-yellow-700 hover:text-yellow-400 transition-all w-full text-left">
                        💡 Reveal Hint {i + 1} (−5 pts)
                      </button>
                    ) : (
                      <div className="text-xs font-mono text-slate-700 px-3 py-1.5">💡 Hint {i + 1} — reveal earlier hints first</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Answer */}
          {done ? (
            <div className="rounded border border-green-700 bg-green-950/20 p-4">
              <p className="text-xs font-mono text-green-400 mb-1">✓ Completed — +{progress?.score} points</p>
              {progress?.answer && <p className="text-sm text-slate-300 font-mono">"{progress.answer}"</p>}
            </div>
          ) : grabbed && ismine ? (
            <div>
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">Your Answer</p>
              {task.type === 'multiple_choice' && task.options && (
                <div className="space-y-2">
                  {task.options.map(opt => (
                    <button key={opt} onClick={() => setAnswer(opt)}
                      className={"w-full text-left px-3 py-2.5 rounded text-sm font-mono border transition-all " +
                        (answer === opt ? 'text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200')}
                      style={answer === opt ? { borderColor: th.accent, backgroundColor: `${th.accent}18` } : {}}>
                      {answer === opt ? '▶ ' : '  '}{opt}
                    </button>
                  ))}
                </div>
              )}
              {(task.type === 'free_text' || task.type === 'external_lookup') && (
                <textarea value={answer} onChange={e => setAnswer(e.target.value)}
                  placeholder={task.type === 'external_lookup' ? 'Record what you found in the tool...' : 'Type your findings here...'}
                  rows={5}
                  className="w-full bg-[#0d1b2e] border rounded px-3 py-2 text-white font-mono text-sm focus:outline-none resize-none transition-colors"
                  style={{ borderColor: th.border }}
                  onFocus={e => { e.target.style.borderColor = th.accent }}
                  onBlur={e => { e.target.style.borderColor = th.border }} />
              )}
            </div>
          ) : grabbed && !ismine ? (
            <div className="rounded border border-yellow-800 bg-yellow-950/20 p-4 text-sm font-mono text-yellow-300">
              🔒 {progress?.member_name} is working on this task
            </div>
          ) : null}
        </div>

        {!done && (
          <div className="p-4 border-t shrink-0 flex gap-3" style={{ borderColor: th.border }}>
            {status === 'available' ? (
              <button onClick={onGrab} className="flex-1 py-3 rounded font-bold text-sm transition-all"
                style={{ backgroundColor: th.accent, color: th.fg }}>
                🎯 Grab This Task
              </button>
            ) : grabbed && ismine ? (
              <>
                <button onClick={onRelease}
                  className="px-4 py-3 rounded border border-slate-600 text-slate-400 text-sm font-mono hover:border-red-700 hover:text-red-400 transition-all">
                  Release
                </button>
                <button onClick={handleSubmit} disabled={!answer.trim() || submitting}
                  className="flex-1 py-3 rounded font-bold text-sm disabled:opacity-40 transition-all"
                  style={{ backgroundColor: th.accent, color: th.fg }}>
                  {submitting ? 'Submitting...' : '📤 Submit Findings'}
                </button>
              </>
            ) : (
              <p className="text-sm font-mono text-slate-500 py-3">Assigned to {progress?.member_name}</p>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ── AlertPopup ────────────────────────────────────────────────────────────────

function AlertPopup({ alert, answer, timeLeft, onAnswer, onDismiss }: {
  alert: AlertEvent
  answer: { text: string; score: number } | null
  timeLeft: number
  onAnswer: (a: string) => void
  onDismiss: () => void
}) {
  const th      = useContext(ThemeCtx)
  const expired = answer !== null && answer.text === ''
  const correct = answer !== null && answer.text === alert.correct_answer
  const pct     = Math.max(0, (timeLeft / alert.duration_secs) * 100)

  return (
    <>
      <div className="fixed inset-0 bg-black/80 z-50" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-xl border-2 overflow-hidden shadow-2xl"
          style={{ borderColor: '#dc2626', backgroundColor: th.bg }}>

          {/* Alert header */}
          <div className="px-5 py-4 flex items-center gap-3" style={{ backgroundColor: '#7f1d1d' }}>
            <span className="text-2xl">{answer ? (correct ? '✅' : expired ? '⏰' : '❌') : '🚨'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-red-300 uppercase tracking-widest">Bonus Alert — Quick Decision</p>
              <h2 className="text-white font-bold leading-tight">{alert.title}</h2>
            </div>
            <div className="text-right shrink-0">
              {!answer ? (
                <>
                  <div className={"text-2xl font-bold font-mono " + (timeLeft <= 10 ? 'text-red-300 animate-pulse' : 'text-white')}>
                    {timeLeft}s
                  </div>
                  <div className={"text-lg font-bold font-mono " + (timeLeft <= 10 ? 'text-red-300' : 'text-yellow-300')}>
                    +{Math.max(1, Math.ceil(alert.bonus_points * timeLeft / alert.duration_secs))} pts
                  </div>
                </>
              ) : (
                <div className={"text-xl font-bold font-mono " + (correct ? 'text-green-400' : 'text-red-400')}>
                  {correct ? `+${answer.score}` : '0'} pts
                </div>
              )}
            </div>
          </div>

          {/* Countdown bar */}
          {!answer && (
            <div className="h-1.5 bg-red-950">
              <div className="h-1.5 bg-red-500 transition-all duration-1000" style={{ width: `${pct}%` }} />
            </div>
          )}

          <div className="p-5 space-y-4">
            <p className="text-slate-200 text-sm leading-relaxed">{alert.description}</p>

            {!answer ? (
              <div className="space-y-2">
                {alert.options.map(opt => (
                  <button key={opt} onClick={() => onAnswer(opt)}
                    className="w-full text-left px-4 py-3 rounded border text-sm font-mono transition-all hover:border-red-400 hover:text-white"
                    style={{ backgroundColor: th.panel2, borderColor: th.border, color: '#e2e8f0' }}>
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <div className={"rounded-lg border p-4 text-center " +
                (expired ? 'border-slate-700' : correct ? 'border-green-600' : 'border-red-700')}
                style={{ backgroundColor: expired ? th.panel : correct ? '#052e16' : '#450a0a' }}>
                {expired ? (
                  <>
                    <p className="text-slate-400 font-bold font-mono">Time's up — no points awarded</p>
                    <p className="text-xs text-slate-500 font-mono mt-1">Correct: {alert.correct_answer}</p>
                  </>
                ) : correct ? (
                  <>
                    <p className="text-green-400 font-bold font-mono text-lg">Correct! +{answer.score} pts</p>
                    <p className="text-xs text-slate-400 font-mono mt-1">Good instincts under pressure</p>
                  </>
                ) : (
                  <>
                    <p className="text-red-400 font-bold font-mono">Incorrect — 0 pts</p>
                    <p className="text-xs text-slate-400 font-mono mt-1">Correct: {alert.correct_answer}</p>
                  </>
                )}
              </div>
            )}

            {answer && (
              <button onClick={onDismiss} className="w-full py-2.5 rounded text-sm font-mono font-bold transition-all"
                style={{ backgroundColor: th.accent, color: th.fg }}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Team } from '@/lib/supabase'

type Mode = 'start' | 'join' | 'create'

export default function LoginPage() {
  const router = useRouter()
  const [liveTeams, setLiveTeams]   = useState<Team[]>([])
  const [mode, setMode]             = useState<Mode>('start')
  const [teamName, setTeamName]     = useState('')
  const [memberName, setMemberName] = useState('')
  const [pin, setPin]               = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    supabase.from('soc_teams').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setLiveTeams(data) })
    const channel = supabase.channel('login_teams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_teams' }, () => {
        supabase.from('soc_teams').select('*').order('created_at', { ascending: false })
          .then(({ data }) => { if (data) setLiveTeams(data) })
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  function selectTeam(team: Team) { setTeamName(team.name); setMode('join'); setError('') }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!teamName.trim() || !memberName.trim() || !pin) return
    setLoading(true)
    try {
      const { data: team } = await supabase.from('soc_teams').select('*').eq('name', teamName.trim()).single()
      if (!team) { setError('Team not found.'); setLoading(false); return }
      if (team.pin !== pin) { setError('Incorrect PIN.'); setLoading(false); return }
      const { data: member, error: mErr } = await supabase.from('soc_members')
        .upsert({ team_id: team.id, name: memberName.trim() }, { onConflict: 'team_id,name' })
        .select().single()
      if (mErr || !member) throw mErr
      localStorage.setItem('soc_team_id', team.id)
      localStorage.setItem('soc_team_name', team.name)
      localStorage.setItem('soc_member_id', member.id)
      localStorage.setItem('soc_member_name', member.name)
      router.push('/dashboard')
    } catch (err) { console.error(err); setError('Something went wrong. Please try again.') }
    finally { setLoading(false) }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!teamName.trim() || !memberName.trim() || pin.length !== 4 || pin !== confirmPin) {
      setError(pin !== confirmPin ? 'PINs do not match.' : 'Please fill in all fields.'); return
    }
    setLoading(true)
    try {
      const { data: existing } = await supabase.from('soc_teams').select('id').eq('name', teamName.trim()).single()
      if (existing) { setError('Team name taken. Choose another or join it.'); setLoading(false); return }
      const { data: team, error: tErr } = await supabase.from('soc_teams')
        .insert({ name: teamName.trim(), pin }).select().single()
      if (tErr || !team) throw tErr
      const { data: member, error: mErr } = await supabase.from('soc_members')
        .insert({ team_id: team.id, name: memberName.trim() }).select().single()
      if (mErr || !member) throw mErr
      localStorage.setItem('soc_team_id', team.id)
      localStorage.setItem('soc_team_name', team.name)
      localStorage.setItem('soc_member_id', member.id)
      localStorage.setItem('soc_member_name', member.name)
      router.push('/dashboard')
    } catch (err) { console.error(err); setError('Could not create team. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `linear-gradient(rgba(0,174,239,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,174,239,0.4) 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }} />
      <div className="relative z-10 w-full max-w-md space-y-5">
        <div className="text-center">
          <img src="/logo.png" alt="Cardinal Newman College" className="h-14 object-contain mx-auto mb-4"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <div className="inline-flex items-center gap-2 bg-red-600/20 border border-red-600 text-red-400 text-xs font-mono px-3 py-1 rounded mb-3">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            ACTIVE INCIDENT DETECTED
          </div>
          <h1 className="text-3xl font-bold text-white">
            Operation: <span style={{ color: '#00AEEF' }}>Dark Harbour</span>
          </h1>
          <p className="text-slate-400 font-mono text-sm mt-1">SOC Challenge — Cardinal Newman College</p>
        </div>

        {liveTeams.length > 0 && mode === 'start' && (
          <div className="rounded-lg border p-4" style={{ backgroundColor: '#0f2340', borderColor: '#1B3A6B' }}>
            <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">Active Teams — Click to Join</p>
            <div className="flex flex-wrap gap-2">
              {liveTeams.map(t => (
                <button key={t.id} onClick={() => selectTeam(t)}
                  className="px-3 py-1.5 rounded border border-[#1B3A6B] text-sm font-mono text-slate-300 hover:border-[#00AEEF] hover:text-white transition-all">
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'start' && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setMode('join')}
              className="py-3 rounded border border-[#1B3A6B] text-sm font-mono text-slate-300 hover:border-[#00AEEF] hover:text-white transition-all"
              style={{ backgroundColor: '#0f2340' }}>
              Join Existing Team
            </button>
            <button onClick={() => setMode('create')}
              className="py-3 rounded text-sm font-mono font-bold transition-all"
              style={{ backgroundColor: '#00AEEF', color: '#0d1b2e' }}>
              Create New Team
            </button>
          </div>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoin} className="rounded-lg border p-5 space-y-4"
            style={{ backgroundColor: '#0f2340', borderColor: '#1B3A6B' }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">Join a Team</p>
              <button type="button" onClick={() => { setMode('start'); setError('') }}
                className="text-xs font-mono text-slate-500 hover:text-slate-300">Back</button>
            </div>
            <Field label="Team Name" value={teamName} onChange={setTeamName} placeholder="e.g. Alpha Squad" />
            <Field label="Your Name" value={memberName} onChange={setMemberName} placeholder="First name or nickname" />
            <Field label="Team PIN" value={pin} onChange={setPin} placeholder="4-digit PIN" type="password" maxLength={4} />
            {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded font-bold text-sm disabled:opacity-40 transition-all"
              style={{ backgroundColor: '#00AEEF', color: '#0d1b2e' }}>
              {loading ? 'Joining...' : 'Enter SOC'}
            </button>
          </form>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="rounded-lg border p-5 space-y-4"
            style={{ backgroundColor: '#0f2340', borderColor: '#1B3A6B' }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">Create a Team</p>
              <button type="button" onClick={() => { setMode('start'); setError('') }}
                className="text-xs font-mono text-slate-500 hover:text-slate-300">Back</button>
            </div>
            <Field label="Team Name" value={teamName} onChange={setTeamName} placeholder="Choose a team name" />
            <Field label="Your Name" value={memberName} onChange={setMemberName} placeholder="First name or nickname" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Set PIN" value={pin} onChange={setPin} placeholder="4 digits" type="password" maxLength={4} />
              <Field label="Confirm PIN" value={confirmPin} onChange={setConfirmPin} placeholder="4 digits" type="password" maxLength={4} />
            </div>
            <p className="text-xs font-mono text-slate-500">Share this PIN with teammates so they can join.</p>
            {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded font-bold text-sm disabled:opacity-40 transition-all"
              style={{ backgroundColor: '#00AEEF', color: '#0d1b2e' }}>
              {loading ? 'Creating...' : 'Create and Enter SOC'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', maxLength }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder: string; type?: string; maxLength?: number
}) {
  return (
    <div>
      <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest mb-1">{label}</label>
      <input type={type} value={value} maxLength={maxLength} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0d1b2e] border rounded px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#00AEEF] transition-colors"
        style={{ borderColor: '#1B3A6B' }} />
    </div>
  )
}

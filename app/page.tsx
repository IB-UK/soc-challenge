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
    supabase
      .from('soc_teams')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setLiveTeams(data) })

    const channel = supabase
      .channel('login_teams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soc_teams' }, () => {
        supabase.from('soc_teams').select('*').order('created_at', { ascending: false })
          .then(({ data }) => { if (data) setLiveTeams(data) })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  function selectTeam(team: Team) {
    setTeamName(team.name)
    setMode('join')
    setError('')
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!teamName.trim() || !memberName.trim() || !pin) return
    setLoading(true)
    try {
      const { data: team } = await supabase
        .from('soc_teams')
        .select('*')
        .eq('name', teamName.trim())
        .single()

      if (!team) { setError('Team not found.'); setLoading(false); return }
      if (team.pin !== pin) { setError('Incorrect PIN.'); setLoading(false); return }

      const { data: member, error: mErr } = await supabase
        .from('soc_members')
        .upsert({ team_id: team.id, name: memberName.trim() }, { onConflict: 'team_id,name' })
        .select().single()

      if (mErr || !member) throw mErr

      localStorage.setItem('soc_team_id',     team.id)
      localStorage.setItem('soc_team_name',   team.name)
      localStorage.setItem('soc_member_id',   member.id)
      localStorage.setItem('soc_member_name', member.name)
      router.push('/dashboard')
    } catch (err) {
      console.error(err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!teamName.trim() || !memberName.trim() || pin.length !== 4 || pin !== confirmPin) {
      setError(pin !== confirmPin ? 'PINs do not match.' : 'Please fill in all fields.')
      return
    }
    setLoading(true)
    try {
      const { data: existing } = await supabase
        .from('soc_teams')
        .select('id')
        .eq('name', teamName.trim())
        .single()

      if (existing) { setError('That team name is already taken. Choose another or join it instead.'); setLoading(false); return }

      const { data: team, error: tErr } = await supabase
        .from('soc_teams')
        .insert({ name: teamName.trim(), pin })
        .select().single()

      if (tErr || !team) throw tErr

      const { data: member, error: mErr } = await supabase
        .from('soc_members')
        .insert({ team_id: team.id, name: memberName.trim() })
        .select().single()

      if (mErr || !member) throw mErr

      localStorage.setItem('soc_team_id',     team.id)
      localStorage.setItem('soc_team_name',   team.name)
      localStorage.setItem('soc_member_id',   member.id)
      localStorage.setItem('soc_member_name', member.name)
      router.push('/dashboard')
    } catch (err) {
      console.error(err)
      setError('Could not create team. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `linear-gradient(rgba(0,174,239,0.4) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(0,174,239,0.4) 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }} />

      <div className="relative z-10 w-full max-w-md space-y-5">
        {/* Logo + title */}
        <div className="text-center">
          <img src="/logo.png" alt="Cardinal Newman College" cla
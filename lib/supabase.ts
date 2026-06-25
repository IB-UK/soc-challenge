import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Team = {
  id: string
  name: string
  pin: string
  started_at: string | null
  duration_mins: number
  created_at: string
}

export type Member = {
  id: string
  team_id: string
  name: string
  created_at: string
}

export type TaskProgress = {
  id: string
  team_id: string
  task_id: string
  member_id: string | null
  member_name: string | null
  status: 'available' | 'in_progress' | 'completed'
  answer: string | null
  score: number
  hints_used: number
  grabbed_at: string | null
  completed_at: string | null
}

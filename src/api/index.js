import { makeSupabaseApi } from './supabase.js'
import { makeLocalApi } from './local.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const api = url && key ? makeSupabaseApi(url, key) : makeLocalApi()

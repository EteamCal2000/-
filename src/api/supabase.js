import { createClient } from '@supabase/supabase-js'

export function makeSupabaseApi(url, key) {
  const sb = createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } })

  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args)
    if (error) throw new Error(error.message)
    return data
  }

  return {
    mode: 'live',

    async listPods() {
      const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
      const { data, error } = await sb
        .from('pods')
        .select('*, members(*)')
        .gte('depart_at', since)
        .order('depart_at', { ascending: true })
        .limit(200)
      if (error) throw new Error(error.message)
      return data
    },

    async getPod(id) {
      const { data, error } = await sb.from('pods').select('*, members(*), messages(*)').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      if (data) {
        data.members.sort((a, b) => a.joined_at.localeCompare(b.joined_at))
        data.messages.sort((a, b) => a.id - b.id)
      }
      return data
    },

    createPod: (me, f) => rpc('create_pod', {
      p_user: me.id, p_name: me.nickname, p_origin: f.origin, p_dest: f.dest, p_at: f.departAt,
      p_capacity: f.capacity, p_max_luggage: f.maxLuggage, p_luggage: f.luggage, p_note: f.note,
    }),
    joinPod: (me, podId, luggage) => rpc('join_pod', { p_pod: podId, p_user: me.id, p_name: me.nickname, p_luggage: luggage }),
    leavePod: (me, podId) => rpc('leave_pod', { p_pod: podId, p_user: me.id }),
    setFare: (me, podId, fare) => rpc('set_fare', { p_pod: podId, p_user: me.id, p_fare: fare }),
    markPaid: (me, podId, paid) => rpc('mark_paid', { p_pod: podId, p_user: me.id, p_paid: paid }),
    sendMessage: (me, podId, body) => rpc('send_message', { p_pod: podId, p_user: me.id, p_body: body }),

    subscribe(onChange) {
      const ch = sb
        .channel('gachika-all')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pods' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, onChange)
        .subscribe()
      return () => { sb.removeChannel(ch) }
    },
  }
}

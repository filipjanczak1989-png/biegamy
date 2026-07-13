import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const url = new URL(req.url)
  const athleteId = url.searchParams.get('athlete_id')

  if (!athleteId) {
    return new Response(JSON.stringify({ error: 'Missing athlete_id' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Pobierz tokeny zawodnika
  const { data: athlete, error: athErr } = await supabase
    .from('athletes')
    .select('strava_access_token, strava_refresh_token, strava_token_expires_at, strava_athlete_id')
    .eq('id', athleteId)
    .single()

  if (athErr || !athlete?.strava_access_token) {
    return new Response(JSON.stringify({ error: 'No Strava token' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Odśwież token jeśli wygasł
  let accessToken = athlete.strava_access_token
  const now = Math.floor(Date.now() / 1000)

  if (athlete.strava_token_expires_at && athlete.strava_token_expires_at < now) {
    const refreshRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('STRAVA_CLIENT_ID'),
        client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
        grant_type: 'refresh_token',
        refresh_token: athlete.strava_refresh_token,
      }),
    })
    const refreshData = await refreshRes.json()
    if (refreshData.access_token) {
      accessToken = refreshData.access_token
      await supabase.from('athletes').update({
        strava_access_token: refreshData.access_token,
        strava_refresh_token: refreshData.refresh_token,
        strava_token_expires_at: refreshData.expires_at,
      }).eq('id', athleteId)
    }
  }

  // Pobierz aktywności ze Stravy (ostatnie 30)
  const activitiesRes = await fetch(
    'https://www.strava.com/api/v3/athlete/activities?per_page=30',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  )
  const activities = await activitiesRes.json()
  console.log('Activities count:', activities.length)

  if (!Array.isArray(activities)) {
    return new Response(JSON.stringify({ error: 'Strava error', details: activities }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Zapisz aktywności w bazie
  const toInsert = activities
    .filter(a => a.type === 'Run' || a.sport_type === 'Run')
    .map(a => ({
      id: a.id,
      athlete_id: athleteId,
      name: a.name,
      distance: a.distance,
      moving_time: a.moving_time,
      elapsed_time: a.elapsed_time,
      type: a.sport_type || a.type,
      start_date: a.start_date,
      average_speed: a.average_speed,
      average_heartrate: a.average_heartrate || null,
      max_heartrate: a.max_heartrate || null,
      total_elevation_gain: a.total_elevation_gain,
      map_polyline: a.map?.summary_polyline || null,
      synced_at: new Date().toISOString(),
    }))

  const { error: insertErr } = await supabase
    .from('strava_activities')
    .upsert(toInsert, { onConflict: 'id' })

  if (insertErr) {
    return new Response(JSON.stringify({ error: 'DB error', details: insertErr }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ 
    success: true, 
    synced: toInsert.length,
    total: activities.length 
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
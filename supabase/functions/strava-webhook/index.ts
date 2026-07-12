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

  const url = new URL(req.url)

  // GET — weryfikacja subskrypcji przez Stravę
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === Deno.env.get('STRAVA_WEBHOOK_TOKEN')) {
      return new Response(JSON.stringify({ 'hub.challenge': challenge }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    return new Response('Forbidden', { status: 403 })
  }

  // POST — nowe zdarzenie od Stravy
  if (req.method === 'POST') {
    const event = await req.json()
    console.log('Strava webhook event:', JSON.stringify(event))

    // Interesuje nas tylko nowa aktywność
    if (event.object_type !== 'activity' || event.aspect_type !== 'create') {
      return new Response('ok', { headers: corsHeaders })
    }

    const stravaAthleteId = event.owner_id

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Znajdź zawodnika po strava_athlete_id
    const { data: athlete } = await supabase
      .from('athletes')
      .select('id')
      .eq('strava_athlete_id', stravaAthleteId)
      .maybeSingle()

    if (!athlete) {
      console.log('Athlete not found for strava_id:', stravaAthleteId)
      return new Response('ok', { headers: corsHeaders })
    }

    // Wywołaj sync dla tego zawodnika
    const syncUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/strava-sync?athlete_id=${athlete.id}`
    await fetch(syncUrl, {
      headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` }
    })

    console.log('Sync triggered for athlete:', athlete.id)
    return new Response('ok', { headers: corsHeaders })
  }

  return new Response('Method not allowed', { status: 405 })
})
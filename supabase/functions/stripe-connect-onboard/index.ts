import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecret) throw new Error('Stripe secret key missing')

    const stripe = new Stripe(stripeSecret, {
      apiVersion: '2022-11-15',
      httpClient: Stripe.createFetchHttpClient(),
    })

    // Récupérer le token de l'utilisateur
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    
    // Client Supabase avec le token de l'utilisateur pour vérifier son identité
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    // 1. Récupérer le profil pour voir s'il a déjà un stripe_account_id
    // On utilise la Service Role Key car le RLS peut restreindre certaines colonnes ou pour être sûr
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError

    let accountId = profile?.stripe_account_id

    // 2. Si pas de compte, on en crée un Express
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'FR', // Vous pourrez rendre cela dynamique si besoin
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
      })
      
      accountId = account.id

      // Sauvegarder l'ID dans le profil
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ stripe_account_id: accountId })
        .eq('id', user.id)

      if (updateError) throw updateError
    }

    // 3. Générer le lien d'onboarding (Account Link)
    // On doit fournir des URL de retour valides
    const origin = req.headers.get('origin') || 'http://localhost:5173'
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/admin?tab=payments`, // Si l'utilisateur annule/rafraîchit
      return_url: `${origin}/admin?tab=payments&stripe=success`, // Quand c'est fini
      type: 'account_onboarding',
    })

    return new Response(JSON.stringify({ url: accountLink.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (err: any) {
    console.error('Error generating connect link:', err)
    return new Response(JSON.stringify({ error: err.message, debug: err.stack }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Temporarily 200 to read the error from frontend
    })
  }
})

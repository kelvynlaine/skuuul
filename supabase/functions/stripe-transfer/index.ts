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
    const { payoutRequestId } = await req.json()
    if (!payoutRequestId) throw new Error('payoutRequestId is required')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    // Client Supabase avec le token de l'utilisateur pour vérifier son rôle
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    // Client Admin pour lire/écrire
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Vérifier si l'utilisateur appelant est Admin
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (adminProfile?.role !== 'admin') {
      throw new Error('Forbidden: Admins only')
    }

    // 1. Récupérer la demande de virement et le compte stripe du créateur
    const { data: payout, error: payoutError } = await supabaseAdmin
      .from('payout_requests')
      .select('*, profiles(stripe_account_id)')
      .eq('id', payoutRequestId)
      .single()

    if (payoutError || !payout) throw new Error('Payout request not found')
    if (payout.status !== 'pending') throw new Error(`Payout is already ${payout.status}`)

    const stripeAccountId = payout.profiles?.stripe_account_id
    if (!stripeAccountId) {
      throw new Error("Le créateur n'a pas lié de compte Stripe Connect.")
    }

    // 2. Effectuer le transfert Stripe (Platform -> Connected Account)
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecret) throw new Error('Stripe secret key missing')

    const stripe = new Stripe(stripeSecret, {
      apiVersion: '2022-11-15',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const transferAmountCents = Math.round(payout.amount * 100)

    const transfer = await stripe.transfers.create({
      amount: transferAmountCents,
      currency: 'eur',
      destination: stripeAccountId,
      description: `Virement Skuuul (Payout Request ${payout.id})`,
    })

    console.log(`[Stripe Transfer] Success: ${transfer.id}`)

    // 3. Mettre à jour le statut dans la base de données
    const { error: updateError } = await supabaseAdmin
      .from('payout_requests')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', payoutRequestId)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ success: true, transfer_id: transfer.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (err: any) {
    console.error('Error processing payout transfer:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

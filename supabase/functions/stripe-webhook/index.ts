import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!stripeSecret || !webhookSecret) {
    return new Response('Stripe secret key or webhook secret is not configured.', { status: 500 })
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: '2022-11-15',
    httpClient: Stripe.createFetchHttpClient(),
  })

  // Récupérer la signature Stripe
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  try {
    const body = await req.text()
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)

    // Configurer le client Supabase admin (bypasse RLS avec la Service Role Key)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    })

    console.log(`[Stripe Webhook] Received event: ${event.type}`)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      
      // Extraction des métadonnées du paiement unique
      const userId = session.metadata?.user_id || session.client_reference_id
      const courseId = session.metadata?.course_id
      const amountVal = session.metadata?.amount

      if (userId && courseId && amountVal) {
        const amount = parseInt(amountVal, 10)
        
        console.log(`[Stripe Webhook] Processing course purchase: User ${userId}, Course ${courseId}, Amount ${amount}€`)

        // Enregistrer ou mettre à jour la transaction dans public.course_purchases
        // En utilisant onConflict pour s'assurer qu'on n'a pas de doublons et qu'on écrase d'anciennes tentatives pending
        const { error } = await supabase
          .from('course_purchases')
          .upsert({
            user_id: userId,
            course_id: courseId,
            amount: amount,
            transfer_reference: session.id,
            status: 'approved',
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,course_id' })

        if (error) {
          console.error('[Stripe Webhook] Database upsert error:', error)
          throw error
        }

        console.log(`[Stripe Webhook] Successfully approved purchase for course ${courseId} for user ${userId}`)
      } else {
        console.warn('[Stripe Webhook] Missing course metadata in checkout session:', session.id)
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err: any) {
    console.error(`[Stripe Webhook] Webhook Error: ${err.message}`)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }
})

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gérer la requête de pré-vérification CORS (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecret) {
      throw new Error("STRIPE_SECRET_KEY n'est pas configuré sur Supabase.")
    }

    const stripe = new Stripe(stripeSecret, {
      apiVersion: '2022-11-15',
      httpClient: Stripe.createFetchHttpClient(),
    })

    // Récupérer le token JWT d'autorisation
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Configurer le client Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Identifiants utilisateur invalides' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Récupérer les paramètres du corps
    const { courseId } = await req.json()
    if (!courseId) {
      return new Response(JSON.stringify({ error: 'courseId requis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Récupérer le cours de la base de données
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*, profiles:owner_id(username, full_name)')
      .eq('id', courseId)
      .single()

    if (courseError || !course) {
      return new Response(JSON.stringify({ error: 'Formation introuvable' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const price = course.price ?? 0;
    if (price <= 0) {
      return new Response(JSON.stringify({ error: "Cette formation est gratuite et n'a pas besoin de paiement" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Déterminer l'origine de la requête pour les redirections
    const origin = req.headers.get('origin') || 'http://localhost:3000'

    // Créer une session Stripe Checkout pour un paiement unique (mode payment)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: course.title,
              description: course.description ? course.description.slice(0, 100) : `Achat de la formation par ${course.profiles?.full_name || course.profiles?.username}`,
              images: course.cover_image_url ? [course.cover_image_url] : [],
            },
            unit_amount: price * 100, // Stripe attend des centimes
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        course_id: courseId,
        amount: price.toString(),
      },
      client_reference_id: user.id,
      success_url: `${origin}/classroom?payment=success&course_id=${courseId}`,
      cancel_url: `${origin}/classroom?payment=cancel&course_id=${courseId}`,
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

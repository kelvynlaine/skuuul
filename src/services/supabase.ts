import { createClient } from '@supabase/supabase-js';

// L'URL et la clé ANON sont publiques par conception (exposées au navigateur) ;
// la sécurité repose sur la RLS, pas sur leur confidentialité. On privilégie
// les variables d'environnement, avec un repli sur les valeurs publiques du
// projet pour que l'app fonctionne même si l'environnement de build/hébergement
// n'a pas (encore) configuré ces variables.
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  'https://eoodcrcmqpovqpzilrik.supabase.co';
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvb2RjcmNtcXBvdnFwemlscmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTk2ODgsImV4cCI6MjA5NzI3NTY4OH0.mI3kYSanM28IXYIzng-9sQsfyqa6kC6OQoxKdDUmxzE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


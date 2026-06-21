-- ---------------------------------------------------------------------
-- AJOUT DU SUPPORT STRIPE CONNECT POUR LES PAIEMENTS AUTOMATISÉS
-- ---------------------------------------------------------------------

-- 1. Ajout de l'ID du compte connecté Stripe
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;

-- (Optionnel) Ajout d'une colonne pour vérifier si l'onboarding est terminé
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT false;

-- On ne supprime pas encore l'IBAN pour la rétrocompatibilité, 
-- mais on pourra le rendre optionnel ou l'ignorer à l'avenir.

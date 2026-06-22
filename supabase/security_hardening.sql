-- =====================================================================
-- SKUUUL — Correctifs de sécurité
-- À exécuter UNE FOIS dans le SQL Editor de Supabase.
--
-- Couvre :
--   CRITIQUE 1 — Fuite des données bancaires/PII de public.profiles
--   CRITIQUE 2 — Fraude au solde via public.course_purchases
--   DURCISSEMENT — Bornage du montant des donations
--
-- IMPORTANT : tant que ce script n'est pas exécuté, les failles
-- CRITIQUE 1 et 2 restent ouvertes en production.
-- =====================================================================


-- ---------------------------------------------------------------------
-- CRITIQUE 1 — Verrouillage des colonnes sensibles de public.profiles
-- ---------------------------------------------------------------------
-- Le problème : la policy RLS "Profiles are viewable by anyone"
-- (FOR SELECT USING (true)) rend chaque ligne lisible par tous — y compris
-- les colonnes iban / balance / stripe_account_id / stripe_onboarding_complete
-- / crm_notes / phone. N'importe qui muni de la clé anon publique peut donc
-- exfiltrer les coordonnées bancaires de tous les utilisateurs.
--
-- La solution : on CONSERVE la policy RLS (les jointures publiques
-- username/avatar_url/... doivent continuer de fonctionner) mais on retire
-- l'accès en LECTURE aux colonnes sensibles via les privilèges au niveau
-- colonne. Les données sensibles ne sont ensuite accessibles que via des
-- fonctions SECURITY DEFINER contrôlées (propriétaire, admin, ou acheteur).

REVOKE SELECT ON public.profiles FROM anon, authenticated;

-- Seules les colonnes non sensibles sont lisibles directement.
-- (Toute future colonne sensible est non lisible par défaut.)
GRANT SELECT (
    id, role, username, full_name, avatar_url,
    xp, level, is_premium, is_banned, created_at, updated_at
) ON public.profiles TO anon, authenticated;


-- RPC : profil COMPLET de l'appelant (pour lire ses propres données sensibles
-- — solde, IBAN, état d'onboarding Stripe).
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles AS $$
    SELECT * FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;


-- RPC : liste COMPLÈTE des profils — réservé aux admins (CRM).
CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS SETOF public.profiles AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accès refusé : administrateur requis';
    END IF;
    RETURN QUERY SELECT * FROM public.profiles ORDER BY xp DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;


-- RPC : infos de paiement du propriétaire d'un cours, pour un acheteur
-- (modèle de virement manuel : l'acheteur doit voir l'IBAN/téléphone du vendeur).
-- N'expose que les coordonnées du vendeur DU COURS demandé, rien d'autre.
CREATE OR REPLACE FUNCTION public.get_course_payment_info(p_course_id uuid)
RETURNS TABLE (
    iban text,
    phone text,
    stripe_account_id text,
    stripe_onboarding_complete boolean
) AS $$
    SELECT p.iban, p.phone, p.stripe_account_id, p.stripe_onboarding_complete
    FROM public.courses c
    JOIN public.profiles p ON p.id = c.owner_id
    WHERE c.id = p_course_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_course_payment_info(uuid) TO authenticated;


-- RPC : demandes de retrait + infos bénéficiaire — réservé aux admins.
-- Remplace la jointure profiles(...stripe_account_id) côté client, qui
-- échouerait désormais (colonne non accordée).
CREATE OR REPLACE FUNCTION public.admin_list_payout_requests()
RETURNS TABLE (
    id uuid,
    user_id uuid,
    amount integer,
    iban text,
    status text,
    created_at timestamptz,
    updated_at timestamptz,
    username text,
    full_name text,
    stripe_account_id text
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accès refusé : administrateur requis';
    END IF;
    RETURN QUERY
        SELECT pr.id, pr.user_id, pr.amount, pr.iban, pr.status,
               pr.created_at, pr.updated_at,
               p.username, p.full_name, p.stripe_account_id
        FROM public.payout_requests pr
        JOIN public.profiles p ON p.id = pr.user_id
        ORDER BY pr.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_list_payout_requests() TO authenticated;


-- ---------------------------------------------------------------------
-- CRITIQUE 2 — Intégrité des achats de cours (anti « fausse monnaie »)
-- ---------------------------------------------------------------------
-- Le problème : la policy INSERT ne vérifiait que auth.uid() = user_id.
-- Un utilisateur pouvait insérer un achat status='approved' avec un montant
-- arbitraire sur son PROPRE cours → le trigger handle_course_purchase_approved
-- créditait un solde RÉEL (balance) ensuite retirable vers IBAN.
--
-- La solution : l'utilisateur ne peut créer que des demandes 'pending', et un
-- trigger BEFORE INSERT impose le statut 'pending' ET le montant = prix réel
-- du cours. Le crédit ne peut donc survenir qu'après approbation manuelle par
-- le propriétaire, au vrai prix.

DROP POLICY IF EXISTS "Users can request a purchase" ON public.course_purchases;
CREATE POLICY "Users can request a purchase" ON public.course_purchases
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND status = 'pending'
    );

CREATE OR REPLACE FUNCTION public.enforce_purchase_integrity()
RETURNS TRIGGER AS $$
BEGIN
    -- Valeurs imposées par le serveur, jamais de confiance côté client.
    NEW.status := 'pending';
    NEW.amount := COALESCE((SELECT price FROM public.courses WHERE id = NEW.course_id), 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_purchase_integrity_trigger ON public.course_purchases;
CREATE TRIGGER enforce_purchase_integrity_trigger
    BEFORE INSERT ON public.course_purchases
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_purchase_integrity();

-- NOTE (risque résiduel) : le modèle « virement manuel + approbation »
-- permet structurellement à un vendeur de simuler un achat de son propre cours
-- puis de l'approuver. Ce correctif bloque l'exploit trivial (une requête) et
-- le gonflage du montant. Une robustesse complète nécessiterait de ne créditer
-- balance que sur un achat vérifié par Stripe.


-- ---------------------------------------------------------------------
-- DURCISSEMENT — Bornage du montant des donations
-- ---------------------------------------------------------------------
-- Empêche l'insertion de donations à montant aberrant (intégrité du
-- classement/XP). Les donations ne créditent pas le solde retirable.
ALTER TABLE public.donations DROP CONSTRAINT IF EXISTS donations_amount_check;
ALTER TABLE public.donations ADD CONSTRAINT donations_amount_check
    CHECK (amount > 0 AND amount <= 10000);

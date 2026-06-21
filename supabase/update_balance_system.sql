-- ---------------------------------------------------------------------
-- 1. MISE À JOUR DE LA TABLE public.profiles (Ajout du solde)
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS balance INTEGER NOT NULL DEFAULT 0;
-- S'assurer que le solde ne peut pas être négatif
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_balance_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_balance_check CHECK (balance >= 0);

-- ---------------------------------------------------------------------
-- 2. CRÉATION DE LA TABLE public.payout_requests
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    iban TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexation pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON public.payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests(status);

-- Activation de Row Level Security (RLS)
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3. POLITIQUES DE SÉCURITÉ RLS SUR public.payout_requests
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own payout requests" ON public.payout_requests;
CREATE POLICY "Users can view their own payout requests" ON public.payout_requests
    FOR SELECT USING (
        auth.uid() = user_id 
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "Users can create payout requests" ON public.payout_requests;
CREATE POLICY "Users can create payout requests" ON public.payout_requests
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND status = 'pending'
    );

DROP POLICY IF EXISTS "Admins can update payout requests" ON public.payout_requests;
CREATE POLICY "Admins can update payout requests" ON public.payout_requests
    FOR UPDATE USING (
        public.is_admin()
    ) WITH CHECK (
        public.is_admin()
    );

-- ---------------------------------------------------------------------
-- 4. TRIGGERS POUR LA GESTION AUTOMATIQUE DES SOLDES
-- ---------------------------------------------------------------------

-- A. Mise à jour de updated_at sur payout_requests
DROP TRIGGER IF EXISTS update_payout_requests_timestamp ON public.payout_requests;
CREATE TRIGGER update_payout_requests_timestamp
    BEFORE UPDATE ON public.payout_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_timestamp_column();

-- B. Créditer le solde du créateur quand un achat de cours est approuvé
CREATE OR REPLACE FUNCTION public.handle_course_purchase_approved()
RETURNS TRIGGER AS $$
DECLARE
    course_owner_id UUID;
BEGIN
    -- Seulement si le statut devient 'approved'
    IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
       (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved') THEN
        
        -- Trouver l'id du créateur du cours
        SELECT owner_id INTO course_owner_id FROM public.courses WHERE id = NEW.course_id;
        
        IF course_owner_id IS NOT NULL THEN
            UPDATE public.profiles 
            SET balance = balance + NEW.amount 
            WHERE id = course_owner_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_course_purchase_approved ON public.course_purchases;
CREATE TRIGGER on_course_purchase_approved
    AFTER INSERT OR UPDATE ON public.course_purchases
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_course_purchase_approved();

-- C. Débiter le solde à la création d'une demande de retrait et rembourser si rejeté
CREATE OR REPLACE FUNCTION public.handle_payout_request_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Déduire du solde (si pas assez d'argent, profiles_balance_check annulera la transaction)
        UPDATE public.profiles 
        SET balance = balance - NEW.amount 
        WHERE id = NEW.user_id;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- Si le statut passe de 'pending' à 'rejected', on rembourse
        IF OLD.status = 'pending' AND NEW.status = 'rejected' THEN
            UPDATE public.profiles 
            SET balance = balance + NEW.amount 
            WHERE id = NEW.user_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_payout_request_changes ON public.payout_requests;
CREATE TRIGGER on_payout_request_changes
    AFTER INSERT OR UPDATE ON public.payout_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_payout_request_changes();

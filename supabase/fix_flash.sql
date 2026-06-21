-- Ce script débloque manuellement les formations pour l'utilisateur Flash
-- suite au paiement qui n'a pas été capté par le Webhook (car il n'était pas encore publié).

DO $$ 
DECLARE
    flash_id UUID;
    -- IDs des formations actuellement sur la plateforme (testt et tetts)
    course_1_id UUID := '15122269-2964-47ad-ba6d-72ac54b22d0c';
    course_2_id UUID := '4364f2eb-8c72-4033-bb83-1c439d535767';
BEGIN
    -- On trouve l'ID du membre Flash
    SELECT id INTO flash_id FROM public.profiles WHERE username ILIKE '%Flash%' LIMIT 1;
    
    IF flash_id IS NOT NULL THEN
        -- On lui donne accès à la formation 1
        INSERT INTO public.course_purchases (user_id, course_id, amount, transfer_reference, status)
        VALUES (flash_id, course_1_id, 1, 'manual_fix_flash', 'approved')
        ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'approved';
        
        -- On lui donne accès à la formation 2
        INSERT INTO public.course_purchases (user_id, course_id, amount, transfer_reference, status)
        VALUES (flash_id, course_2_id, 1, 'manual_fix_flash', 'approved')
        ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'approved';
        
        RAISE NOTICE 'Les formations ont été accordées à Flash avec succès.';
    ELSE
        RAISE NOTICE 'Utilisateur Flash introuvable.';
    END IF;
END $$;

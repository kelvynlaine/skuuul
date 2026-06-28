-- ──────────────────────────────────────────────────────────────────────────
-- CALENDRIER & CRM — RDV call, événements, rappels, pipeline CRM
-- À exécuter dans le SQL Editor Supabase (une seule fois).
-- ──────────────────────────────────────────────────────────────────────────

-- Helper : l'utilisateur courant est-il créateur ou admin ?
CREATE OR REPLACE FUNCTION is_creator_or_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('creator', 'admin')
  );
$$;

-- Helper : l'utilisateur courant est-il admin ?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;


-- ════════════════════════════════════════════════════════════════════════
-- 1. ÉVÉNEMENTS  (créés par créateurs / admins, visibles par tous)
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  meeting_url TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  color TEXT DEFAULT 'blue',          -- blue | indigo | orange | green | pink
  audience TEXT DEFAULT 'all',        -- 'all' | 'members'
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "events read published" ON calendar_events;
CREATE POLICY "events read published" ON calendar_events FOR SELECT
  USING (is_published OR creator_id = auth.uid());

DROP POLICY IF EXISTS "events insert creator" ON calendar_events;
CREATE POLICY "events insert creator" ON calendar_events FOR INSERT
  WITH CHECK (creator_id = auth.uid() AND is_creator_or_admin());

DROP POLICY IF EXISTS "events update own" ON calendar_events;
CREATE POLICY "events update own" ON calendar_events FOR UPDATE
  USING (creator_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "events delete own" ON calendar_events;
CREATE POLICY "events delete own" ON calendar_events FOR DELETE
  USING (creator_id = auth.uid() OR is_admin());


-- ════════════════════════════════════════════════════════════════════════
-- 2. CRÉNEAUX DISPONIBLES  (un hôte créateur/admin ouvre des créneaux)
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'open',          -- open | booked | cancelled
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_slots REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "slots read all" ON availability_slots;
CREATE POLICY "slots read all" ON availability_slots FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "slots insert host" ON availability_slots;
CREATE POLICY "slots insert host" ON availability_slots FOR INSERT
  WITH CHECK (host_id = auth.uid() AND is_creator_or_admin());

DROP POLICY IF EXISTS "slots update host" ON availability_slots;
CREATE POLICY "slots update host" ON availability_slots FOR UPDATE
  USING (host_id = auth.uid());

DROP POLICY IF EXISTS "slots delete host" ON availability_slots;
CREATE POLICY "slots delete host" ON availability_slots FOR DELETE
  USING (host_id = auth.uid());


-- ════════════════════════════════════════════════════════════════════════
-- 3. RENDEZ-VOUS  (un membre réserve un call avec un hôte)
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID REFERENCES availability_slots(id) ON DELETE SET NULL,
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',       -- pending | confirmed | cancelled | completed
  meeting_url TEXT,
  member_note TEXT,
  host_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "appt read involved" ON appointments;
CREATE POLICY "appt read involved" ON appointments FOR SELECT
  USING (host_id = auth.uid() OR member_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "appt insert member" ON appointments;
CREATE POLICY "appt insert member" ON appointments FOR INSERT
  WITH CHECK (member_id = auth.uid());

DROP POLICY IF EXISTS "appt update involved" ON appointments;
CREATE POLICY "appt update involved" ON appointments FOR UPDATE
  USING (host_id = auth.uid() OR member_id = auth.uid());

DROP POLICY IF EXISTS "appt delete involved" ON appointments;
CREATE POLICY "appt delete involved" ON appointments FOR DELETE
  USING (host_id = auth.uid() OR member_id = auth.uid());


-- ════════════════════════════════════════════════════════════════════════
-- 4. RAPPELS D'ÉVÉNEMENT  (un membre active un rappel sur un événement)
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);
ALTER TABLE event_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders own select" ON event_reminders;
CREATE POLICY "reminders own select" ON event_reminders FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "reminders own insert" ON event_reminders;
CREATE POLICY "reminders own insert" ON event_reminders FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "reminders own delete" ON event_reminders;
CREATE POLICY "reminders own delete" ON event_reminders FOR DELETE USING (user_id = auth.uid());


-- ════════════════════════════════════════════════════════════════════════
-- 5. CRM — contacts (relation hôte → membre, pipeline + notes)
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stage TEXT DEFAULT 'prospect',       -- prospect | active | completed | lost
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(host_id, member_id)
);
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm host select" ON crm_contacts;
CREATE POLICY "crm host select" ON crm_contacts FOR SELECT
  USING (host_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS "crm host insert" ON crm_contacts;
CREATE POLICY "crm host insert" ON crm_contacts FOR INSERT
  WITH CHECK (host_id = auth.uid());
DROP POLICY IF EXISTS "crm host update" ON crm_contacts;
CREATE POLICY "crm host update" ON crm_contacts FOR UPDATE
  USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());
DROP POLICY IF EXISTS "crm host delete" ON crm_contacts;
CREATE POLICY "crm host delete" ON crm_contacts FOR DELETE
  USING (host_id = auth.uid());


-- ════════════════════════════════════════════════════════════════════════
-- 6. TRIGGERS — notifications + automatisation CRM
-- ════════════════════════════════════════════════════════════════════════

-- 6a. Nouveau RDV → notifier l'hôte, marquer le créneau réservé, upsert CRM
CREATE OR REPLACE FUNCTION on_appointment_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_member_name TEXT;
BEGIN
  -- Marquer le créneau comme réservé
  IF NEW.slot_id IS NOT NULL THEN
    UPDATE availability_slots SET status = 'booked' WHERE id = NEW.slot_id;
  END IF;

  -- Upsert du contact CRM côté hôte (statut prospect par défaut)
  INSERT INTO crm_contacts (host_id, member_id, stage)
  VALUES (NEW.host_id, NEW.member_id, 'prospect')
  ON CONFLICT (host_id, member_id) DO UPDATE SET updated_at = now();

  -- Notifier l'hôte
  SELECT COALESCE(full_name, username) INTO v_member_name FROM profiles WHERE id = NEW.member_id;
  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    NEW.host_id,
    'appointment_request',
    'Nouvelle demande de RDV',
    v_member_name || ' souhaite réserver un call avec vous.',
    '/calendrier'
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_appointment_created ON appointments;
CREATE TRIGGER trg_appointment_created
  AFTER INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION on_appointment_created();


-- 6b. Changement de statut de RDV → notifier le membre + libérer le créneau si annulé
CREATE OR REPLACE FUNCTION on_appointment_status_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_host_name TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, username) INTO v_host_name FROM profiles WHERE id = NEW.host_id;

  IF NEW.status = 'confirmed' THEN
    v_title := 'RDV confirmé ✅';
    v_body  := v_host_name || ' a confirmé votre call.';
    UPDATE crm_contacts SET stage = 'active', updated_at = now()
      WHERE host_id = NEW.host_id AND member_id = NEW.member_id AND stage = 'prospect';
  ELSIF NEW.status = 'cancelled' THEN
    v_title := 'RDV annulé';
    v_body  := 'Votre call avec ' || v_host_name || ' a été annulé.';
    IF NEW.slot_id IS NOT NULL THEN
      UPDATE availability_slots SET status = 'open' WHERE id = NEW.slot_id;
    END IF;
  ELSIF NEW.status = 'completed' THEN
    v_title := 'RDV terminé';
    v_body  := 'Votre call avec ' || v_host_name || ' est terminé.';
    UPDATE crm_contacts SET stage = 'completed', updated_at = now()
      WHERE host_id = NEW.host_id AND member_id = NEW.member_id;
  ELSE
    RETURN NEW;
  END IF;

  -- On notifie la partie qui n'a pas déclenché le changement (généralement le membre)
  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (NEW.member_id, 'appointment_update', v_title, v_body, '/calendrier');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_appointment_status ON appointments;
CREATE TRIGGER trg_appointment_status
  AFTER UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION on_appointment_status_changed();


-- 6c. Événement publié → annonce/notification à l'audience cible
CREATE OR REPLACE FUNCTION on_event_published()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creator_name TEXT;
BEGIN
  IF NOT NEW.is_published THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, username) INTO v_creator_name FROM profiles WHERE id = NEW.creator_id;

  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT
    p.id,
    'event_announcement',
    '📅 ' || NEW.title,
    'Nouvel événement par ' || v_creator_name,
    '/calendrier'
  FROM profiles p
  WHERE p.id <> NEW.creator_id
    AND (NEW.audience = 'all' OR p.role = 'user');

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_event_published ON calendar_events;
CREATE TRIGGER trg_event_published
  AFTER INSERT ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION on_event_published();


-- 6d. Rappel activé sur un événement → confirmation immédiate au membre
CREATE OR REPLACE FUNCTION on_reminder_set()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title TEXT;
BEGIN
  SELECT title INTO v_title FROM calendar_events WHERE id = NEW.event_id;
  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (NEW.user_id, 'event_reminder', '🔔 Rappel activé', 'Nous vous rappellerons : ' || v_title, '/calendrier');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_reminder_set ON event_reminders;
CREATE TRIGGER trg_reminder_set
  AFTER INSERT ON event_reminders
  FOR EACH ROW EXECUTE FUNCTION on_reminder_set();


-- ════════════════════════════════════════════════════════════════════════
-- 7. RAPPELS PROGRAMMÉS (optionnel — nécessite l'extension pg_cron)
--    Envoie un rappel ~1h avant les événements à venir.
--    Active la fonction puis planifie-la si pg_cron est disponible.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION send_due_event_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT r.user_id, 'event_reminder', '⏰ Bientôt : ' || e.title,
         'Votre événement commence bientôt.', '/calendrier'
  FROM event_reminders r
  JOIN calendar_events e ON e.id = r.event_id
  WHERE r.notified = false
    AND e.starts_at BETWEEN now() AND now() + interval '1 hour';

  UPDATE event_reminders r
  SET notified = true
  FROM calendar_events e
  WHERE e.id = r.event_id
    AND r.notified = false
    AND e.starts_at BETWEEN now() AND now() + interval '1 hour';
END;
$$;
-- Pour activer (si pg_cron installé) :
--   SELECT cron.schedule('skuuul-event-reminders', '*/15 * * * *', $$ SELECT send_due_event_reminders(); $$);


-- ════════════════════════════════════════════════════════════════════════
-- 8. REALTIME — ajout des tables à la publication
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['calendar_events', 'availability_slots', 'appointments'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

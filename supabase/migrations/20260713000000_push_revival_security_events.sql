-- ════════════════════════════════════════════════════════════════════
-- PUSH REVIVAL + STRÓŻ v0 — Wariant 2 (2026-07-13)
-- ════════════════════════════════════════════════════════════════════
-- Kontekst: trigger_send_push/detect-moment słały spalony sb_secret z Vault
-- w Authorization: Bearer → bramka EF 401. Wariant 2: sekret serwisowy NIGDY
-- w nagłówku z triggera; handshake przez x-push-secret; EF bierze uprawnienia
-- DB z własnego env (SUPABASE_SERVICE_ROLE_KEY). Rola z apikey (publishable), NIE z Authorization.
--
-- WYMAGANE POZA MIGRACJĄ (nie w repo — wartości sekretne/env-specyficzne):
--   Vault:  push_hook_secret  (losowy, == env EF PUSH_HOOK_SECRET)
--           publishable_key   (= sb_publishable_... z sb.js:32; klucz publiczny)
--   EF env: PUSH_HOOK_SECRET   (== Vault push_hook_secret)  [send-push, detect-moment]
--   Stary Vault 'service_role_key ' (trailing space) — WYGASZONY po e2e (patrz runbook).
-- ════════════════════════════════════════════════════════════════════

-- ── Stróż v0: tabela zdarzeń bezpieczeństwa (deny-all dla klienta) ──
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  severity text not null check (severity in ('info','warning','critical')),
  source text not null,            -- np. 'trigger_send_push', 'ef:send-push', 'auth'
  message text not null,
  details jsonb
);
alter table public.security_events enable row level security;
-- ŻADNYCH policies dla anon/authenticated (deny-all). Dostęp: service_role/postgres/SECURITY DEFINER.
revoke all on public.security_events from anon, authenticated;

-- ── trigger_send_push: notifications INSERT → send-push (handshake x-push-secret) ──
CREATE OR REPLACE FUNCTION public.trigger_send_push()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','vault','pg_temp'
AS $function$
DECLARE hook_secret text; pub_key text;
BEGIN
  SELECT decrypted_secret INTO hook_secret FROM vault.decrypted_secrets WHERE name = 'push_hook_secret';
  SELECT decrypted_secret INTO pub_key    FROM vault.decrypted_secrets WHERE name = 'publishable_key';
  PERFORM net.http_post(
    url := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type','application/json','apikey', pub_key, 'x-push-secret', hook_secret),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.security_events(severity, source, message, details)
  VALUES ('critical','trigger_send_push','push dispatch failed', jsonb_build_object('sqlerrm', SQLERRM, 'notification_id', NEW.id));
  RETURN NEW;   -- push może paść, ale INSERT do notifications MUSI przejść
END; $function$;

-- ── trigger_detect_moment: <tabela> INSERT → detect-moment (ten sam handshake) ──
CREATE OR REPLACE FUNCTION public.trigger_detect_moment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','vault','pg_temp'
AS $function$
DECLARE hook_secret text; pub_key text;
BEGIN
  SELECT decrypted_secret INTO hook_secret FROM vault.decrypted_secrets WHERE name = 'push_hook_secret';
  SELECT decrypted_secret INTO pub_key    FROM vault.decrypted_secrets WHERE name = 'publishable_key';
  PERFORM net.http_post(
    url := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/detect-moment',
    headers := jsonb_build_object('Content-Type','application/json','apikey', pub_key, 'x-push-secret', hook_secret),
    body := jsonb_build_object('athlete_id', NEW.athlete_id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.security_events(severity, source, message, details)
  VALUES ('critical','trigger_detect_moment','detect dispatch failed', jsonb_build_object('sqlerrm', SQLERRM, 'athlete_id', NEW.athlete_id));
  RETURN NEW;
END; $function$;

-- Uwaga: definicje triggerów (CREATE TRIGGER ... ON <tabela>) już istnieją w DB
--   (notifications_send_push AFTER INSERT ON notifications; trg detect-moment na swojej tabeli).
--   Ta migracja podmienia TYLKO ciało funkcji (CREATE OR REPLACE FUNCTION).

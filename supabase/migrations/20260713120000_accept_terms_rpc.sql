-- FAZA 2 (Brama Regulaminu): RPC accept_terms()
-- ─────────────────────────────────────────────────────────────────────────────
-- Wąski zapis zgody dla ZALOGOWANEGO usera — rusza TYLKO terms_accepted_at własnego
-- wiersza athletes (user_id = auth.uid()). Dedykowane RPC zamiast polegania na szerokiej
-- policy athletes_update_own (qual = user_id=auth.uid(), ale pozwala update DOWOLNEJ kolumny).
-- now() serwerowy = autorytatywny timestamp (klient nie podaje czasu → brak podszywania).
-- Konsument: window.TERMS.showModal() → sb.rpc('accept_terms') (sb.js).
--
-- SECURITY DEFINER: funkcja działa jako właściciel (bypass RLS), ale jawny WHERE user_id =
-- auth.uid() scope'uje do wiersza wołającego. auth.uid() (schema auth, wołane w pełni
-- kwalifikowane) czyta claim z JWT requestu — zachowany w SECURITY DEFINER.
-- set search_path = public: twardy path (anty-hijack); wszystkie obiekty kwalifikowane jawnie.

create or replace function public.accept_terms()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  _ts timestamptz := now();
begin
  update public.athletes
     set terms_accepted_at = _ts
   where user_id = auth.uid();
  return _ts;
end;
$$;

-- Default-priv Supabase nadaje EXECUTE anon+authenticated NOWYM funkcjom (pg_default_acl —
-- „anon=ALL"). Odcinamy jawnie i zostawiamy TYLKO authenticated (anon nie ma czego akceptować).
revoke all on function public.accept_terms() from public;
revoke all on function public.accept_terms() from anon;
grant  execute on function public.accept_terms() to authenticated;

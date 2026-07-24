-- Estado de jobs (Radar, Descubrir, Pesca) persistido en DB.
-- Antes vivían solo en la memoria del proceso (+ respaldo en disco local):
-- cada redespliegue de Railway los borraba. Con esta tabla, el snapshot
-- sobrevive y la UI puede ofrecer "Continuar con los que faltan".
CREATE TABLE IF NOT EXISTS app_jobs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  kind text NOT NULL, -- 'radar' | 'discover' | 'pesca'
  state jsonb NOT NULL,
  done boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_jobs_ws_kind_idx
  ON app_jobs (workspace_id, kind, updated_at DESC);

ALTER TABLE app_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_jobs' AND policyname = 'app_jobs_member'
  ) THEN
    CREATE POLICY app_jobs_member ON app_jobs
      FOR ALL USING (is_workspace_member(workspace_id));
  END IF;
END $$;

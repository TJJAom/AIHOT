-- 自撰整理與來源原文／全文翻譯分開保存；舊版本不可覆蓋目前閱讀內容。
CREATE TABLE IF NOT EXISTS article_readings (
  article_id text PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  input_revision integer NOT NULL,
  analysis_id bigint NOT NULL REFERENCES analyses(id),
  override_version integer NOT NULL,
  input_hash text NOT NULL,
  prompt_version text NOT NULL,
  sections jsonb NOT NULL,
  receipt_id bigint REFERENCES receipts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

alter table if exists petrichor_kb_article
    add column if not exists metadata_json text;

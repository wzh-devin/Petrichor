create table if not exists petrichor_kb_import_batch (
    id bigint generated always as identity primary key,
    user_id bigint not null references petrichor_user(id) on delete cascade,
    knowledge_base_id bigint not null references petrichor_kb_knowledge_base(id) on delete cascade,
    parent_node_id bigint references petrichor_kb_node(id) on delete set null,
    source_type text not null,
    source_name text not null,
    source_ref text,
    source_payload_json text,
    status text not null default 'pending',
    total_items integer not null default 0,
    completed_items integer not null default 0,
    failed_items integer not null default 0,
    skipped_items integer not null default 0,
    attempt_count integer not null default 0,
    next_retry_at timestamptz,
    locked_at timestamptz,
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_petrichor_kb_import_batch_user
    on petrichor_kb_import_batch(user_id, created_at desc);
create index if not exists idx_petrichor_kb_import_batch_user_kb
    on petrichor_kb_import_batch(user_id, knowledge_base_id);
create index if not exists idx_petrichor_kb_import_batch_queue
    on petrichor_kb_import_batch(status, next_retry_at, locked_at);

alter table petrichor_kb_import_job add column if not exists batch_id bigint;
alter table petrichor_kb_import_job add column if not exists source_key text;
alter table petrichor_kb_import_job add column if not exists source_ref text;
alter table petrichor_kb_import_job add column if not exists relative_path text;
alter table petrichor_kb_import_job add column if not exists source_payload_json text;
alter table petrichor_kb_import_job add column if not exists attempt_count integer not null default 0;
alter table petrichor_kb_import_job add column if not exists next_retry_at timestamptz;
alter table petrichor_kb_import_job add column if not exists locked_at timestamptz;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'fk_petrichor_kb_import_job_batch'
    ) then
        alter table petrichor_kb_import_job
            add constraint fk_petrichor_kb_import_job_batch
            foreign key (batch_id) references petrichor_kb_import_batch(id) on delete cascade;
    end if;
end $$;

create index if not exists idx_petrichor_kb_import_job_batch
    on petrichor_kb_import_job(batch_id, created_at);
create index if not exists idx_petrichor_kb_import_job_queue
    on petrichor_kb_import_job(status, next_retry_at, locked_at);

-- 历史 PDF 任务各自补成一个单项目批次，保留原任务、页面和文章关系。
do $$
declare
    legacy record;
    new_batch_id bigint;
begin
    for legacy in
        select * from petrichor_kb_import_job where batch_id is null order by id
    loop
        insert into petrichor_kb_import_batch (
            user_id,
            knowledge_base_id,
            parent_node_id,
            source_type,
            source_name,
            status,
            total_items,
            completed_items,
            failed_items,
            created_at,
            updated_at
        ) values (
            legacy.user_id,
            legacy.knowledge_base_id,
            legacy.parent_node_id,
            coalesce(nullif(legacy.source_type, ''), 'pdf'),
            legacy.file_name,
            legacy.status,
            1,
            case when legacy.status = 'completed' then 1 else 0 end,
            case when legacy.status = 'failed' then 1 else 0 end,
            legacy.created_at,
            legacy.updated_at
        ) returning id into new_batch_id;

        update petrichor_kb_import_job set batch_id = new_batch_id where id = legacy.id;
    end loop;
end $$;

create table if not exists petrichor_feishu_connection (
    id bigint generated always as identity primary key,
    user_id bigint not null references petrichor_user(id) on delete cascade,
    open_id text,
    display_name text,
    access_token_encrypted text not null,
    refresh_token_encrypted text,
    access_token_expires_at timestamptz,
    refresh_token_expires_at timestamptz,
    scope text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id)
);

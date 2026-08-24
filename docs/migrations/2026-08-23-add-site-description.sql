alter table petrichor_site_appearance
    add column if not exists site_description text;

update petrichor_site_appearance
set site_description = 'Knowledge, Articles & Inspiration'
where site_description is null or btrim(site_description) = '';

alter table petrichor_site_appearance
    alter column site_description set default 'Knowledge, Articles & Inspiration',
    alter column site_description set not null;

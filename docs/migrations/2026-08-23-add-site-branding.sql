alter table petrichor_site_appearance
    add column if not exists site_name text;

alter table petrichor_site_appearance
    add column if not exists sidebar_title text;

update petrichor_site_appearance
set site_name = 'Petrichor'
where site_name is null or btrim(site_name) = '';

update petrichor_site_appearance
set sidebar_title = 'Petrichor'
where sidebar_title is null or btrim(sidebar_title) = '';

alter table petrichor_site_appearance
    alter column site_name set default 'Petrichor',
    alter column site_name set not null,
    alter column sidebar_title set default 'Petrichor',
    alter column sidebar_title set not null;

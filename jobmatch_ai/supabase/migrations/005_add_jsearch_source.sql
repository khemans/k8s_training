-- Migration 005: Add jsearch as a scrape source
INSERT INTO public.scrape_sources (source)
VALUES ('jsearch')
ON CONFLICT (source) DO NOTHING;

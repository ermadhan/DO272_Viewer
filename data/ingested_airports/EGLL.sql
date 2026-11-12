-- DO-272 Spatial SQL Inserts for London Heathrow Airport (EGLL)
INSERT INTO do272_aerodromes (icao, iata, name, city, country, center_geom, elevation_m) VALUES ('EGLL', 'LHR', 'London Heathrow Airport', 'London', 'United Kingdom', ST_SetSRID(ST_MakePoint(-0.4543, 51.47), 4326), 25) ON CONFLICT (icao) DO NOTHING;

INSERT INTO do272_runways (id, aerodrome_id, designator, length_m, width_m, geom) VALUES ('LHR-RWY-09L-27R', 'EGLL', '09L/27R', 3902, 50, ST_GeomFromText('POLYGON((-0.488 51.47785, -0.432 51.47785, -0.432 51.47735, -0.488 51.47735))', 4326)) ON CONFLICT (id) DO NOTHING;
INSERT INTO do272_runways (id, aerodrome_id, designator, length_m, width_m, geom) VALUES ('LHR-RWY-09R-27L', 'EGLL', '09R/27L', 3660, 50, ST_GeomFromText('POLYGON((-0.485 51.46535, -0.433 51.46535, -0.433 51.46485, -0.485 51.46485))', 4326)) ON CONFLICT (id) DO NOTHING;

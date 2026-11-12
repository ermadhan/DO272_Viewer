-- DO-272 Spatial SQL Inserts for Tokyo Haneda Airport (RJTT)
INSERT INTO do272_aerodromes (icao, iata, name, city, country, center_geom, elevation_m) VALUES ('RJTT', 'HND', 'Tokyo Haneda Airport', 'Tokyo', 'Japan', ST_SetSRID(ST_MakePoint(139.7798, 35.5494), 4326), 15) ON CONFLICT (icao) DO NOTHING;

INSERT INTO do272_runways (id, aerodrome_id, designator, length_m, width_m, geom) VALUES ('RJTT-RWY-09L-27R', 'RJTT', '09L/27R', 3600, 60, ST_GeomFromText('POLYGON((139.7708 35.543099999999995, 139.78879999999998 35.555099999999996, 139.78879999999998 35.5557, 139.7708 35.5437, 139.7708 35.543099999999995))', 4326)) ON CONFLICT (id) DO NOTHING;
INSERT INTO do272_runways (id, aerodrome_id, designator, length_m, width_m, geom) VALUES ('RJTT-RWY-09R-27L', 'RJTT', '09R/27L', 3200, 45, ST_GeomFromText('POLYGON((139.7708 35.5394, 139.78879999999998 35.5514, 139.78879999999998 35.552, 139.7708 35.54, 139.7708 35.5394))', 4326)) ON CONFLICT (id) DO NOTHING;

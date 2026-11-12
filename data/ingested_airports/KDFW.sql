-- DO-272 Spatial SQL Inserts for Dallas/Fort Worth International Airport (KDFW)
INSERT INTO do272_aerodromes (icao, iata, name, city, country, center_geom, elevation_m) VALUES ('KDFW', 'DFW', 'Dallas/Fort Worth International Airport', 'Dallas-Fort Worth', 'United States', ST_SetSRID(ST_MakePoint(-97.0403, 32.8998), 4326), 15) ON CONFLICT (icao) DO NOTHING;

INSERT INTO do272_runways (id, aerodrome_id, designator, length_m, width_m, geom) VALUES ('KDFW-RWY-09L-27R', 'KDFW', '09L/27R', 3600, 60, ST_GeomFromText('POLYGON((-97.0493 32.893499999999996, -97.0313 32.905499999999996, -97.0313 32.9061, -97.0493 32.8941, -97.0493 32.893499999999996))', 4326)) ON CONFLICT (id) DO NOTHING;
INSERT INTO do272_runways (id, aerodrome_id, designator, length_m, width_m, geom) VALUES ('KDFW-RWY-09R-27L', 'KDFW', '09R/27L', 3200, 45, ST_GeomFromText('POLYGON((-97.0493 32.8898, -97.0313 32.9018, -97.0313 32.9024, -97.0493 32.8904, -97.0493 32.8898))', 4326)) ON CONFLICT (id) DO NOTHING;

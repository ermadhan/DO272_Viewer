-- DO-272 Spatial SQL Inserts for Dubai International Airport (OMDB)
INSERT INTO do272_aerodromes (icao, iata, name, city, country, center_geom, elevation_m) VALUES ('OMDB', 'DXB', 'Dubai International Airport', 'Dubai', 'United Arab Emirates', ST_SetSRID(ST_MakePoint(55.3657, 25.2532), 4326), 19) ON CONFLICT (icao) DO NOTHING;

INSERT INTO do272_runways (id, aerodrome_id, designator, length_m, width_m, geom) VALUES ('DXB-RWY-12L-30R', 'OMDB', '12L/30R', 4000, 60, ST_GeomFromText('POLYGON((55.35025 25.26485, 55.38075 25.24795, 55.38105 25.24745, 55.35055 25.26435))', 4326)) ON CONFLICT (id) DO NOTHING;
INSERT INTO do272_runways (id, aerodrome_id, designator, length_m, width_m, geom) VALUES ('DXB-RWY-12R-30L', 'OMDB', '12R/30L', 4450, 60, ST_GeomFromText('POLYGON((55.36425 25.25305, 55.39475 25.23615, 55.39505 25.23565, 55.36455 25.25255))', 4326)) ON CONFLICT (id) DO NOTHING;

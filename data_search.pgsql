 
-- 이동체별 최신 데이터 조회
SELECT locations.id, max(locations.time) FROM locations GROUP BY id;
 
-- 타입별 이동체 개수 조회
SELECT type, count(type) FROM (SELECT locations.id, max(locations.time) FROM locations GROUP BY id) as lastvalue
 LEFT JOIN objects ON (objects.id = lastvalue.id) GROUP BY type;
 
--  특저 지역 내 위치하는 데이터 조회
SELECT * FROM locations WHERE ST_Contains(ST_SetSRID(ST_MakePolygon(ST_GeomFromText('LINESTRING(127.116449 37.420072, 127.116449 37.394851, 127.153282 37.394851, 127.153282 37.420072, 127.116449 37.420072)')), 4326), GPS);


--  특저 지역 내 위치하는 이동체 별 최신 데이터 조회
SELECT * FROM (SELECT locations.id, max(locations.time) as time FROM locations GROUP BY id) as lastvalue, locations WHERE lastvalue.time=locations.time and
ST_Contains(ST_SetSRID(ST_MakePolygon(ST_GeomFromText('LINESTRING(127.116449 37.420072, 127.116449 37.394851, 127.153282 37.394851, 127.153282 37.420072, 127.116449 37.420072)')), 4326), GPS);


--  특저 지역 내 위치하는 이동체 별 최신 데이터 개수 조회
SELECT type, count(type) FROM (SELECT locations.id, max(locations.time) as time FROM locations GROUP BY id) as lastvalue, locations LEFT JOIN objects ON (objects.id = locations.id) WHERE lastvalue.time=locations.time and
ST_Contains(ST_SetSRID(ST_MakePolygon(ST_GeomFromText('LINESTRING(127.116449 37.420072, 127.116449 37.394851, 127.153282 37.394851, 127.153282 37.420072, 127.116449 37.420072)')), 4326), GPS)
 GROUP BY type;
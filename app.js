const express = require('express');
const app = express();
const http = require('http')
const server = http.Server(app);
const io = require('socket.io')(http);
const bodyParser = require('body-parser');
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const Config = require('./config.json');

const client = new Client({
  "host": "203.254.173.111",
  "port": 5432,
  "user": "postgres",
  "password": "Opqr!234",
  "database": "LocationData"
})

client.connect(err => {
  if (err) {
    console.error('Database connection error', err.stack)
  } else {
    console.log('Database connected')
  }
})


app.use(express.json()) // for parsing application/json
// app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());

// app.use('/', express.static(__dirname + '/public'));

bcrypt.hash('lundella', 10, function(err, hash) {
  // Store hash in your password DB.
  console.log(hash);
});

function parsePostgresTimeStamp(mobiusTime) {
  let postgresTimeFormat = {
    fullyear: mobiusTime.slice(0, 4),
    month: mobiusTime.slice(4, 6),
    date: mobiusTime.slice(6, 8),
    hour: mobiusTime.slice(9, 11),
    minute: mobiusTime.slice(11, 13),
    second: mobiusTime.slice(13, 15)
  }

  return postgresTimeFormat.fullyear + "/" + postgresTimeFormat.month + "/" + postgresTimeFormat.date 
          + " " + postgresTimeFormat.hour + ":" + postgresTimeFormat.minute + ":" + postgresTimeFormat.second;
}


function getObjectsInSomeArea(area) {
  return new Promise((resolve, reject)=>{
    let areaType = '';
    if(area.radius) {
      areaType = 'WHERE ST_DWithin(GPS, ST_MakePoint('+ area.gpsList +')::geography, '+ area.radius +')';
    } else if(area.gpsList){
      areaType = 'WHERE ST_Contains(ST_SetSRID(ST_MakePolygon(ST_GeomFromText(\'LINESTRING('+ area.gpsList +')\')), 4326), GPS)';
    }

    let searchObjectsFromAreaSql = 'SELECT objects.*, lastfullvalue.latitude, lastfullvalue.longitude, lastfullvalue.altitude, lastfullvalue.velocity, lastfullvalue.status, lastfullvalue.time AS statustime FROM objects ' +
                                    'LEFT JOIN (select locations.* from (SELECT locations.id, max(locations.time) as time FROM locations GROUP BY id) as lastvalue, locations WHERE lastvalue.time=locations.time) AS lastfullvalue ' +
                                    'ON objects.id=lastfullvalue.id ' + areaType;

    console.log('area search: ', searchObjectsFromAreaSql);

    client.query(searchObjectsFromAreaSql)
    .then(response => {
      console.log(response.rows);
      resolve(response.rows)
    }).catch(e=>{
      console.log(e.stack);
      reject(e);
    })
  })
}

function getObjectsCounts(area) {
  return new Promise((resolve, reject)=>{
    let searchObjectsFromAreaSql = 'SELECT type, count(type) FROM (SELECT locations.id, max(locations.time) as time FROM locations GROUP BY id) as lastvalue, locations ' +
    'LEFT JOIN objects ON (objects.id = locations.id) WHERE lastvalue.time=locations.time and ' +
    'ST_Contains(ST_SetSRID(ST_MakePolygon(ST_GeomFromText(\'LINESTRING('+ area +')\')), 4326), GPS) GROUP BY type';

    console.log('area search: ', searchObjectsFromAreaSql);

    client.query(searchObjectsFromAreaSql)
    .then(response => {
      console.log(response.rows);
      resolve(response.rows)
    }).catch(e=>{
      console.log(e.stack);
      reject(e);
    })
  })
}

function getObjectData(id) {
  return new Promise((resolve, reject)=>{
    let objectDataById = 'SELECT * FROM objects, (select locations.* from (SELECT locations.id, max(locations.time) as time FROM locations GROUP BY id) as lastvalue, locations ' +
                          'WHERE lastvalue.time=locations.time) AS lastfullvalue WHERE objects.id=lastfullvalue.id and objects.id=\'' + id + '\'';

    client.query(objectDataById)
    .then(response => {
      console.log(response.rows);
      resolve(response.rows[0]);
    }).catch(e=>{
      console.log(e.stack);
      reject(e);
    })
  })
}



app.get("/objects/:id/history", (req, res) => {
  console.log(req.params.id);
  console.log(req.query.startTime);
  console.log(req.query.endTime);
  if(!req.params.id) {
    res.status(400).send("Bada Request");
  }



  res.send("history");
}) 


/* GET Retrieve Types
 * @returns {} object data
 */
app.get("/objects/:id", (req, res) => {
  if(!req.params.id) {
    res.status(400).send("Bada Request");
  }

  let id = req.params.id;

  getObjectData(id).then(response=>{
    res.send(response);
  }).catch(e => {
    res.status(400).send(e.stack);
  })
})

/* GET Retrieve Types
 * @returns [] objects data
 */
app.get("/objects", (req, res) => {  
  let areaInfo = {
    gpsList: '',
    radius: req.query.radius
  };

  if ((!req.query.lat && req.query.lng) || (req.query.lat && !req.query.lng)) {
    res.status(400).send("Bad Request");
  }
  
  if(req.query.lat.length === req.query.lat.length) {
    let latitudeList = JSON.parse(req.query.lat);
    let longitudeList = JSON.parse(req.query.lng);
  
    let latitude = [
      latitudeList[0],
      latitudeList[0],
      latitudeList[1],
      latitudeList[1],
      latitudeList[0],
    ];
    let longitude = [
      longitudeList[0],
      longitudeList[1],
      longitudeList[1],
      longitudeList[0],
      longitudeList[0],
    ]
  
    if(areaInfo.radius) {
      areaInfo = {
        gpsList: (longitudeList[0]? longitudeList[0]: longitudeList) + ', ' + (latitudeList[0]? latitudeList[0]: latitudeList),
        radius: radius
      }
    } else {
      for(let index = 0; index < latitude.length; index++) {
        areaInfo.gpsList += (index? ', ': '') + longitude[index] + ' ' + latitude[index];
      }
    }
  }

  getObjectsInSomeArea(areaInfo).then(response => {
    res.send(response);
  }).catch(e => {
    res.status(400).send(e.stack);
  })
})

/* GET Retrieve Types
 * @returns [] object counts by types
 */
app.get("/objects/counts", (req, res) => {
  let totalCountSql = 'SELECT type, count(*) FROM objects group by type';
  let latitudeList = JSON.parse(req.query.lat);
  let longitudeList = JSON.parse(req.query.lng);
  let radius = req.query.radius;
  let gpsList = '';
  let latitude = [
    latitudeList[0],
    latitudeList[0],
    latitudeList[1],
    latitudeList[1],
    latitudeList[0],
  ];
  let longitude = [
    longitudeList[0],
    longitudeList[1],
    longitudeList[1],
    longitudeList[0],
    longitudeList[0],
  ]

  if(latitudeList.length != longitudeList.length) {
    res.status(400).send("Bad Request");
  }

  for(let index = 0; index < latitude.length; index++) {
    gpsList += (index? ', ': '') + longitude[index] + ' ' + latitude[index];
  }

  async function countData() {
    let countData = {
      total: {},
      area: {}
    }
    await client.query(totalCountSql).then(totalCounts=>{
      countData.total = totalCounts.rows;
    });
    await getObjectsCounts(gpsList).then(areaCounts=>{
      countData.area = areaCounts;
      console.log('get countData', countData);
    }).then(_=>{
      res.status(200).send(countData);
    })
  }

  try {
    countData();
  } catch(e) {
    res.status(400).send("Bad Request");
  }
})

/* POST Register Object
 * @returns string message
 */
app.post("/objects", (req, res) => {
  let body = req.body;
  let options = {
    hostname: Config.mobius.host,
    port: Config.mobius.port,
    path: '/resources/ae',
    method: 'POST',
    headers: {
      "Accept": "application/json",
      "X-M2M-Ri": "ketiketi",
      "X-M2M-Origin": "S",
      "Content-Type": ""
    }
  }

  let oneM2MBody = {
    ae: { "m2m:ae" : { "rn": body.id, "api": "0.2.481.2.0001.001.000111", "lbl": [body.type], "rr": true }},
    cnt: { "m2m:cnt" : { "rn": "location" }},
    sub: { "m2m:sub" : { "rn": "rtls_sub", "enc":{ "net":[3] }, "nu": ["http://localhost:7580/locations"] }}
  }

  function requestOneM2MCreation(resource, options) {
    if(resource['m2m:ae']) {
      options.path = '/resources/ae';
      options.headers['Content-Type'] = 'application/json; ty=2'
    } else if(resource['m2m:cnt']) { 
      options.path = '/bada/' + body.id;
      options.headers['Content-Type'] = 'application/json; ty=3'
    } else if(resource['m2m:sub']) { 
      options.path = '/bada/' + body.id + '/location';
      options.headers['Content-Type'] = 'application/json; ty=23'
    }

    return new Promise((resolve, reject)=>{
      try {
        const httpRequest = http.request(options, (response)=> {
          let data = '';
      
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            data += chunk;
          }).on('end', ()=>{
            console.log(typeof data);
            if(typeof data != 'object') { console.log('Error : ', data); }
            resolve(data);
          })
        })
      
        httpRequest.write(JSON.stringify(resource));
        httpRequest.end();        
      } catch(e) {
        reject(e);
      }
    })
  }

  async function makeOneM2MResource() {
    await requestOneM2MCreation(oneM2MBody.ae, options)
    await requestOneM2MCreation(oneM2MBody.cnt, options)
    await requestOneM2MCreation(oneM2MBody.sub, options)
  }

  makeOneM2MResource().then(_=>{   
    let sql = 'INSERT INTO objects (id, name, type, attrs, image) values (\'' + 
      body.id + '\', \'' + body.name + '\', \'' + body.type + '\', \'' + 
      JSON.stringify(body.attrs) + '\', \'' + body.image +'\')';

    client.query(sql)
    .then(result=>{
      res.send('Create Object Success');
    }).catch(e=>{
      console.log('Create Object Fail');
      console.log(e.stack);
      res.status(500).send('Internal Server Error');
    })
  });
})

/* GET Retrieve Types
 * @param 
 * @returns {} type list
 */
app.get("/types", (req, res)=>{
  client.query('SELECT * from types', (err, response) => {
    if(err) {
      console.log(err.stack);
      res.status(500).send('Interneal Server Error by database.');
      return;
    }
    console.log(response.rows);
    res.status(200).send(response.rows);
  })
})

/* POST Register Type
 * @param 
 * @returns {} type list
 */
app.post("/types", (req, res)=>{
  const Keys = Object.keys(req.body);
  const Columns =  Keys.join(',');  
  const Values = Keys.reduce((total, key, index)=>{
    if(index === 1) { total = '\''+ req.body[total] + '\''; }

    if(typeof req.body[key] === 'object') {
      value = ',\'' + JSON.stringify(req.body[key]) + '\'';
    } else {
      value = ',\'' + req.body[key] + '\'';
    }

    return total + value;
  })

  let sql = 'INSERT INTO model ('+ Columns + ') values (' + Values + ')'

  client.query(sql, (err, response) => {
    if (err) {
      console.log(err.stack);
      res.status(500).send('Interneal Server Error by database.');
      return;
    } 
    console.log('Register Object Model');
    res.status(200).send('Success Register Object Model');
  })
})

/* POST Receive Location Data
 * @returns string message
 */
app.post("/locations", (req, res)=>{
  let data = req.body;

  if(!data['m2m:sgn'] ||  !data['m2m:sgn'].nev) {
    res.status(400).send('Bada Request');
    return;
  }

  let resources =  data['m2m:sgn'].sur.split('/');
  let cinData = data['m2m:sgn'].nev.rep['m2m:cin'];
  let cinContents = cinData.con;
  let creationTime = parsePostgresTimeStamp(cinData.ct);

  let id = resources[1];
  let locationData = {
    "id": id,
    "lat": cinContents.lat? cinContents.lat: cinContents.latitude? cinContents.latitude: null,
    "lng": cinContents.lng? cinContents.lng: cinContents.longitude? cinContents.longitude: null,
    "time": creationTime,
    "alt": cinContents.alt? cinContents.alt: cinContents.altitude? cinContents.altitude: null,
    "direction": cinContents.direction? cinContents.direction: null,
    "velocity": cinContents.velocity? cinContents.velocity: null,
    "status": cinContents.status? JSON.stringify(cinContents.status): {}
  }
  
  let saveDataQuery = 'INSERT INTO locations (id, latitude, longitude, altitude, direction, velocity, time, status, gps)' +
            ' values (\''+ id + '\', \'' + locationData.lat + '\', \'' + locationData.lng + '\', \'' + locationData.alt + '\', \'' + 
            locationData.direction + '\', \'' + locationData.velocity + '\', \'' + locationData.time + '\', \'' + locationData.status + 
            '\', ST_SetSRID(ST_MakePoint('+parseFloat(locationData.lng)+','+parseFloat(locationData.lat)+'),4326))';

            console.log(saveDataQuery);
  client.query(saveDataQuery)
  .then(result=>{
    res.status(200).send('Received Location Data');
    console.log(result);
  }).catch(e=>{
    res.status(500).send('Internal Error');
    console.log(e.stack);
  })
})

server.listen(7979, ()=> {
  console.log("RTLS-Server Start on port 7979");
})
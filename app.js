const express = require('express');
const app = express();
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'LocationData',
  password: 'Opqr!234',
  port: 5432,
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



app.get("/types", (req, res)=>{
  client.query('SELECT * from model', (err, response) => {
    if(err) {
      console.log(err.stack);
      res.status(500).send('Interneal Server Error by database.');
      return;
    }
    res.status(200).send(response.rows);
  })

})


app.post("/types", (req, res)=>{
  const Keys = Object.keys(req.body);
  const Columns =  Keys.join(',');  
  const Values = Keys.reduce((total, key, index)=>{
    if(index === 1) { total = '\''+ req.body[total] + '\''; }

    if(Array.isArray(req.body[key])) {
      value = ', ARRAY\[\''+ req.body[key].join('\',\'') + '\'\]';
    } else {
      value = ',\'' + req.body[key] + '\'';
    }

    return total + value;
  })

  let sql = 'INSERT INTO model ('+ Columns + ') value (' + Values + ')'

  client.query(sql, (err, response) => {
    if (err) {
      console.log(err.stack);
      res.status(500).send('Interneal Server Error by database.');
      return;
    } 
    console.log('Register Object Model');
  })
  res.status(200).send('Success Register Object Model');
})


app.get("/objects", (req, res) => {
  let sql = 'SELECT * FROM objects';

  console.log("GET/ objects API ");
  client.query(sql)
  .then(response => {
    console.log(response.rows);
    res.send(response.rows);
  }).catch(e=>{
    console.log(e.stack);
  })
})

app.post("/locations", (req, res)=>{
  let data = req.body;

  if(!data['m2m:sgn']) {
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
  
  let saveDataQuery = 'INSERT INTO locations (id, latitude, longitude, altitude, direction, velocity, time, status)' +
            ' values (\''+ id + '\', \'' + locationData.lat + '\', \'' + locationData.lng + '\', \'' + locationData.alt + '\', \'' + 
            locationData.direction + '\', \'' + locationData.velocity + '\', \'' + locationData.time + '\', \'' + locationData.status +'\')';

            console.log(saveDataQuery);


  res.status(200).send('Received Location Data');
})

app.listen(7580, ()=> {
  console.log("RTLS-Server Start on port 7580");
})
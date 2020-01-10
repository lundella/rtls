const express = require('express');
const app = express();
const http = require('http')
const server = http.Server(app);
const bodyParser = require('body-parser');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

var multer  = require('multer')

const Config = require('./config.json');
const DBConfig = Config.database;

const moment = require('moment');
const client = new Client({
  "host": DBConfig.host,
  "port": DBConfig.port,
  "user": DBConfig.user,
  "password": DBConfig.password,
  "database": DBConfig.database
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

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin,Accept, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, x-access-token")
  next();
});

// app.use('/', express.static(__dirname + '/public'));

function bcryptPassword(password) {
  const salt = bcrypt.genSaltSync();
  const hashedPassword = bcrypt.hashSync(password, salt);

  return hashedPassword;
}

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
                                    'LEFT JOIN (select locations.* from (SELECT locations.id, max(locations.time) as time FROM locations GROUP BY id) as lastvalue, locations WHERE lastvalue.time=locations.time AND lastvalue.id=locations.id) AS lastfullvalue ' +
                                    'ON objects.id=lastfullvalue.id ' + areaType;

    console.log(searchObjectsFromAreaSql);
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

function getObjectsDatabyArea(area, duration, condition) {
  return new Promise((resolve, reject)=>{
    let clauses = [];
    let whereClause = 'WHERE';

    if(area.radius) {
      clauses.push(' ST_DWithin(GPS, ST_MakePoint('+ area.gpsList +')::geography, '+ area.radius +')');
    } else if(area.gpsList){
      clauses.push(' ST_Contains(ST_SetSRID(ST_MakePolygon(ST_GeomFromText(\'LINESTRING('+ area.gpsList +')\')), 4326), GPS)');
    } 
    
    if(duration.startTime) {
      clauses.push(' locations.time >=\'' + duration.startTime + '\'');
    } 
    if(duration.endTime) {
      clauses.push(' locations.time <=\'' + duration.endTime + '\'');
    }

    

    clauses.forEach((clause, index) => {
      if(index < clauses.length-1) {
        whereClause += clause + ' AND';
      } else {
        whereClause += clause;
      }
    })
    
    let locationDataAreaSql = 'SELECT * FROM (SELECT objects.id, objects.name, objects.type, locations.latitude, locations.longitude, locations.altitude, locations.velocity, locations.status, locations.time AS time ' +
                              ' FROM locations LEFT JOIN objects ON objects.id=locations.id ' + whereClause + ') AS information' +
                              ' ORDER BY ' + condition.standard + ' ' + condition.order + condition.limit;
  
    client.query(locationDataAreaSql)
    .then(response => {
      let result = response.rows.length? response.rows: null
      resolve(result);
    }).catch(e=>{
      console.log(e.stack);
      reject(e);
    })
  })
}

function checkToken(token) {
  jwt.verify(token, 'badacafe00', (err, decoded) => {
    if(err) {
      console.log(typeof err);
      return err;
    };

    return decoded.password;
  })
}

function validUser(password, cb) {
  let result = false;
  client.query('SELECT password FROM setting')
  .then(response => {
    if(response.rows[0].password === password) {
      result = true;
    }
    cb(result);
  }).catch(e => {
    console.log(e);
  })
}

async function multipleQuery(id) {
  let returnedData = {};
  returnedData = await client.query('SELECT * FROM objects WHERE id=\'' + id + '\'')
  .then(res => { 
    let objectInfo = null;
    if(res.rows[0]) {
      objectInfo = res.rows[0];
      objectInfo.time = moment(objectInfo.time).format("YYYY-MM-DD HH:mm:ss.sss");
    }

    return objectInfo;
  });

  returnedData.message = await client.query('SELECT messages.object, messages.contents, lasttime.time ' +
                                            'FROM messages, (SELECT max(time) as time, object FROM messages WHERE object=\'' + id + '\' GROUP BY object) AS lasttime ' +
                                            'WHERE lasttime.time=messages.time')
  .then(res => { 
    let messageInfo = null;

    if(res.rows[0]) {
      messageInfo = res.rows[0];
      messageInfo.time = moment(messageInfo.time).format("YYYY-MM-DD HH:mm:ss.sss");

      delete messageInfo.object;
      delete messageInfo.id;
    }
    return messageInfo
  });

  returnedData.location = await client.query('SELECT locations.* FROM (SELECT locations.id, max(locations.time) as time FROM locations GROUP BY id) as lastvalue, locations ' +
                                             'WHERE lastvalue.time=locations.time AND locations.id=lastvalue.id AND locations.id=\''+ id + '\'')
  .then(res => { 
    let locationInfo = null;
    if(res.rows[0]) {
      locationInfo = res.rows[0];
      locationInfo.time = moment(locationInfo.time).format("YYYY-MM-DD HH:mm:ss.sss");
      delete locationInfo.gps;
      delete locationInfo.id;
      delete locationInfo.name;
    }
    return locationInfo;
  });

  return returnedData;
}

app.post("/messages", (req, res) => {
  let body = req.body;
  let sql = '';

  if(!body.object) {
    res.status(400).send('Object name is not exist.');
    return;
  }

  body.type = body.type? body.type : 'type10';

  try {
    client.query('INSERT INTO message (object, contents, type) VALUES ()')
    .then(response => {
      res.send('Message Send Success');
    })
  } catch(e) {
    res.status(500).send('Message Send Fail');
    console.log(e);
  }

})

app.get("/messages", (req, res) => {
  client.query('SELECT * FROM messages')
  .then(response => {
    if(!response.rows.length) {
      res.status(204).send('No Content');
    }

    let messagesData = response.rows;

    messagesData.forEach(message => {
      delete message.id;
    })
    res.send(messagesData);
  })
})

/* GET Token Authentification
 * @returns {} 
 */
app.get("/auth", (req, res) => {
  if(!req.headers['x-access-token']) {
    res.status(401).send('Unauthorized');
  }

  client.query(sql)
  .then(response => {
    if(!bcrypt.compareSync(checkToken(req.headers['x-access-token']), response.rows[0].password)) {
      res.status(401).send("Not Valid Password");
      return;
    }

    res.status(200).send("OK");
  })
})


/* POST Login Administrator
 * @returns {} 
 */
app.post("/login", (req, res) => {
  if(!req.body.password) {
    res.status(400).send("Bad Request");
    return;
  }

  let sql = 'SELECT password FROM setting';
  
  client.query(sql)
  .then(response => {
    if(!bcrypt.compareSync(req.body.password, response.rows[0].password)) {
      res.status(400).send("Not Valid Password");
      return;
    }

    jwt.sign({
      password: response.rows[0].password
    },
    'badacafe00',
    { algorithm: 'HS256'}, 
    (err, token) => {
      if(err) throw err;

      res.send(token);
    });
  })
})

app.put("/password", (req, res) => {
  if(!req.body) {
    res.status(400).send("Bad Request");
    return;
  }

  // 협의 후 인증 요청 API 적용 부분
  // let token = req.headers['x-access-token']?req.headers['x-access-token']: '';
  // let password = checkToken(token);

  // validUser(password, (response)=>{
  //   if(!response) {
  //     res.send("!!!Not valid User");;
  //   }
  //   res.send("check token success!");
  // })
  // end
  
  client.query('SELECT password FROM setting')
  .then(response => {
    if(!bcrypt.compareSync(req.body.current, response.rows[0].password)) {
      res.status(400).send("Not Valid Password");
      return;
    }

    let sql = 'UPDATE setting SET password=\'' + bcryptPassword(req.body.new) + '\' WHERE name = (SELECT name FROM setting LIMIT 1)';

    client.query(sql)
    .then(response => {
      res.send('Change Password Success!');
    }).catch(e => {
      console.log(e.stack);
      res.status(400).send("Bad Request");
    })
  }).catch(e => {
    console.log(e.stack);
    res.status(400).send("Bad Request");
  })
})


/* PUT Retrieve Types
 * @returns {} object data
 */
app.put("/object/:id", (req, res) => {
  if(!req.params.id) {
    res.status(400).send("Bada Request");
  }

  let id = req.params.id;
  let dataColumns = ['name', 'type', 'attrs', 'description'];
  let storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'images/object/')
    },
    filename: function (req, file, cb) {
      cb(null, req.params.id + '-' + Date.now() + '-' + file.originalname);
    }
  })
  let upload = multer({ storage: storage }).single('object');
  let sql = 'UPDATE objects SET ';

  upload(req, res, (err)=> {
    if(err) {
      res.status(400).send(err.stack);
    }

    let body = req.body;
    let fileInformation = req.file? req.file : '';

    if(fileInformation) {
      sql += 'image=\'' + fileInformation.destination + fileInformation.filename +'\', ';
    }
    
    dataColumns.forEach((column, index) => {
      if(!body[column]) { return; }

      if(body.id) { delete body.id; }

      // attrs 내부 json 업데이트 시 기존 항목 보존 내용 필요
      sql += column + '=\'' + ((column === 'attr')? JSON.parse(body[column]): body[column])
            + '\'' + ((index === dataColumns.length-1)? '': ', ');
    })
    sql += ' WHERE id=\'' + id + '\'';

    console.log('object image upload success.');
    client.query(sql).then(response=>{
      console.log('object information update success.');
      res.send('Update Success');
    }).catch(e => {
      res.status(400).send(e.stack);
    })
  });
})

/* PUT Retrieve service setting information
 */
app.put("/environment", (req, res) => {
  if(!req.body) {
    res.status(400).send('Bad Request');
    return;
  }

  let body = req.body;
  let dataKeys = Object.keys(req.body);
  let sql = 'UPDATE setting SET ';

  dataKeys.forEach((key, index) => {
    if(index) {
      sql += ', ';
    }
    sql += key + '=\'' + body[key] + '\'';
  })
  sql += ' WHERE name = (SELECT name FROM setting LIMIT 1)';

  client.query(sql)
  .then(response => {
    console.log('Enverionment Setting Success: ', response.rowCount);
    res.send('Update Success');
  }).catch(e => {
    console.log(e.stack)
    res.status(400).send("Bad Request");
  })
})

/* PUT Retrieve map setting information
 */
app.put("/map", (req, res) => {
  if(!req.body) {
    res.status(400).send('Bad Request');
    return;
  }

  let body = req.body;
  let sql = 'UPDATE setting SET map=\'' + JSON.stringify(body) + '\' WHERE name = (SELECT name FROM setting LIMIT 1)';

  client.query(sql)
  .then(response => {
    console.log('Map Setting Success: ', response.rowCount);
    res.send('Update Success');
  }).catch(e => {
    console.log(e.stack)
    res.status(400).send("Bad Request");
  })
})


/* PUT Retrieve legends setting information
 */
app.put("/map/legends", (req, res) => {
  if(!req.body) {
    res.status(400).send('Bad Request');
    return;
  }
  let body = req.body;
  let sql = 'UPDATE setting SET legends=Array' + body.legends + ' WHERE name = (SELECT name FROM setting LIMIT 1)';

  client.query(sql)
  .then(response => {
    console.log('Legends Setting Success: ', response.rowCount);
    res.send('Update Success');
  }).catch(e => {
    console.log(e.stack)
    res.status(400).send("Bad Request");
  })
})

/* GET Retrieve service setting information
 * @returns {} setting information
 */
app.get("/environment", (req, res) => {
  let sql = 'SELECT title, name, logo, color FROM setting';

  client.query(sql)
  .then(response => {
    res.send(response.rows[0]);
  }).catch(e => {
    console.log(e.stack)
    res.status(400).send("Bad Request");
  })
})

/* GET Retrieve map setting information
 * @returns {} map setting information
 */
app.get("/map", (req, res) => {
  let sql = 'SELECT map FROM setting';

  client.query(sql)
  .then(response => {
    res.send(response.rows[0]);
  }).catch(e => {
    console.log(e.stack)
    res.status(400).send("Bad Request");
  })
})


/* GET Retrieve legends setting information
 * @returns {} legends setting information
 */
app.get("/map/legends", (req, res) => {
  let sql = 'SELECT legends FROM setting';

  client.query(sql)
  .then(response => {
    res.send(response.rows[0]);
  }).catch(e => {
    console.log(e.stack)
    res.status(400).send("Bad Request");
  })
})


/* GET Retrieve objects history
 * @returns [] objects history data
 */
app.get("/objects/history", (req, res) => {
  let latitudeList = req.query.lat? JSON.parse(req.query.lat): 0;
  let longitudeList = req.query.lng? JSON.parse(req.query.lng): 0;

  let searchCondition = {
    standard: req.query.standard? req.query.standard: "time",
    order: req.query.order? req.query.order: "DESC",
    limit: req.query.limit? ' LIMIT ' + req.query.limit + ' OFFSET ' + (req.query.page? ((req.query.page-1) * req.query.limit): 0) +'' : '',
  }

  let duration = {
    startTime : req.query.startTime? req.query.startTime: 0,
    endTime: req.query.endTime? req.query.endTime: 0
  };
  
  let areaInfo = {
    gpsList: '',
    radius: req.query.radius? req.query.radius: ''
  };

  if ((!latitudeList && longitudeList) || (latitudeList && !longitudeList)) {
    res.status(400).send("Bad Request");
    return;
  }

  
  if((latitudeList.length == 1) && (longitudeList.length == 1) && !areaInfo.radius) {
    res.status(400).send("Bad Request");
    return;
  }
  
  if(latitudeList.length === longitudeList.length) {
    let latitude = [];
    let longitude = [];

    if(latitudeList.length < 3) {
      latitude = [
        latitudeList[0],
        latitudeList[0],
        latitudeList[1],
        latitudeList[1],
        latitudeList[0],
      ];
      longitude = [
        longitudeList[0],
        longitudeList[1],
        longitudeList[1],
        longitudeList[0],
        longitudeList[0],
      ]
    } else {
      latitude = latitudeList;
      longitude = longitudeList;
    }
  
    if(areaInfo.radius) {
      areaInfo.gpsList = (longitudeList[0]? longitudeList[0]: longitudeList) + ', ' + (latitudeList[0]? latitudeList[0]: latitudeList);
    } else {
      for(let index = 0; index < latitude.length; index++) {
        areaInfo.gpsList += (index? ', ': '') + longitude[index] + ' ' + latitude[index];
      }
    }
  }
  
  getObjectsDatabyArea(areaInfo, duration, searchCondition)
  .then(response => {
    res.send(response);
  })
})

/* GET Retrieve Types
 * @returns [] object history data
 */
app.get("/object/:id/history", (req, res) => {
  if(!req.params.id) {
    res.status(400).send("Bada Request");
  }

  let historyFromIdSql = 'SELECT * FROM locations';
  let objectId = req.params.id;
  let whereClause = ' WHERE id=\'' + objectId + '\'';
  let searchCondition = {
    standard: req.query.standard? req.query.standard: "time",
    order: req.query.order? req.query.order: "DESC",
    limit: req.query.limit? ' LIMIT ' + req.query.limit + ' OFFSET ' + (req.query.page? ((req.query.page-1) * req.query.limit): 0) +'' : '',
  }

  if(req.query.startTime) {
    whereClause += ' AND time >=\'' + req.query.startTime + '\'';
  }
  if(req.query.endTime) {
    whereClause += ' AND time <=\'' + req.query.endTime + '\'';
  }

  historyFromIdSql += whereClause;
  historyFromIdSql += ' ORDER BY ' + searchCondition.standard + ' ' + searchCondition.order + searchCondition.limit;

  client.query(historyFromIdSql)
  .then(response => {
    let result;
    if(!response.rowCount) {
      result = null;
    } else {
      result = response.rows;
    }
    res.send(result);
  }).catch(e=>{
    console.log(e.stack);
    res.status(400).send("Bad Request");
  })
}) 


/* GET Retrieve Types
 * @returns {} object data
 */
app.get("/object/:id", (req, res) => {
  console.log('objects latitude');
  if(!req.params.id) {
    res.status(400).send("Bada Request");
  }

  let id = req.params.id;

  multipleQuery(id)
  .then(response => {
    res.send(response);
  });
  // getObjectData(id).then(response=>{
  //   res.send(response);
  // }).catch(e => {
  //   res.status(400).send(e.stack);
  // })
})

/* GET Retrieve Types
 * @returns [] objects data
 */
app.get("/objects", (req, res) => {
  let latitudeList = req.query.lat? JSON.parse(req.query.lat): 0;
  let longitudeList = req.query.lng? JSON.parse(req.query.lng): 0;
  let areaInfo = {
    gpsList: '',
    radius: req.query.radius? req.query.radius: undefined
  };

  let searchCondition = {
    standard: req.query.standard? req.query.standard: "time",
    order: req.query.order? req.query.order: "DESC",
    limit: req.query.limit? ' LIMIT ' + req.query.limit + ' OFFSET ' + (req.query.page? ((req.query.page-1) * req.query.limit): 0) +'' : '',
    keyword: req.query.keyword? 'WHERE id LIKE \'%' + req.query.keyword + '%\'': '',
  }

  if ((!latitudeList && longitudeList) || (latitudeList && !longitudeList)) {
    res.status(400).send("Bad Request");
    return;
  }
  
  if((latitudeList.length == 1) && (longitudeList.length == 1) && !areaInfo.radius) {
    res.status(400).send("Bad Request");
    return;
  }
  
  if (!latitudeList && !longitudeList) {
    let getObjectsDataSql = 'SELECT * FROM objects '+ searchCondition.keyword +' ORDER BY ' + searchCondition.standard + ' ' + searchCondition.order + searchCondition.limit

    console.log(getObjectsDataSql);
    client.query(getObjectsDataSql)
    .then(response => {
      res.send(response.rows);
    })
  } else if(latitudeList.length === longitudeList.length) {
    let latitude = [];
    let longitude = [];

    if(latitudeList.length < 3) {
      latitude = [
        latitudeList[0],
        latitudeList[0],
        latitudeList[1],
        latitudeList[1],
        latitudeList[0],
      ];
      longitude = [
        longitudeList[0],
        longitudeList[1],
        longitudeList[1],
        longitudeList[0],
        longitudeList[0],
      ]
    } else {
      latitude = latitudeList;
      longitude = longitudeList;
    }
  
    if(areaInfo.radius) {
      areaInfo.gpsList = (longitudeList[0]? longitudeList[0]: longitudeList) + ', ' + (latitudeList[0]? latitudeList[0]: latitudeList);
    } else {
      for(let index = 0; index < latitude.length; index++) {
        areaInfo.gpsList += (index? ', ': '') + longitude[index] + ' ' + latitude[index];
      }
    }
    getObjectsInSomeArea(areaInfo).then(response => {
      res.send(response);
    }).catch(e => {
      res.status(400).send(e.stack);
    })
  }
})

/* GET Retrieve Types
 * @returns [] object counts by types
 */
app.get("/objects/counts", (req, res) => {
  let totalCountSql = 'SELECT type, count(*) FROM objects group by type';
  let latitudeList = req.query.lat? JSON.parse(req.query.lat): 0;
  let longitudeList = req.query.lng? JSON.parse(req.query.lng): 0;
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
  ];
  let countData = {
    total: {}
  };

  if(!latitudeList.length && !longitudeList.length) {
    client.query(totalCountSql).then(totalCounts=>{
      countData.total = totalCounts.rows;
    }).then(_=>{
      res.status(200).send(countData);
    })
    return;
  }

  if(latitudeList.length != longitudeList.length) {
    res.status(400).send("Bad Request");
  }

  for(let index = 0; index < latitude.length; index++) {
    gpsList += (index? ', ': '') + longitude[index] + ' ' + latitude[index];
  }

  async function getCountData() {
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
    getCountData();
  } catch(e) {
    res.status(400).send("Bad Request");
  }
})

/* POST Register Object
 * @returns string message
 */
app.post("/objects", (req, res) => {
  let storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'images/object/')
    },
    filename: function (req, file, cb) {
      cb(null, req.body.id + '-' + Date.now() + '-' + file.originalname);
    }
  })
  let upload = multer({ storage: storage }).single('object');

  upload(req, res, (err)=>{
    if(err) {
      res.status(400).send("File Upload Error");
      return;
    }

    let body = req.body;
    let fileInformation = req.file? req.file: '';
    let imagePath = '';

    if(fileInformation) {
      imagePath = '\'' + fileInformation.destination + fileInformation.filename +'\'';
    } else {
      imagePath = '(SELECT image FROM types WHERE name=\'' + body.name + '\')';
    }

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
                body.attrs + '\', ' + imagePath +')';
  
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
  let storage = multer.diskStorage({
    destination: function (req, file, cb) {
      console.log(file);
      cb(null, 'images/' + file.fieldname + '/');
    },
    filename: function (req, file, cb) {
      cb(null, req.body.name + '-' + Date.now() + '-' + file.originalname);
    }
  })
  let upload = multer({ storage: storage }).fields([
    {name: 'icon'},
    {name: 'default'}
  ]);

  upload(req, res, (err)=>{
    if(err) {
      res.status(400).send(err.stack);
    }

    const Keys = Object.keys(req.body);
    let columns =  Keys.join(',');  
    let values = Keys.reduce((total, key, index)=>{
      if(index === 1) { total = '\''+ req.body[total] + '\''; }
  
      if(typeof req.body[key] === 'object') {
        value = ',\'' + JSON.stringify(req.body[key]) + '\'';
      } else {
        value = ',\'' + req.body[key] + '\'';
      }
  
      return total + value;
    })

    if(req.files) {
      var filesInformation = req.files; 
      let filesName = Object.keys(req.files);

      filesName.forEach(file => {
        if(filesInformation[file][0].fieldname === 'icon') {
          columns += ',' + file;
        } else if(filesInformation[file][0].fieldname === 'default') {
          columns += ',image';
        }

        values += ', \'' + filesInformation[file][0].destination + filesInformation[file][0].filename +'\'';
      })
      
    }

    let sql = 'INSERT INTO types ('+ columns + ') values (' + values + ')'

    client.query(sql, (err, response) => {
      if (err) {
        console.log(err.stack);
        res.status(500).send('Interneal Server Error by database.');
        return;
      } 
      console.log('Register Object Type');
      res.status(200).send('Success Register Object Type');
    })
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
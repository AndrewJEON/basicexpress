var express = require('express'), 
  app = express(),
  fs = require('fs'),
  path = require('path'),
  key = fs.readFileSync(path.join(__dirname,'./keys/private.pem')),
  cert = fs.readFileSync(path.join(__dirname, './keys/public.pem')),
  // HTTP(Hyper Text Transfer Protocol, 하이퍼텍스트 전송 방식)
  // - C : [Client] -> HTTP -> TCP -> IP -> EtherNet(*)
  // - S : EtherNet(*) -> IP -> TCP -> HTTP -> [Server]
  // TCP : 데이터를 작게 나누어서(패킷) 다른쪽으로 옮기고, 이를 다시 조립하여 원래의 데이터로 만드는 규칙
  http = require('http').Server(app),
  https = require('https').createServer({key: key, cert: cert }, app),
  tcpNet = require('net'),
  // Modbus Tcp 통신
  ModbusRTU = require('modbus-serial'),
  ModbusRTUtcpClient = new ModbusRTU(),
  io = require('socket.io')(https),
  iochat = require('socket.io')(http),
  conn = require('./config/sqlinfo.js'),
  sqlconn = conn.sqlInfo.connect(),
  mongo = require('./config/mongoosedb.js'),
  session = require('express-session'),
  pug = require('pug'),
  cors = require('cors'),
  logger = require('morgan'),
  port = process.env.PORT || 3000;

// Router Files
const sqlRouter = require('./routers/sqlrouter.js'),
  mongoRouter = require('./routers/mongoRouter.js'),
  fileRouter = require('./routers/filerouter.js'),
  renderRouter = require('./routers/renderhtml.js'),
  chatPugRouter = require('./routers/chatPug.js'),
  loginRouter = require('./routers/loginrouter.js'),
  snsLoginRouter = require('./routers/snsLoginrouter.js'),
  logoutRouter = require('./routers/logoutrouter.js'),
  airtableRouter = require('./routers/airtablerouter.js'),
  fcmRouter = require('./routers/fcmRouter.js'),
  graphqlRouter = require('./routers/graphqlrouter.js'),
  vueRouter = require('./routers/vuerouter.js'),
  streamingRouter = require('./routers/streamingrouter.js'),
  pyServerRouter = require('./routers/pyserverrouter.js');

// Cross-Origin Resource Sharing
app.use(cors());

// none-Helmet : app.use(helmet());
app.disable('x-powered-by'); 

// body-parser
app.use(express.json());
app.use(express.urlencoded({extended: false}));

// session
app.use(session({ secret: '!@# 123',resave: false, saveUninitialized: false }));

// static
app.use(express.static(path.join(__dirname,"/assets"),  { etag: false } ));
app.use(express.static(path.join(__dirname,"/files")));
app.use(express.static(path.join(__dirname,"/vfiles")));
app.use(express.static(path.join(__dirname,"/sfile")));
app.use(express.static(path.join(__dirname,"/styles")));
app.use(express.static(path.join(__dirname,"/views")));

// Debug(short || common || combined)
app.use(logger('dev'));

// PUG Engin
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'html'));
app.use(express.static(path.join(__dirname, 'html')));

//app.listen(port,() => console.log("3000"));
http.listen(port,(console.log(`${port} HTTP`)));
https.listen(443,(console.log("443 HTTPS")));

app.get('*', (req,res,next) => {
    res.header("Cache-Control", "no-cache, no-store, must-revalidate");
    res.header("Pragma", "no-cache");   
    res.header("Expires", 0);
    next();
});

// Routers
app.get('/', (req,res) => res.sendFile(path.join(__dirname, '/app.html')));
app.use('/vues',vueRouter);
app.use('/sqls', sqlRouter);
app.use('/mongo', mongoRouter);
app.use('/fpage', fileRouter);
app.use('/renderHtml', renderRouter);
app.use('/login', loginRouter);
app.use('/logout', logoutRouter);
app.use('/auth', snsLoginRouter);
app.use('/fcm', fcmRouter);
app.use('/chatPug', chatPugRouter);
app.use('/airtabledb', airtableRouter);
app.use('/graphqlserver', graphqlRouter);
app.use('/streamingRouter', streamingRouter);
app.use('/pyserver', pyServerRouter);
app.get('/rtc', (req, res) => res.sendFile(path.join(__dirname,'./views/rtc.html')));

// non path
app.use('*',(req,res, next) => res.json("404 ! Not Found !"));
app.use(function(err, req, res, next) {
  console.error(err.stack);
  res.status(500).send('app Something broke!');
});

// socket IO
iochat.on('connect', (socket) => {
  console.log("Chat socket Connection");
  socket.on('open', (data) => {
    console.log(data);
    io.emit('welcome', {'title' : "Socket TITLE", 'des':'Socket DATA'});
  });

  socket.on('chats',(data) => {
    console.log(data);
    // io.emit('chatsYou',{'title':'', 'des':data['des']});
    socket.broadcast.emit('chatsYou',{'title':'', 'des':data['des']});
  });

})

io.on('connection', (socket) => {
  console.log("Rtc socket Connection");
  function log() {
    let array = ['Message from server:'];
    array.push.apply(array,arguments);
    socket.emit('log',array);
  }

  socket.on('message',message=>{
      log('Client said : ' ,message);
      socket.broadcast.emit('message',message);
  });

  socket.on('create or join',room=>{
      let clientsInRoom = io.sockets.adapter.rooms[room];
      let numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
      log('Room ' + room + ' now has ' + numClients + ' client(s)');
      
      if(numClients === 0){
          console.log('create room!');
          socket.join(room);
          log('Client ID ' + socket.id + ' created room ' + room);
          socket.emit('created',room,socket.id);
      }
      else if(numClients===1){
          console.log('join room!');
          log('Client Id' + socket.id + 'joined room' + room);
          io.sockets.in(room).emit('join',room);
          socket.join(room);
          socket.emit('joined',room,socket.id);
          io.sockets.in(room).emit('ready');
      }else{
          socket.emit('full',room);
      }
  });
});

// TCP Socekt
const tcpNetSocket = tcpNet.createServer((tcpSocket) => {
  console.log(`TCP Socket : ${tcpSocket.address().address}`);
  tcpSocket.write('TCP NET CONNECT !'); // SEND Client
  tcpSocket.on('data', (tcpData) => console.log(data));
  tcpSocket.on('timeout', () => console.log('Time Out'));
  tcpSocket.on('end', () => console.log('TCP END'));
  tcpSocket.on('close', () => console.log('Close TCP'));
});

tcpNetSocket.on('connection', (data) => console.log(data));
tcpNetSocket.on('error', (err) => console.log(err));
tcpNetSocket.listen(4000,() => console.log("Tcp Socket Server On : Port 4000"))

console.log(tcpNet.isIP('127.0.0.1'));
console.log(tcpNet.isIPv4('127.0.0.1'));
console.log(tcpNet.isIPv6('127.0.0.1'));

// Modbus Client
const modBusIp = '127.0.0.1'; //LocalHost
const port = 8502;
const modPort = 8000;
const gy = '255.255.255.0';
ModbusRTUtcpClient.connectTCP(modBusIp, { port: modPort });
ModbusRTUtcpClient.setID(1);
console.log(`Modbus is OPEN ? ${ModbusRTUtcpClient.isOpen}`);

setTimeout(function(){
  ModbusRTUtcpClient.readHoldingRegisters(0, 10, function(err, data) {
    // var d = data;
    // console.log(d);
    console.log(data);
    // console.log(decodeURI(d))
  });
  ModbusRTUtcpClient.readDeviceIdentification(1,0,function(err, data){
    console.log(data);
    // console.log(data.data['0']);
    // console.log(data.data['1']);
    // console.log(data.data['2']);
    // console.log(data.data['5']);
    // console.log(data.data['151']);
    // console.log(data.data['171']);
  });

  ModbusRTUtcpClient.readCoils(1,100,function(err, data){
    console.log(data);
    // console.log(data.buffer.toString('utf8'));
    // console.log(data.buffer.toString('hex'));
  });
}, 1000);
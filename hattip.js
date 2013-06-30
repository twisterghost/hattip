var express = require("express");
var argv = require("optimist").argv;
var app = express();
var logger = require("winston");
var server = require("http").createServer(app);
var io = require('socket.io').listen(server);
var fs = require("fs");
var _ = require("underscore");

logger.info("Welcome to Hat Tip!");

// Set up and defaults.

var port = varDefault(argv.port, process.env.PORT || 4488);
var topic = varDefault(argv.topic, "Hat Tip");
var postMemory = [];
var urlPattern = /(http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/;

logger.info("Using port: " + port);


// Set app to use jade.
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');

// Set static directory.
app.use(express.static(__dirname + '/public'));

// Handle favicon requests.
app.get("/favicon.ico", function(req, res) {
  res.send("nope", 404);
});

// Default to index.
app.get("/", function(req, res) {
  res.render("index", {topic: topic});
});

// Start listening.
server.listen(port);

loadData();

// Begin socket handling.
io.sockets.on('connection', function (socket) {

  socket.emit("postMemory", {posts: postMemory});

  socket.on('my other event', function (data) {
    console.log(data);
  });

  socket.on("connect", function(data) {
    console.log("Connected: " + data.username);
    socket.set("username", fixName(data.username.trim()), function() {
      socket.emit("connect-ack");
    });
  });

  socket.on("send", function(data) {
    console.log("Message sent by " + data.username);
    parseMessage(data, socket);
  })
});


function parseMessage(data, socket) {

  var post = {
    type: "",
    content: "",
    author: data.username,
    time: new Date().getTime() / 1000
  }

  if (data.message.trim()[0] == "!") {

    // This is a comment.
    // First, try to figure out if it is about an older link.

    var firstSegment = data.message.trim().split(" ")[0];
    if (firstSegment.match(/\!\-[0-9]+/)) {
      var lookback = firstSegment.match(/[0-9]+/)[0];
      data.message = data.message.replace(/\!\-[0-9]+/, "!");
    }

    post.lookback = lookback;
    post.type = "comment";
    post.content = _.escape(data.message.trim().substring(1).trim());
    postMemory.push(post);

  } else if (data.message.trim()[0] == "^") {

    // This is a name change.
    post.type = "namechange";
    var newName = fixName(data.message.trim().substring(1));
    post.author += " -> " + newName;
    post.content = data.username + " has changed their name to " + newName;
    postMemory.push(post);

    socket.emit("namechange", {newName: newName});

  } else if (data.message.trim()[0] == "#") {
    //setEnterAction("Search for '" + data.message.trim().substring(1).trim() + "'");
  } else if (data.message.trim().match(urlPattern) !== null) {

    // This is a link.
    post.type = "link";
    post.content = data.message.trim();
    postMemory.push(post);

  } else {
    socket.emit("unknown");
    return;
  }

  socket.emit("new", post);
  socket.broadcast.emit("new", post);
  saveData();
}

// Helper functions.
function varDefault(variable, defaultValue) {
  return typeof(variable) !== 'undefined' ? variable : defaultValue;
}

function saveData() {
  fs.writeFileSync("memory", JSON.stringify(postMemory));
}

function loadData() {
  if (fs.existsSync("memory")) {
    postMemory = JSON.parse(fs.readFileSync("memory"));
  }
}

function sanitize(string) {
  return _.escape(string.trim());
}

function fixName(string) {
  string = sanitize(string);
  return string.substring(0, 30);
}
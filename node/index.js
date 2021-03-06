"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

module.exports = slackin;

// es6 runtime requirements
require("babel/polyfill");

// their code

var express = _interopRequire(require("express"));

var sockets = _interopRequire(require("socket.io"));

var json = require("body-parser").json;

var http = require("http").Server;

var remail = _interopRequire(require("email-regex"));

var dom = _interopRequire(require("vd"));

// our code

var Slack = _interopRequire(require("./slack"));

var invite = _interopRequire(require("./slack-invite"));

var badge = _interopRequire(require("./badge"));

var splash = _interopRequire(require("./splash"));

var iframe = _interopRequire(require("./iframe"));

var log = _interopRequire(require("./log"));

function slackin(_ref) {
  var token = _ref.token;
  var _ref$interval = _ref.interval;
  var interval = _ref$interval === undefined ? 5000 : _ref$interval;
  var org = _ref.org;
  var css = _ref.css;
  var channels = _ref.channels;
  var _ref$silent = _ref.silent;
  var silent = _ref$silent === undefined ? false // jshint ignore:line
  : _ref$silent;

  // must haves
  if (!token) throw new Error("Must provide a `token`.");
  if (!org) throw new Error("Must provide an `org`.");

  if (channels) {
    // convert to an array
    channels = channels.split(",").map(function (channel) {
      // sanitize channel name
      if ("#" == channel[0]) return channel.substr(1);
      return channel;
    });
  }

  // setup app
  var app = express();
  var srv = http(app);
  var assets = __dirname + "/assets";

  // fetch data
  var slack = new Slack({ token: token, interval: interval, org: org });

  // capture stats
  log(slack, silent);

  // middleware for waiting for slack
  app.use(function (req, res, next) {
    if (slack.ready) return next();
    slack.once("ready", next);
  });

  // splash page
  app.get("/", function (req, res) {
    var _slack$org = slack.org;
    var name = _slack$org.name;
    var logo = _slack$org.logo;
    var _slack$users = slack.users;
    var active = _slack$users.active;
    var total = _slack$users.total;

    if (!name) return res.send(404);
    var page = dom("html", dom("head", dom("title", "Join ", name, " on Slack!"), dom("meta name=viewport content=\"width=device-width,initial-scale=1.0,minimum-scale=1.0,user-scalable=no\""), dom("link rel=\"shortcut icon\" href=https://slack.global.ssl.fastly.net/272a/img/icons/favicon-32.png"), css && dom("link rel=stylesheet", { href: css })), splash({ css: css, name: name, org: org, logo: logo, channels: channels, active: active, total: total }));
    res.type("html");
    res.send(page.toHTML());
  });

  // static files
  app.use("/assets", express["static"](assets));

  // invite endpoint
  app.post("/invite", json(), function (req, res, next) {
    var chanId = undefined;
    if (channels) {
      var channel = req.body.channel;
      if (!channels.includes(channel)) {
        return res.status(400).json({ msg: "Not a permitted channel" });
      }
      chanId = slack.getChannelId(channel);
      if (!chanId) {
        return res.status(400).json({ msg: "Channel not found \"" + channel + "\"" });
      }
    }

    var email = req.body.email;

    if (!email) {
      return res.status(400).json({ msg: "No email provided" });
    }

    if (!remail().test(email)) {
      return res.status(400).json({ msg: "Invalid email" });
    }

    invite({ token: token, org: org, email: email, channel: chanId }, function (err) {
      if (err) {
        return res.status(400).json({ msg: err.message });
      }

      res.status(200).json({ msg: "success" });
    });
  });

  // iframe
  app.get("/iframe", function (req, res) {
    var large = ("large" in req.query);
    var _slack$users = slack.users;
    var active = _slack$users.active;
    var total = _slack$users.total;

    res.type("html");
    res.send(iframe({ active: active, total: total, large: large }).toHTML());
  });

  app.get("/iframe/dialog", function (req, res) {
    var name = slack.org.name;
    var _slack$users = slack.users;
    var active = _slack$users.active;
    var total = _slack$users.total;

    if (!name) return res.send(404);
    var dom = splash({ name: name, channels: channels, active: active, total: total, iframe: true });
    res.type("html");
    res.send(dom.toHTML());
  });

  // badge js
  app.use("/slackin.js", express["static"](assets + "/badge.js"));

  // badge rendering
  app.get("/badge.svg", function (req, res) {
    res.type("svg");
    res.set("Cache-Control", "max-age=0, no-cache");
    res.set("Pragma", "no-cache");
    res.send(badge(slack.users).toHTML());
  });

  // realtime
  sockets(srv).on("connection", function (socket) {
    socket.emit("data", slack.users);
    var change = function (key, val) {
      return socket.emit(key, val);
    };
    slack.on("change", change);
    socket.on("disconnect", function () {
      slack.removeListener("change", change);
    });
  });

  return srv;
}

// jshint ignore:line


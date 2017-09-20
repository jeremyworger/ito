/**
 * ito.js
 * 
 * Copyright 2017 KDDI Research, Inc.
 * 
 * This software is released under the MIT License.
 * http://opensource.org/licenses/mit-license.php
 */

'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

(function (self, isBrowser) {
  if (!isBrowser) {
    // node-localstorage
    var LocalStorage = require('node-localstorage').LocalStorage;
    self.localStorage = new LocalStorage('./localStorage');
  }

  /*
   * Simple fetch polyfill
   */
  if (isBrowser && !window.fetch) {
    window.fetch = function (url, opt) {
      var xhr = new XMLHttpRequest();
      opt = opt || {};
      return new Promise(function (resolve, reject) {
        xhr.open(opt.method || 'GET', url);
        if (opt.headers) {
          var h = opt.headers;
          Object.keys(h).forEach(function (i) {
            xhr.setRequestHeader(i, h[i]);
          });
        }
        xhr.withCredentials = opt.mode && opt.mode !== 'omit';
        xhr.responseType = 'arraybuffer';
        xhr.onerror = reject;
        xhr.onload = function () {
          var toText = function toText(a) {
            return new Uint8Array(a).reduce(function (s, c) {
              return s + String.fromCharCode(c);
            }, '');
          };
          resolve({
            text: function text() {
              return Promise.resolve(toText(xhr.response));
            },
            json: function json() {
              return new Promise(function (r) {
                return JSON.parse(toText(xhr.response));
              });
            },
            arrayBuffer: function arrayBuffer() {
              return Promise.resolve(xhr.response);
            },
            blob: function blob() {
              return Promise.resolve(new Blob([xhr.response]));
            }
          });
        };
        xhr.send(opt.body || null);
      });
    };
  }

  /*
   * Global variables
   */
  var provider = null;
  var state = 'uninitialized';
  var profile = {};
  var friends = {};
  var limitToFriends = true;
  Object.defineProperties(profile, {
    userName: {
      get: function get() {
        var user = provider.getUser();
        return user ? user.userName : null;
      },
      enumerable: true
    },
    email: {
      get: function get() {
        var user = provider.getUser();
        return user ? user.email : null;
      },
      enumerable: true
    },
    isAnonymous: {
      get: function get() {
        var user = provider.getUser();
        return user ? user.isAnonymous : null;
      },
      enumerable: true
    },
    uid: {
      get: function get() {
        var user = provider.getUser();
        return user ? user.uid : null;
      },
      enumerable: true
    }
  });

  var useTrack = 'ontrack' in RTCPeerConnection.prototype;
  var useTransceiver = !!self.RTCRtpTransceiver;
  var endpoints = {};
  var pcOpt = {
    iceServers: [{
      urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302', 'stun:stun4.l.google.com:19302']
    }]
  };

  var epOpt = {};

  var scopes = {};
  var observers = {};

  /*
   * ItoProvider base class
   */
  self.ItoProvider = function () {
    function ItoProvider(parent) {
      _classCallCheck(this, ItoProvider);

      this.signIn = {};
      this.parent = parent;
      Object.defineProperty(this, 'parent', { enumerable: false });
    }

    /*
     * Client: Login
     */


    _createClass(ItoProvider, [{
      key: 'onStateChange',
      value: function onStateChange(s) {
        if (state !== s) {
          state = s;
          this.parent.emit(new ItoStateChangeEvent(s));
        }
      }
    }, {
      key: 'onOnline',
      value: function onOnline(b) {
        setTimeout(reconnectAll, 500);
        this.onStateChange(b ? 'online' : 'offline');
      }
    }, {
      key: 'onDisconnect',
      value: function onDisconnect() {
        if (state !== 'uninitialized') this.onStateChange('disconnected');
      }

      /*
       * Client: User Accounts and Status
       */

    }, {
      key: 'onRequest',
      value: function onRequest(key, profile, usePasscode, options) {
        this.parent.emit(new ItoRequestEvent(key, profile, usePasscode, options));
      }
    }, {
      key: 'onAccept',
      value: function onAccept(key, profile) {
        this.parent.emit(new ItoAcceptEvent(key, profile));
      }
    }, {
      key: 'onReject',
      value: function onReject(key) {
        this.parent.emit(new ItoRejectEvent(key));
      }
    }, {
      key: 'onAddFriend',
      value: function onAddFriend(key, uid, friend) {
        friends[uid] = friend;
        this.parent.emit(new ItoAddFriendEvent('add', key, uid, Object.assign(friend)));
      }
    }, {
      key: 'onUpdateFriend',
      value: function onUpdateFriend(uid, friend) {
        if (friends[uid] instanceof Object) {
          if (Object.keys(friend).reduce(function (a, b) {
            var f = b in friends[uid] && friends[uid][b] !== friend[b];
            friends[uid][b] = friend[b];
            return a || f;
          }, false)) this.parent.emit(new ItoFriendEvent('update', uid, Object.assign(friends[uid])));
          if (friends[uid].status === 'offline') setTimeout(onFriendOffline.bind(this, uid), 500);
        }
      }
    }, {
      key: 'onRemoveFriend',
      value: function onRemoveFriend(uid) {
        if (friends[uid] instanceof Object) {
          var f = friends[uid];
          delete friends[uid];
          delete endpoints[uid];
          this.parent.emit(new ItoFriendEvent('remove', uid, f));
          onFriendOffline(uid);
        }
      }

      /*
       * Client: Messages
       */

    }, {
      key: 'onMessage',
      value: function onMessage(uid, msg) {
        this.parent.emit(new ItoMessageEvent(uid, msg));
      }
    }, {
      key: 'onMessageAck',
      value: function onMessageAck(uid, key) {
        this.parent.emit(new ItoMessageAckEvent(uid, key));
      }

      /*
       * Client: notifications
       */

    }, {
      key: 'onNotification',
      value: function onNotification(data) {
        this.parent.emit(new ItoNotificationEvent(data));
      }

      /*
       * Client: WebRTC Signaling
       */

    }, {
      key: 'onInvite',
      value: function onInvite(options) {
        var uid = options.uid;
        var cid = options.cid;
        if (!MediaStream || !RTCPeerConnection) provider.sendReject(uid, cid, 'incompatible');else if (endpoints[uid] && endpoints[uid][cid]) provider.sendReject(uid, cid, 'unexpected_id');else {
          if (!endpoints[uid]) endpoints[uid] = {};
          var e = new ItoEndpoint(uid, cid, false, options.dataChannel);
          e.setReceiveTrack(options);
          endpoints[uid][cid] = e;
          this.parent.emit(new ItoInviteEvent(e));
        }
      }
    }, {
      key: 'onReconnect',
      value: function onReconnect(options) {
        var uid = options.uid;
        var cid = options.cid;
        if (endpoints[uid] && endpoints[uid][cid]) {
          var e = endpoints[uid][cid];
          var stream = e.inputStream;
          var opt = {
            audio: !!stream && stream.getAudioTracks().length > 0,
            video: !!stream && stream.getVideoTracks().length > 0
          };
          e.setReceiveTrack(options);
          e.isOfferer = false;
          provider.sendAccept(uid, cid, opt).then(function () {
            onEndpointStateChange(uid, cid, 'connecting');
            createPeerConnection(e);
          });
        }
      }
    }, {
      key: 'onAcceptInvite',
      value: function onAcceptInvite(options) {
        var uid = options.uid;
        var cid = options.cid;
        if (endpoints[uid] && endpoints[uid][cid]) {
          var e = endpoints[uid][cid];
          e.setReceiveTrack(options);
          createPeerConnection(e);
        }
      }
    }, {
      key: 'onClose',
      value: function onClose(options) {
        var uid = options.uid;
        var cid = options.cid;
        if (endpoints[uid] && endpoints[uid][cid]) {
          var e = endpoints[uid][cid];
          var opt = epOpt[uid][cid];
          var pc = e.peerConnection;
          if (pc) pc.close();
          var isRejected = e.isOfferer && e.state === 'inviting';
          onEndpointStateChange(uid, cid, 'closed');
          delete endpoints[uid][cid];
          delete epOpt[uid][cid];
          var reason = options.reason || 'terminated';
          if (isRejected) e.emit(new ItoEndpointRejectEvent(e, reason));else e.emit(new ItoEndpointEvent('close', e));
        }
      }
    }, {
      key: 'onSignaling',
      value: function onSignaling(options) {
        var uid = options.uid;
        var cid = options.cid;
        if (endpoints[uid] && endpoints[uid][cid]) {
          var e = endpoints[uid][cid];
          switch (options.signalingType) {
            case 'sdp':
              setRemoteSdp(e, options.data);
              break;
            case 'iceCandidate':
              addIceCandidate(e, options.data);
              break;
          }
        }
      }

      /*
       * Client: Simple Data Store Sharing
       */

    }, {
      key: 'onElementAdd',
      value: function onElementAdd(uid, name, key, data) {
        if (!(uid in observers) || !(name in observers[uid])) return;
        var observer = observers[uid][name];
        observer.emit(new ItoDataObserverElementEvent(observer, 'add', key, data));
      }
    }, {
      key: 'onElementUpdate',
      value: function onElementUpdate(uid, name, key, data) {
        if (!(uid in observers) || !(name in observers[uid])) return;
        var observer = observers[uid][name];
        observer.emit(new ItoDataObserverElementEvent(observer, 'update', key, data));
      }
    }, {
      key: 'onElementRemove',
      value: function onElementRemove(uid, name, key) {
        if (!(uid in observers) || !(name in observers[uid])) return;
        var observer = observers[uid][name];
        observer.emit(new ItoDataObserverElementEvent(observer, 'remove', key));
      }
    }]);

    return ItoProvider;
  }();

  /*
   * ItoEmitter base class
   */

  var ItoEmitter = function () {
    function ItoEmitter() {
      _classCallCheck(this, ItoEmitter);

      this._ = {};
    }

    _createClass(ItoEmitter, [{
      key: 'on',
      value: function on(type, func) {
        if (!this._[type]) this._[type] = [];
        if (this._[type].indexOf(func) < 0) this._[type].push(func);
      }
    }, {
      key: 'emit',
      value: function emit(event) {
        if (!(event instanceof ItoEvent)) return;
        if (this._[event.type]) {
          this._[event.type].forEach(function (func) {
            func.call(null, event);
          });
        }
      }
    }, {
      key: 'removeListener',
      value: function removeListener(type, func) {
        if (this._[type]) this._[type].splice(this._[type].indexOf(func), 1);
      }
    }, {
      key: 'removeAllListeners',
      value: function removeAllListeners(type) {
        delete this._[type];
      }
    }]);

    return ItoEmitter;
  }();

  /*
   * ItoEvent and descendant classes
   */


  var ItoEvent = function ItoEvent(type) {
    _classCallCheck(this, ItoEvent);

    this.type = type;
    this.target = self.ito;
  };

  var ItoStateChangeEvent = function (_ItoEvent) {
    _inherits(ItoStateChangeEvent, _ItoEvent);

    function ItoStateChangeEvent(state) {
      _classCallCheck(this, ItoStateChangeEvent);

      var _this = _possibleConstructorReturn(this, (ItoStateChangeEvent.__proto__ || Object.getPrototypeOf(ItoStateChangeEvent)).call(this, 'statechange'));

      _this.state = state;
      return _this;
    }

    return ItoStateChangeEvent;
  }(ItoEvent);

  var ItoRequestEvent = function (_ItoEvent2) {
    _inherits(ItoRequestEvent, _ItoEvent2);

    function ItoRequestEvent(key, profile, usePasscode, options) {
      _classCallCheck(this, ItoRequestEvent);

      var _this2 = _possibleConstructorReturn(this, (ItoRequestEvent.__proto__ || Object.getPrototypeOf(ItoRequestEvent)).call(this, 'request'));

      _this2.key = key;
      _this2.profile = profile;
      _this2.status = 'pending';
      _this2.usePasscode = usePasscode;
      _this2.options = options;
      return _this2;
    }

    _createClass(ItoRequestEvent, [{
      key: 'accept',
      value: function accept() {
        var key = this.key;
        var m = this.profile.email;
        var uid = this.profile.uid;
        var u = this.usePasscode;
        if (this.status !== 'pending') return Promise.reject(new Error('already ' + this.status));
        this.status = 'accepted';
        return new Promise(function (resolve, reject) {
          provider.dropRequest(key, u).then(function () {
            return provider.acceptRequest(key, m, uid, u);
          }).then(function () {
            resolve();
          });
        });
      }
    }, {
      key: 'reject',
      value: function reject() {
        var key = this.key;
        var m = this.profile.email;
        var uid = this.profile.uid;
        var u = this.usePasscode;
        if (this.status !== 'pending') return Promise.reject(new Error('already ' + this.status));
        this.status = 'rejected';
        return new Promise(function (resolve, reject) {
          provider.dropRequest(key, u).then(function () {
            return provider.rejectRequest(key, m, uid, u);
          });
        });
      }
    }]);

    return ItoRequestEvent;
  }(ItoEvent);

  var ItoAcceptEvent = function (_ItoEvent3) {
    _inherits(ItoAcceptEvent, _ItoEvent3);

    function ItoAcceptEvent(key, profile) {
      _classCallCheck(this, ItoAcceptEvent);

      var _this3 = _possibleConstructorReturn(this, (ItoAcceptEvent.__proto__ || Object.getPrototypeOf(ItoAcceptEvent)).call(this, 'accept'));

      _this3.key = key;
      _this3.profile = profile;
      return _this3;
    }

    return ItoAcceptEvent;
  }(ItoEvent);

  var ItoRejectEvent = function (_ItoEvent4) {
    _inherits(ItoRejectEvent, _ItoEvent4);

    function ItoRejectEvent(key) {
      _classCallCheck(this, ItoRejectEvent);

      var _this4 = _possibleConstructorReturn(this, (ItoRejectEvent.__proto__ || Object.getPrototypeOf(ItoRejectEvent)).call(this, 'reject'));

      _this4.key = key;
      return _this4;
    }

    return ItoRejectEvent;
  }(ItoEvent);

  var ItoFriendEvent = function (_ItoEvent5) {
    _inherits(ItoFriendEvent, _ItoEvent5);

    function ItoFriendEvent(type, uid, profile) {
      _classCallCheck(this, ItoFriendEvent);

      var _this5 = _possibleConstructorReturn(this, (ItoFriendEvent.__proto__ || Object.getPrototypeOf(ItoFriendEvent)).call(this, type + 'friend'));

      _this5.uid = uid;
      _this5.profile = profile;
      return _this5;
    }

    return ItoFriendEvent;
  }(ItoEvent);

  var ItoAddFriendEvent = function (_ItoFriendEvent) {
    _inherits(ItoAddFriendEvent, _ItoFriendEvent);

    function ItoAddFriendEvent(type, key, uid, profile) {
      _classCallCheck(this, ItoAddFriendEvent);

      var _this6 = _possibleConstructorReturn(this, (ItoAddFriendEvent.__proto__ || Object.getPrototypeOf(ItoAddFriendEvent)).call(this, type, uid, profile));

      _this6.key = key;
      return _this6;
    }

    return ItoAddFriendEvent;
  }(ItoFriendEvent);

  var ItoMessageEvent = function (_ItoEvent6) {
    _inherits(ItoMessageEvent, _ItoEvent6);

    function ItoMessageEvent(uid, msg) {
      _classCallCheck(this, ItoMessageEvent);

      var _this7 = _possibleConstructorReturn(this, (ItoMessageEvent.__proto__ || Object.getPrototypeOf(ItoMessageEvent)).call(this, 'message'));

      _this7.uid = uid;
      _this7.data = msg;
      return _this7;
    }

    return ItoMessageEvent;
  }(ItoEvent);

  var ItoMessageAckEvent = function (_ItoEvent7) {
    _inherits(ItoMessageAckEvent, _ItoEvent7);

    function ItoMessageAckEvent(uid, key) {
      _classCallCheck(this, ItoMessageAckEvent);

      var _this8 = _possibleConstructorReturn(this, (ItoMessageAckEvent.__proto__ || Object.getPrototypeOf(ItoMessageAckEvent)).call(this, 'messageack'));

      _this8.uid = uid;
      _this8.messageKey = key;
      return _this8;
    }

    return ItoMessageAckEvent;
  }(ItoEvent);

  var ItoInviteEvent = function (_ItoEvent8) {
    _inherits(ItoInviteEvent, _ItoEvent8);

    function ItoInviteEvent(endpoint) {
      _classCallCheck(this, ItoInviteEvent);

      var _this9 = _possibleConstructorReturn(this, (ItoInviteEvent.__proto__ || Object.getPrototypeOf(ItoInviteEvent)).call(this, 'invite'));

      _this9.endpoint = endpoint;
      return _this9;
    }

    return ItoInviteEvent;
  }(ItoEvent);

  var ItoNotificationEvent = function (_ItoEvent9) {
    _inherits(ItoNotificationEvent, _ItoEvent9);

    function ItoNotificationEvent(data) {
      _classCallCheck(this, ItoNotificationEvent);

      var _this10 = _possibleConstructorReturn(this, (ItoNotificationEvent.__proto__ || Object.getPrototypeOf(ItoNotificationEvent)).call(this, 'notification'));

      _this10.data = data; // an array of notifications (timestamp, data)
      return _this10;
    }

    return ItoNotificationEvent;
  }(ItoEvent);

  /*
   * Main Object
   */


  var Ito = function (_ItoEmitter) {
    _inherits(Ito, _ItoEmitter);

    function Ito() {
      _classCallCheck(this, Ito);

      var _this11 = _possibleConstructorReturn(this, (Ito.__proto__ || Object.getPrototypeOf(Ito)).call(this));

      _this11.profile = {};
      Object.defineProperties(_this11, {
        state: { get: function get() {
            return state;
          } },
        profile: { get: function get() {
            return profile;
          } },
        passcode: { get: function get() {
            return provider.getPasscode();
          } },
        peerConnectionOptions: {
          get: function get() {
            return pcOpt;
          },
          set: function set(opt) {
            if (opt instanceof Object) pcOpt = Object.assign(pcOpt);
          }
        }
      });
      return _this11;
    }

    /*
     * Client: Login
     */


    _createClass(Ito, [{
      key: 'init',
      value: function init(p, arg, url) {
        return new Promise(function (resolve, reject) {
          if (state !== 'uninitialized') resolve();else if (!(p instanceof ItoProvider)) reject(new Error('Incorrect Provider'));else {
            provider = p;
            limitToFriends = !!arg.limitToFriends;

            // load WebRTC adapter (in the case of web browsers, for now)
            if (isBrowser) {
              var adapter = document.createElement('script');
              adapter.src = 'https://webrtc.github.io/adapter/adapter-latest.js';
              adapter.onload = function () {
                p.load(url).then(function () {
                  return p.init(arg);
                }).then(function (b) {
                  provider.onOnline(b);
                  resolve(p.getUser());
                }, function (error) {
                  if (error === true) {
                    provider.onOnline(false);
                    reject('duplicated sign-in');
                  } else reject(error);
                });
              };
              var h = document.querySelector('head');
              h.insertBefore(adapter, h.firstChild);
            }
          }
        });
      }
    }, {
      key: 'signIn',
      value: function signIn(p, id, pass) {
        return new Promise(function (resolve, reject) {
          var user = provider.getUser();
          switch (state) {
            case 'uninitialized':
              reject(new Error('not initialized'));
              break;
            case 'online':
              resolve(provider.getUser());
              break;
            case 'disconnected':
              if (user) resolve(user);else reject(new Error('network offline'));
              break;
            case 'offline':
              if (provider.signIn[p]) provider.signIn[p](id, pass).then(function (u) {
                state = 'online';
                resolve(u);
              }, function (error) {
                reject(error === true ? new Error('duplicated sign-in') : error);
              });else reject(new Error('auth provider is not indicated or wrong'));
              break;
          }
        });
      }
    }, {
      key: 'updateUserName',
      value: function updateUserName(name) {
        return provider.updateUserName(name);
      }
    }, {
      key: 'signOut',
      value: function signOut() {
        var _this12 = this;

        return !profile.uid ? Promise.resolve() : new Promise(function (resolve, reject) {
          Object.keys(profile.isAnonymous ? friends : {}).reduce(function (a, b) {
            return a.then(provider.sendRemove.bind(_this12, b, friends[b].email));
          }, Promise.resolve()).then(function () {
            provider.signOut().then(function () {
              resolve();
            }, function (error) {
              reject(error);
            });
          });
        });
      }

      /*
       * Client: User Accounts and Status
       */

    }, {
      key: 'request',
      value: function request(m, opt) {
        if (!provider.getUser()) return Promise.reject(new Error('not signed in'));
        for (var i in friends) {
          if (friends[i].email === m) return Promise.reject(new Error('already registered as a friend: ' + m + ' (uid: ' + i + ')'));
        }
        return provider.sendRequest(m, opt);
      }
    }, {
      key: 'setPasscode',
      value: function setPasscode(pass) {
        return provider.setPasscode(pass);
      }
    }, {
      key: 'remove',
      value: function remove(uid) {
        return friends[uid] ? provider.sendRemove(uid, friends[uid].email) : Promise.reject(new Error('not registered as a friend: ' + uid));
      }

      /*
       * Client: Messages
       */

    }, {
      key: 'send',
      value: function send(uid, msg) {
        if (!friends[uid] && limitToFriends) return Promise.reject(new Error('not registered as a friend: ' + uid));else return provider.sendMessage(uid, msg);
      }

      /*
       * Client: notifications
       */

    }, {
      key: 'sendNotification',
      value: function sendNotification(msg) {
        return provider.sendNotification(msg);
      }

      /*
       * Client: WebRTC Signaling
       */

    }, {
      key: 'invite',
      value: function invite(uid, stream, opt) {
        opt = opt || {};
        if (!(stream instanceof MediaStream) && stream !== null) return Promise.reject(new Error('the second argument is neigher an instance of MediaStream nor null.'));
        if (!(opt instanceof Object)) return Promise.reject(new Error('the third argument is not an appropriate option.'));
        return new Promise(function (resolve, reject) {
          if (!MediaStream || !RTCPeerConnection) reject(new Error('WebRTC is not available on this browser'));else if (!friends[uid] && limitToFriends) reject(new Error('not registered as a friend: ' + uid));
          // else if(friends[uid].status !== 'online')
          //   reject(new Error('not online: ' + uid));
          else if (MediaStream && stream && !(stream instanceof MediaStream)) reject(new Error('the second parameter (\'stream\') is invalid'));else {
              var options = {
                audio: !!stream && stream.getAudioTracks().length > 0,
                video: !!stream && stream.getVideoTracks().length > 0,
                dataChannel: opt && !!opt.dataChannel
              };
              provider.sendInvite(uid, options).then(function (cid) {
                if (!endpoints[uid]) endpoints[uid] = {};
                var e = new ItoEndpoint(uid, cid, true, options.dataChannel);
                e.inputStream = stream;
                endpoints[uid][cid] = e;
                resolve(e);
              });
            }
        });
      }
    }, {
      key: 'openDataStore',


      /*
       * Client: Simple Data Store Sharing
       */
      value: function openDataStore(name, opt) {
        var scope = 'private';
        if (opt) {
          if (typeof name !== 'string' || !name.match(/^[\w\.-]{2,32}$/)) throw new Error('data store name must be 2-32 letters of alphabet, number, underscore, period and/or minus.');else if (typeof opt.scope === 'string' && opt.scope.match(/^(public|friends|private)$/)) scope = opt.scope;else throw new Error('the "scope" option must be "public", "friends" or "private".');
        }
        if (!(typeof name === 'string') || !name.match(/^.+$/)) throw new Error('the specified data store name includes illegal letter(s).');
        return provider.openDataStore(scope, name).then(function (s) {
          return new ItoDataStore(s, name);
        });
      }
    }, {
      key: 'observeDataStore',
      value: function observeDataStore(uid, name) {
        return provider.observeDataStore(uid, name).then(function (arg) {
          if (!(arg.uid in observers)) observers[arg.uid] = {};
          var observer = new ItoDataObserver(arg.uid, arg.name);
          observers[arg.uid][arg.name] = observer;
          return observer;
        });
      }
    }]);

    return Ito;
  }(ItoEmitter);

  self.ito = new Ito();

  /*
   * Internal functions
   */

  /*
   * Client: WebRTC Signaling
   */
  function onEndpointStateChange(uid, cid, s) {
    if (!endpoints[uid] || !endpoints[uid][cid]) return;
    var e = endpoints[uid][cid];
    if (e.state !== s) {
      e.state = s;
      e.emit(new ItoEndpointStateChangeEvent(e));
    }
  }

  function onFriendOffline(uid) {
    if (friends[uid] && friends[uid].status !== 'online') {
      Object.keys(endpoints).forEach(function (cid) {
        provider.onClose({ uid: uid, cid: cid });
      });
      endpoints[uid] = {};
    }
  }

  function updateStream(e, stream) {
    var s = e.receivedStream;
    if (!s) {
      e.receivedStream = stream;
      e.emit(new ItoEndpointAddStreamEvent(e, stream));
    } else {
      if (s === stream) return;else {
        s.getTracks().filter(function (track) {
          return stream.getTracks().indexOf(track) < 0;
        }).forEach(function (track) {
          s.removeTrack(track);
        });
        stream.getTracks().forEach(function (track) {
          s.addTrack(track);
        });
      }
    }
  }

  function onDataChannelMessage(e, event) {
    e.emit(new ItoEndpointMessageEvent(e, event.data));
  }

  function onDataChannelOpen(e) {
    var uid = e.peer;
    var cid = e.connection;
    var opt = epOpt[uid][cid];
    e.dataChannel.addEventListener('message', onDataChannelMessage.bind(this, e));
    while (opt.buffer.length > 0) {
      e.send(opt.buffer.shift());
    }
  }

  function initTracks(e, opt) {
    var pc = e.peerConnection;
    if (useTransceiver) {
      var tracks = e.inputStream ? e.inputStream.getTracks() : [];
      if (tracks.length) {
        return Promise.all(tracks.map(function (t) {
          var tr = pc.addTransceiver(t.kind);
          var isVideo = t.kind === 'video';
          var receiveTrack = isVideo ? opt.receiveVideoTrack : opt.receiveAudioTrack;
          return tr.sender.replaceTrack(t).then(function () {
            tr.receiver.track.enabled = receiveTrack;
            tr.setDirection(receiveTrack ? 'sendrecv' : 'sendonly');
            e.transceivers[isVideo ? 'video' : 'audio'].push(tr);
          });
        }));
      } else {
        var tv = pc.addTransceiver('video');
        tv.receiver.track.enabled = opt.receiveVideoTrack;
        tv.setDirection(opt.receiveVideoTrack ? 'recvonly' : 'inactive');
        e.transceivers.video.push(tv);
        var ta = pc.addTransceiver('audio');
        ta.receiver.track.enabled = opt.receiveAudioTrack;
        ta.setDirection(opt.receiveAudioTrack ? 'recvonly' : 'inactive');
        e.transceivers.audio.push(ta);
      }
    } else if (e.inputStream) {
      if (useTrack) {
        e.inputStream.getTracks().forEach(function (track) {
          pc.addTrack(track, e.inputStream);
        });
      } else pc.addStream(e.inputStream);
    }
    return Promise.resolve();
  }

  function createPeerConnection(e) {
    var uid = e.peer;
    var cid = e.connection;
    var opt = epOpt[uid][cid];
    if (e.peerConnection) opt.peerConnection = e.peerConnection;
    var pc = new RTCPeerConnection(pcOpt);
    onEndpointStateChange(uid, cid, 'connecting');
    e.peerConnection = pc;
    if (useTransceiver) {
      e.transceivers = {
        video: [],
        audio: []
      };
    }
    pc.addEventListener('icecandidate', onIceCandidate.bind(pc, e));
    if (useTrack) pc.addEventListener('track', function (event) {
      updateStream(e, event.streams[0]);
    });else pc.addEventListener('addstream', function (event) {
      updateStream(e, event.stream);
    });
    pc.addEventListener('iceconnectionstatechange', function () {
      if (e.state === 'connecting' && pc.iceConnectionState.match(/^(connected|completed)$/)) {
        onEndpointStateChange(uid, cid, 'open');
        if (!opt.peerConnection) {
          e.emit(new ItoEndpointEvent('open', e));
        } else {
          opt.peerConnection.close();
          delete opt.peerConnection;
        }

        pc.addEventListener('negotiationneeded', function (event) {
          var f = opt.negotiationReady;
          opt.negotiationReady = false;
          opt.negotiationNeeded = true;
          if (f) sendReconnect(e);
        });
      }
    });
    if (opt.useDataChannel) {
      if (e.isOfferer) {
        e.dataChannel = pc.createDataChannel('ItoEndpoint');
        e.dataChannel.addEventListener('open', onDataChannelOpen.bind(this, e));
      } else pc.addEventListener('datachannel', function (event) {
        e.dataChannel = event.channel;
        onDataChannelOpen(e);
        e.emit(new ItoEndpointEvent('datachannel'));
      });
    }
    initTracks(e, opt).then(function () {
      if (e.isOfferer) sendOffer(e);
    });
  }

  function createSdpOptions(e) {
    var opt = epOpt[e.peer][e.connection];
    var sdpOpt = {};
    if (opt && !useTransceiver) {
      sdpOpt = {
        offerToReceiveAudio: opt.receiveAudioTrack,
        offerToReceiveVideo: opt.receiveVideoTrack
      };
    }
    return sdpOpt;
  }

  function sendOffer(e) {
    var pc = e.peerConnection;
    pc.createOffer(createSdpOptions(e)).then(onSdp.bind(pc, e));
  }

  function reconnectAll() {
    Object.keys(endpoints).forEach(function (uid) {
      Object.keys(endpoints[uid]).forEach(function (cid) {
        var e = endpoints[uid][cid];
        if (e.isOfferer && e.peerConnection && e.peerConnection.iceConnectionState.match(/^(disconnected|failed)$/)) sendReconnect(e);
      });
    });
  }

  function sendReconnect(e) {
    return new Promise(function (resolve, reject) {
      var uid = e.peer;
      var cid = e.connection;
      var stream = e.inputStream;
      var opt = epOpt[uid][cid];
      var options = {
        audio: !!stream && stream.getAudioTracks().length > 0,
        video: !!stream && stream.getVideoTracks().length > 0,
        dataChannel: opt.dataChannel
      };
      e.isOfferer = true;
      provider.sendReconnect(uid, cid, options).then(function () {
        resolve();
      });
    });
  }

  function onSdp(e, sdp) {
    this.setLocalDescription(sdp).then(function () {
      provider.sendSignaling(e.peer, e.connection, 'sdp', sdp);
    });
  }

  function onIceCandidate(e, event) {
    if (event.candidate) provider.sendSignaling(e.peer, e.connection, 'iceCandidate', event.candidate);
  }

  function setRemoteSdp(e, data) {
    var pc = e.peerConnection;
    var sdp = new RTCSessionDescription(JSON.parse(data));
    pc.setRemoteDescription(sdp).then(function () {
      if (sdp.type === 'offer') pc.createAnswer(createSdpOptions(e)).then(onSdp.bind(pc, e));
    }, function (error) {
      console.log(error);
    });
  }

  function addIceCandidate(e, data) {
    e.peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(data)));
  }

  /*
   * Communication Endpoint
   */

  var ItoEndpointEvent = function (_ItoEvent10) {
    _inherits(ItoEndpointEvent, _ItoEvent10);

    function ItoEndpointEvent(type, endpoint) {
      _classCallCheck(this, ItoEndpointEvent);

      var _this13 = _possibleConstructorReturn(this, (ItoEndpointEvent.__proto__ || Object.getPrototypeOf(ItoEndpointEvent)).call(this, type));

      _this13.target = endpoint;
      return _this13;
    }

    return ItoEndpointEvent;
  }(ItoEvent);

  var ItoEndpointStateChangeEvent = function (_ItoEndpointEvent) {
    _inherits(ItoEndpointStateChangeEvent, _ItoEndpointEvent);

    function ItoEndpointStateChangeEvent(endpoint) {
      _classCallCheck(this, ItoEndpointStateChangeEvent);

      var _this14 = _possibleConstructorReturn(this, (ItoEndpointStateChangeEvent.__proto__ || Object.getPrototypeOf(ItoEndpointStateChangeEvent)).call(this, 'statechange', endpoint));

      _this14.state = endpoint.state;
      return _this14;
    }

    return ItoEndpointStateChangeEvent;
  }(ItoEndpointEvent);

  var ItoEndpointRejectEvent = function (_ItoEndpointEvent2) {
    _inherits(ItoEndpointRejectEvent, _ItoEndpointEvent2);

    function ItoEndpointRejectEvent(endpoint, reason) {
      _classCallCheck(this, ItoEndpointRejectEvent);

      var _this15 = _possibleConstructorReturn(this, (ItoEndpointRejectEvent.__proto__ || Object.getPrototypeOf(ItoEndpointRejectEvent)).call(this, 'reject', endpoint));

      _this15.reason = reason;
      return _this15;
    }

    return ItoEndpointRejectEvent;
  }(ItoEndpointEvent);

  var ItoEndpointAddStreamEvent = function (_ItoEndpointEvent3) {
    _inherits(ItoEndpointAddStreamEvent, _ItoEndpointEvent3);

    function ItoEndpointAddStreamEvent(endpoint, stream) {
      _classCallCheck(this, ItoEndpointAddStreamEvent);

      var _this16 = _possibleConstructorReturn(this, (ItoEndpointAddStreamEvent.__proto__ || Object.getPrototypeOf(ItoEndpointAddStreamEvent)).call(this, 'addstream', endpoint));

      _this16.stream = stream;
      return _this16;
    }

    return ItoEndpointAddStreamEvent;
  }(ItoEndpointEvent);

  var ItoEndpointRemoveStreamEvent = function (_ItoEndpointEvent4) {
    _inherits(ItoEndpointRemoveStreamEvent, _ItoEndpointEvent4);

    function ItoEndpointRemoveStreamEvent(endpoint, stream) {
      _classCallCheck(this, ItoEndpointRemoveStreamEvent);

      var _this17 = _possibleConstructorReturn(this, (ItoEndpointRemoveStreamEvent.__proto__ || Object.getPrototypeOf(ItoEndpointRemoveStreamEvent)).call(this, 'removestream', endpoint));

      _this17.stream = stream;
      return _this17;
    }

    return ItoEndpointRemoveStreamEvent;
  }(ItoEndpointEvent);

  var ItoEndpointMessageEvent = function (_ItoEndpointEvent5) {
    _inherits(ItoEndpointMessageEvent, _ItoEndpointEvent5);

    function ItoEndpointMessageEvent(endpoint, data) {
      _classCallCheck(this, ItoEndpointMessageEvent);

      var _this18 = _possibleConstructorReturn(this, (ItoEndpointMessageEvent.__proto__ || Object.getPrototypeOf(ItoEndpointMessageEvent)).call(this, 'message', endpoint));

      _this18.data = data;
      return _this18;
    }

    return ItoEndpointMessageEvent;
  }(ItoEndpointEvent);

  var ItoEndpoint = function (_ItoEmitter2) {
    _inherits(ItoEndpoint, _ItoEmitter2);

    function ItoEndpoint(uid, cid, isOfferer, data) {
      _classCallCheck(this, ItoEndpoint);

      var _this19 = _possibleConstructorReturn(this, (ItoEndpoint.__proto__ || Object.getPrototypeOf(ItoEndpoint)).call(this));

      _this19.peer = uid;
      _this19.connection = cid;
      _this19.state = isOfferer ? 'inviting' : 'invited';
      _this19.isOfferer = isOfferer;
      _this19.peerConnection = null;
      _this19.dataChannel = null;
      _this19.inputStream = null;
      _this19.receivedStream = null;
      if (!epOpt[uid]) epOpt[uid] = {};
      epOpt[uid][cid] = {
        receiveAudioTrack: false,
        receiveVideoTrack: false,
        useDataChannel: !!data,
        buffer: []
      };
      return _this19;
    }

    _createClass(ItoEndpoint, [{
      key: 'setInputStream',
      value: function setInputStream(stream) {
        if (stream && !(stream instanceof MediaStream)) throw new Error('the first parameter is not an instance of MediaStream');
        var opt = epOpt[this.peer][this.connection];
        if (stream === this.inputStream) return;
        var oldStream = this.inputStream;
        this.inputStream = stream;
        var pc = this.peerConnection;
        if (pc && this.state === 'open') {
          opt.negotiationReady = false;
          opt.negotiationNeeded = false;
          if (useTrack) {
            if (oldStream) {
              oldStream.getTracks().filter(function (track) {
                var f = true;
                if (stream) stream.getTracks().forEach(function (t) {
                  f = f && track !== t;
                });
                return f;
              }).forEach(function (track) {
                pc.getSenders().forEach(function (sender) {
                  if (sender.track === track) pc.removeTrack(sender);
                });
              });
            }
            if (stream) {
              stream.getTracks().forEach(function (track) {
                pc.getSenders().forEach(function (sender) {
                  if (sender.track !== track) pc.addTrack(track, stream);
                });
              });
            }
          } else {
            if (oldStream) pc.removeStream(oldStream);
            if (stream) pc.addStream(stream);
          }
          opt.negotiationReady = true;
          if (opt.negotiationNeeded) sendReconnect(this);
        }
      }
    }, {
      key: 'setReceiveTrack',
      value: function setReceiveTrack(arg) {
        var opt = epOpt[this.peer][this.connection];
        opt.receiveAudioTrack = !!arg.audio;
        opt.receiveVideoTrack = !!arg.video;
      }
    }, {
      key: 'accept',
      value: function accept(stream) {
        var _this20 = this;

        return new Promise(function (resolve, reject) {
          if (_this20.isOfferer) reject(new Error('not answerer'));else if (_this20.state !== 'invited') reject(new Error('state is not \'invited\''));else if (MediaStream && stream && !(stream instanceof MediaStream)) reject(new Error('the first parameter (\'stream\') is invalid)'));else {
            var uid = _this20.peer;
            var cid = _this20.connection;
            var options = {
              audio: !!stream && stream.getAudioTracks().length > 0,
              video: !!stream && stream.getVideoTracks().length > 0
            };
            var opt = epOpt[uid][cid];
            if (!(options.audio || options.video || opt.receiveAudioTrack || opt.receiveVideoTrack || opt.useDataChannel)) throw new Error('Neither audio/video stream nor data channel is specified on both offerer and answerer');
            _this20.inputStream = stream;
            provider.sendAccept(uid, cid, options).then(function () {
              resolve();
              onEndpointStateChange(uid, cid, 'connecting');
              createPeerConnection(_this20);
            }.bind(_this20));
          }
        });
      }
    }, {
      key: 'reject',
      value: function reject() {
        var _this21 = this;

        return new Promise(function (resolve, reject) {
          if (_this21.isOfferer) reject(new Error('not answerer'));else if (_this21.state !== 'invited') reject(new Error('state is not \'invited\''));else {
            provider.sendReject(_this21.peer, _this21.connection, 'rejected').then(function () {
              resolve();
              provider.onClose({ uid: _this21.peer, cid: _this21.connection });
            });
          }
        });
      }
    }, {
      key: 'send',
      value: function send(d) {
        var c = this.dataChannel;
        if (!c) throw new Error('data channel not open');else {
          var opt = epOpt[this.peer][this.connection];
          switch (this.peerConnection.iceConnectionState) {
            case 'connected':
            case 'completed':
              c.send(d);
              break;
            case 'disconnected':
            case 'failed':
              opt.buffer.push(d);
              break;
            default:
              throw new Error('data channel not open');
          }
        }
      }
    }, {
      key: 'close',
      value: function close() {
        var _this22 = this;

        return new Promise(function (resolve, reject) {
          provider.sendClose(_this22.peer, _this22.connection).then(function () {
            resolve();
            provider.onClose({ uid: _this22.peer, cid: _this22.connection });
          });
        });
      }
    }]);

    return ItoEndpoint;
  }(ItoEmitter);

  /*
   * Client: Simple Data Store Sharing
   */

  var ItoDataStore /* extends ItoEmitter */ = function () {
    function ItoDataStore(scope, name) {
      _classCallCheck(this, ItoDataStore);

      // super();
      scopes[name] = scope;
      this.name = name;
    }

    _createClass(ItoDataStore, [{
      key: 'put',
      value: function put(key, data) {
        if (!this.scope) return Promise.reject(new Error('the data store is already reset.'));
        return provider.putDataElement(this.name, key, data, this.scope);
      }
    }, {
      key: 'get',
      value: function get(key) {
        var _this23 = this;

        if (!this.scope) return Promise.reject(new Error('the data store is already reset.'));
        return provider.getDataElement(this.name, key).then(function (result) {
          return new ItoDataElement(_this23, result.key, result.data);
        });
      }
    }, {
      key: 'getAll',
      value: function getAll() {
        var _this24 = this;

        if (!this.scope) return Promise.reject(new Error('the data store is already reset.'));
        return provider.getAllDataElements(this.name).then(function (result) {
          var r = result || [];
          return Object.keys(r).reduce(function (a, b) {
            a.push(new ItoDataElement(_this24, b, r[b]));
            return a;
          }, []);
        });
      }
    }, {
      key: 'remove',
      value: function remove(key) {
        if (!this.scope) return Promise.reject(new Error('the data store is already reset.'));
        return provider.removeDataElement(this.name, key);
      }
    }, {
      key: 'removeAll',
      value: function removeAll(key) {
        if (!this.scope) return Promise.reject(new Error('the data store is already reset.'));
        return provider.removeAllDataElements(this.name);
      }
    }, {
      key: 'reset',
      value: function reset() {
        var _this25 = this;

        if (!this.scope) return Promise.reject(new Error('the data store is already reset.'));
        return provider.removeDataStore(this.name).then(function () {
          delete scopes[_this25.name];
        });
      }
    }, {
      key: 'scope',
      get: function get() {
        return scopes[this.name];
      }
    }]);

    return ItoDataStore;
  }();

  var ItoDataElement = function ItoDataElement(dataStore, key, data) {
    _classCallCheck(this, ItoDataElement);

    this.dataStore = dataStore;
    this.key = key;
    this.data = data;
    Object.defineProperties(this, {
      dataStore: {
        enumerable: false
      }
    });
  };

  var ItoDataObserver = function (_ItoEmitter3) {
    _inherits(ItoDataObserver, _ItoEmitter3);

    function ItoDataObserver(uid, dataStore) {
      _classCallCheck(this, ItoDataObserver);

      var _this26 = _possibleConstructorReturn(this, (ItoDataObserver.__proto__ || Object.getPrototypeOf(ItoDataObserver)).call(this));

      _this26.uid = uid;
      _this26.dataStore = dataStore;
      return _this26;
    }

    _createClass(ItoDataObserver, [{
      key: 'disconnect',
      value: function disconnect() {
        provider.disconnectDataStoreObserver(this.uid, this.dataStore);
      }
    }]);

    return ItoDataObserver;
  }(ItoEmitter);

  ;

  var ItoDataObserverEvent = function (_ItoEvent11) {
    _inherits(ItoDataObserverEvent, _ItoEvent11);

    function ItoDataObserverEvent(type, observer) {
      _classCallCheck(this, ItoDataObserverEvent);

      var _this27 = _possibleConstructorReturn(this, (ItoDataObserverEvent.__proto__ || Object.getPrototypeOf(ItoDataObserverEvent)).call(this));

      _this27.type = type;
      _this27.target = observer;
      return _this27;
    }

    return ItoDataObserverEvent;
  }(ItoEvent);

  var ItoDataObserverElementEvent = function (_ItoDataObserverEvent) {
    _inherits(ItoDataObserverElementEvent, _ItoDataObserverEvent);

    function ItoDataObserverElementEvent(observer, type, key, data) {
      _classCallCheck(this, ItoDataObserverElementEvent);

      var _this28 = _possibleConstructorReturn(this, (ItoDataObserverElementEvent.__proto__ || Object.getPrototypeOf(ItoDataObserverElementEvent)).call(this, 'element' + type, observer));

      _this28.key = key;
      _this28.data = data;
      return _this28;
    }

    return ItoDataObserverElementEvent;
  }(ItoDataObserverEvent);

  if (!isBrowser) {
    self.ito.ItoProvider = self.ItoProvider;
    module.exports = {
      ito: self.ito,
      localStorage: self.localStorage
    };
  }
})((typeof window === 'undefined' ? 'undefined' : _typeof(window)) === 'object' ? window : global, (typeof window === 'undefined' ? 'undefined' : _typeof(window)) === 'object');


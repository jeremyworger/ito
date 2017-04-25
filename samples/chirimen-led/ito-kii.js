/**
 * ito-kii.js
 * 
 * Copyright 2017 KDDI Research, Inc.
 * 
 * This software is released under the MIT License.
 * http://opensource.org/licenses/mit-license.php
 */

'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

(function (self, isBrowser) {
  if (!isBrowser) {
    self.ItoProvider = self.ito.ItoProvider;
  }

  if (!self.ito) {
    throw new Error('Ito base library has not been loaded yet.');
  }

  /*
   * Global variables
   */
  var KII_LOGIN_TYPE = 'ito.provider.kii.login.type';
  var KII_LOGIN_TOKEN = {
    anonymous: 'ito.provider.kii.loginToken.anonymous',
    facebook: 'ito.provider.kii.loginToken.facebook',
    google: 'ito.provider.kii.loginToken.google',
    email: 'ito.provider.kii.loginToken.email'
  };
  var KII_GROUP_FRIENDS = 'itofriends';
  var KII_BUCKET = 'ito';
  var KII_BUCKET_NOTIFICATIONS = 'itonotifications';
  var KII_BUCKET_FRIENDS = KII_GROUP_FRIENDS;
  var KII_BUCKET_PROFILE = 'itoprofile';
  var KII_BUCKET_DATASTORE_REF = 'itodatastore';
  var KII_BUCKET_DATASTORE = 'itodata_';
  var KII_OBJ_EMAIL = 'itoemail_';
  var KII_OBJ_PASSCODE = 'itopasscode_';
  var KII_OBJ_PROFILE = KII_BUCKET_PROFILE + '_';
  var KII_OBJ_DATASTORE_REF = KII_BUCKET_DATASTORE_REF + '_';
  var KII_PROP_DATAOBSERVER = 'dataobserver';

  var KII_SUB = {};
  var KII_ACTION = {
    BUCKET: {},
    OBJECT: {}
  };

  var LOGIN_DIALOG = {
    facebook: 'http://www.facebook.com/v2.8/dialog/oauth',
    google: 'https://accounts.google.com/o/oauth2/v2/auth'
  };
  var LOGIN_SCOPE = {
    facebook: 'public_profile+email',
    google: 'profile+email'
  };
  var LOGIN_VERIFY = {};

  var ERR_DUPLICATE_LOGIN = 'itoduplicatelogin';

  var appId = null;
  var loginOpt = {};

  var friendsGroup = null;
  var itoBucket = null;
  var notificationBucket = null;
  var friendsBucket = null;
  var profileBucket = null;
  var dataStoreRefBucket = null;
  var profileRef = null;
  var passcodeRef = null;
  var emailRef = null;
  var friendsRef = {};
  var ping = null;
  var pendingRequests = [];

  var mqttClient = null;

  var funcQueue = [];
  var resolveQueue = [];

  var development = true;
  var isOnline = false;
  var _email = null;
  var userName = null;

  var isAdmin = false;
  var currentUser = null;

  var passcode = null;

  var dataStoreRef = {};

  if (!self.ito.provider) self.ito.provider = {};

  var KiiProvider = function (_ItoProvider) {
    _inherits(KiiProvider, _ItoProvider);

    function KiiProvider(parent) {
      _classCallCheck(this, KiiProvider);

      var _this = _possibleConstructorReturn(this, (KiiProvider.__proto__ || Object.getPrototypeOf(KiiProvider)).call(this, parent));

      _this.signIn = {
        anonymous: function anonymous() {
          return KiiUser.registerAsPseudoUser().then(function () {
            currentUser = KiiUser.getCurrentUser();
            var user = _getUser();
            localStorage.setItem(KII_LOGIN_TYPE, 'anonymous');
            localStorage.setItem(KII_LOGIN_TOKEN['anonymous'], user.getAccessToken());
            isOnline = true;
            return kiiSetProfile();
          });
        },
        facebook: function facebook() {
          return kiiOpenLoginDialog('facebook').then(function (c) {
            return KiiSocialConnect.logIn(KiiSocialNetworkName.FACEBOOK, {
              'access_token': c
            });
          }).then(function (params) {
            currentUser = params[0];
            var user = _getUser();
            localStorage.setItem(KII_LOGIN_TYPE, 'facebook');
            localStorage.setItem(KII_LOGIN_TOKEN['facebook'], user.getAccessToken());
            _email = user.getEmailAddress() || user.getID();
            isOnline = true;
            return kiiSetProfile();
          });
        },
        google: function google() {
          return kiiOpenLoginDialog('google').then(function (c) {
            return KiiSocialConnect.logIn(KiiSocialNetworkName.GOOGLEPLUS, {
              'access_token': c
            });
          }).then(function (params) {
            currentUser = params[0];
            var user = _getUser();
            localStorage.setItem(KII_LOGIN_TYPE, 'google');
            localStorage.setItem(KII_LOGIN_TOKEN['google'], user.getAccessToken());
            _email = user.getEmailAddress() || user.getID();
            isOnline = true;
            return kiiSetProfile();
          });
        },
        email: function email(id, pass) {
          return KiiUser.authenticate(id, pass).then(function () {
            currentUser = KiiUser.getCurrentUser();
            var user = _getUser();
            localStorage.setItem(KII_LOGIN_TYPE, 'email');
            localStorage.setItem(KII_LOGIN_TOKEN['email'], user.getAccessToken());
            _email = user.getEmailAddress() || user.getID();
            isOnline = true;
            return kiiSetProfile();
          });
        }
      };
      return _this;
    }

    /*
     * Kii Login
     */


    _createClass(KiiProvider, [{
      key: 'load',
      value: function load(url) {
        // Initialize Kii Cloud SDK and MQTT.js
        if (!self.Kii) {
          // Browser
          if (isBrowser) {
            var h = document.querySelector('head');
            return new Promise(function (resolve, reject) {
              var s = document.createElement('script');
              s.src = url || 'KiiSDK.min.js';
              s.addEventListener('load', function () {
                // constant values
                KII_SUB.ANONYMOUS = new KiiAnonymousUser();
                KII_SUB.AUTHENTICATED = new KiiAnyAuthenticatedUser();
                KII_ACTION.BUCKET.CREATE = KiiACLAction.KiiACLBucketActionCreateObjects;
                KII_ACTION.BUCKET.QUERY = KiiACLAction.KiiACLBucketActionQueryObjects;
                KII_ACTION.BUCKET.DROP = KiiACLAction.KiiACLBucketActionDropBucket;
                KII_ACTION.BUCKET.READ = KiiACLAction.KiiACLBucketActionReadObjects;
                KII_ACTION.OBJECT.READ = KiiACLAction.KiiACLObjectActionRead;
                KII_ACTION.OBJECT.WRITE = KiiACLAction.KiiACLObjectActionWrite;
                var t = document.createElement('script');
                t.src = 'https://unpkg.com/mqtt/dist/mqtt.min.js';
                t.addEventListener('load', function () {
                  resolve();
                });
                t.addEventListener('error', function () {
                  reject(new Error('cannot load mqtt.js'));
                });
                h.appendChild(t);
              });
              s.addEventListener('error', function () {
                reject(new Error('cannot load Kii SDK'));
              });
              h.appendChild(s);
            });
          }
          // Node.js
          else {
              var kii = require('kii-cloud-sdk').create();
              Object.keys(kii).forEach(function (i) {
                self[i] = kii[i];
              });
              self.mqtt = require('mqtt');
              return Promise.resolve();
            }
        } else return Promise.resolve();
      }
    }, {
      key: 'init',
      value: function init(arg) {
        return new Promise(function (resolve, reject) {
          development = !!arg && !!arg.development;
          appId = arg && arg.appId;
          loginOpt = arg && _typeof(arg.login) === 'object' ? arg.login : {};
          Kii.initializeWithSite(appId, arg.appKey, KiiSite[arg.serverLocation.toUpperCase()]);
          var type = localStorage.getItem(KII_LOGIN_TYPE);
          var token = type ? localStorage.getItem(KII_LOGIN_TOKEN[type]) : null;
          if (token) KiiUser.authenticateWithToken(token).then(kiiGetProfile).then(function (prof) {
            resolve(true);
          }, function (e) {
            reject(e === ERR_DUPLICATE_LOGIN ? true : e);
          });else resolve(false);
        });
      }
    }, {
      key: 'getUser',
      value: function getUser() {
        var user = _getUser();
        return user ? {
          userName: user.getDisplayName(),
          email: _email,
          isAnonymous: user.isPseudoUser(),
          uid: user.getID()
        } : null;
      }
    }, {
      key: 'createUser',
      value: function createUser(id, pass, name) {
        var _this2 = this;

        var user = _getUser();
        return user ? Promise.reject(new Error('already signed in')) : KiiUser.userWithEmailAddress(id, pass).register().then(function () {
          return KiiUser.authenticate(id, pass);
        }).then(function (user) {
          currentUser = user;
          _email = user.getEmailAddress() || user.getID();
          return kiiSetProfile(true);
        }).then(function (p) {
          return _this2.signOut().then(function () {
            return p;
          });
        });
      }
    }, {
      key: 'updateUserName',
      value: function updateUserName(name) {
        var user = _getUser();
        return user ? user.update(null, null, {
          displayName: name
        }).then(function () {
          return _getUser().refresh();
        }).then(function (user) {
          currentUser = user;
          userName = user.getDisplayName() || _email;
          return null;
        }) : Promise.reject(new Error('not signed in'));
      }
    }, {
      key: 'signOut',
      value: function signOut() {
        var _this3 = this;

        return new Promise(function (resolve, reject) {
          isOnline = false;
          var saved = profileRef;
          kiiSetOffline().then(function () {
            var user = _getUser();
            _this3.onOnline(false);
            var type = localStorage.getItem(KII_LOGIN_TYPE);
            if (type) {
              localStorage.removeItem(KII_LOGIN_TYPE);
              localStorage.removeItem(KII_LOGIN_TOKEN[type]);
            }
            if (user && user.isPseudoUser()) {
              profileRef = saved;
              return kiiDeleteProfile().then(function () {
                return user.delete();
              }).then(function () {
                currentUser = null;
                _email = null;
                userName = null;
              }).then(KiiUser.logOut);
            } else {
              KiiUser.logOut();
              currentUser = null;
              resolve();
            }
          });
        });
      }

      /*
       * Kii Cloud: User Accounts and Status
       */

    }, {
      key: 'getPasscode',
      value: function getPasscode() {
        return passcode;
      }
    }, {
      key: 'setPasscode',
      value: function setPasscode(pass) {
        if (passcode === pass) return Promise.resolve();else if (!pass) return kiiPushQueue(kiiResetPasscodeRef);else {
          return kiiPushQueue(function (p) {
            passcode = p;
            return kiiSetPasscodeRef();
          }, pass);
        }
      }
    }, {
      key: 'sendRequest',
      value: function sendRequest(m, opt) {
        return new Promise(function (resolve, reject) {
          var user = _getUser();
          kiiPushQueue(kiiPutServerCodeEntry, {
            entry: 'sendRequest',
            argument: {
              query: m,
              uid: user.getID(),
              userName: userName,
              email: _email,
              options: opt
            }
          }).then(function (result) {
            var r = result[2].getReturnedValue().returnedValue;
            if (r.result === 'ok') resolve(r.key.replace(/^kiicloud:\/\/groups\/(.*?)\/.*\/(.*)$/, '$1/$2'));else reject(new Error('No user for requested email address or passcode exists.'));
          });
        });
      }
    }, {
      key: 'dropRequest',
      value: function dropRequest(key, usePasscode) {
        var object = KiiObject.objectWithURI(key.replace(/^(.*)\/(.*)$/, 'kiicloud://groups/$1/buckets/itofriends/$2'));
        return kiiPushQueue(object.delete);
      }
    }, {
      key: 'acceptRequest',
      value: function acceptRequest(key, m, uid, usePasscode) {
        var user = _getUser();
        var arg = {
          type: 'accept',
          email: _email,
          userName: userName,
          uid: uid,
          requestKey: key
        };
        kiiAddFriend(uid).then(function () {
          if (usePasscode) arg.passcode = passcode;
          return usePasscode ? kiiResetPasscodeRef() : Promise.resolve();
        }).then(function () {
          return kiiPushQueue(kiiPutServerCodeEntry, {
            entry: 'acceptRequest',
            argument: arg
          }).catch(function () {});
        });
      }
    }, {
      key: 'rejectRequest',
      value: function rejectRequest(key, m, uid, usePasscode) {
        var arg = {
          type: 'reject',
          uid: uid,
          requestKey: key
        };
        if (usePasscode) arg.passcode = passcode;else arg.email = _email;
        return kiiPushQueue(kiiPutServerCodeEntry, {
          entry: 'rejectRequest',
          argument: arg
        }).catch(function () {});
      }
    }, {
      key: 'sendRemove',
      value: function sendRemove(uid, m) {
        var user = _getUser();
        return friendsRef[uid] ? kiiRemoveFriend(uid).then(function () {
          var bucket = friendsRef[uid].friendsBucket;
          var msg = bucket.createObject();
          msg.set('type', 'remove');
          msg.set('uid', user.getID());
          return kiiPushQueue(kiiPutObjectWithACL, msg);
        }).then(function () {
          delete friendsRef[uid];
          provider.onRemoveFriend(uid);
        }) : Promise.resolve();
      }

      /*
       * Kii Cloud: Chat Messages
       */

    }, {
      key: 'sendMessage',
      value: function sendMessage(uid, msg) {
        return kiiPutMessageObject(uid, {
          rel: 'message',
          type: 'message',
          data: msg
        }).then(function (obj) {
          return { uid: uid, messageKey: kiiObjectURIToKey(obj) };
        });
      }

      /*
       * KiiCloud: Notifications
       */

    }, {
      key: 'sendNotification',
      value: function sendNotification(msg) {
        return kiiPushQueue(kiiPutServerCodeEntry, {
          entry: 'sendNotification',
          argument: { data: msg }
        }).then(function (result) {
          var r = result[2].getReturnedValue().returnedValue;
          if (r.result === 'ok') return;else throw new Error('the current user is not permitted to send a notification');
        });
      }

      /*
       * Kii Cloud: WebRTC Signaling Messages
       */

    }, {
      key: 'sendInvite',
      value: function sendInvite(uid, opt) {
        var user = _getUser();
        return kiiPutMessageObject(uid, {
          rel: 'signaling',
          type: 'invite',
          audio: opt.audio,
          video: opt.video,
          dataChannel: !!opt.dataChannel
        }).then(function (obj) {
          pendingRequests.push(obj.objectURI());
          return kiiObjectURIToKey(obj);
        });
      }
    }, {
      key: 'sendAccept',
      value: function sendAccept(uid, cid, opt) {
        var user = _getUser();
        return kiiPutMessageObject(uid, {
          rel: 'signaling',
          type: 'accept',
          cid: cid,
          audio: opt.audio,
          video: opt.video
        }).then(function (obj) {
          return;
        });
      }
    }, {
      key: 'sendReject',
      value: function sendReject(uid, cid, reason) {
        var user = _getUser();
        return kiiPutMessageObject(uid, {
          rel: 'signaling',
          type: 'reject',
          cid: cid,
          reason: reason
        }).then(function (obj) {
          return;
        });
      }
    }, {
      key: 'sendReconnect',
      value: function sendReconnect(uid, cid, opt) {
        var user = _getUser();
        return kiiPutMessageObject(uid, {
          rel: 'signaling',
          type: 'reconnect',
          cid: cid,
          audio: opt.audio,
          video: opt.video,
          dataChannel: !!opt.dataChannel
        }).then(function (obj) {
          return;
        });
      }
    }, {
      key: 'sendClose',
      value: function sendClose(uid, cid) {
        var user = _getUser();
        return kiiPutMessageObject(uid, {
          rel: 'signaling',
          type: 'close',
          cid: cid
        }).then(function (obj) {
          return;
        });
      }
    }, {
      key: 'sendSignaling',
      value: function sendSignaling(uid, cid, type, data) {
        var user = _getUser();
        return kiiPutMessageObject(uid, {
          rel: 'signaling',
          type: 'signaling',
          signalingType: type,
          cid: cid,
          data: JSON.stringify(data)
        }).then(function (obj) {
          return;
        });
      }

      /*
       * Kii Cloud: Simple Data Store Sharing
       */

    }, {
      key: 'openDataStore',
      value: function openDataStore(scope, name) {
        return kiiPushQueue(kiiOpenDataStore, {
          scope: scope,
          name: name
        }).then(function (s) {
          return s || scope;
        });
      }
    }, {
      key: 'removeDataStore',
      value: function removeDataStore(name) {
        return kiiPushQueue(kiiRemoveDataStore, {
          name: name
        });
      }
    }, {
      key: 'putDataElement',
      value: function putDataElement(name, key, data, scope) {
        return kiiPushQueue(kiiPutDataElement, {
          name: name,
          key: key,
          data: data,
          scope: scope
        });
      }
    }, {
      key: 'getDataElement',
      value: function getDataElement(name, key) {
        return kiiPushQueue(kiiGetDataElement, {
          name: name,
          key: key
        });
      }
    }, {
      key: 'getAllDataElements',
      value: function getAllDataElements(name) {
        return kiiPushQueue(kiiGetAllDataElements, {
          name: name
        });
      }
    }, {
      key: 'removeDataElement',
      value: function removeDataElement(name, key) {
        return kiiPushQueue(kiiRemoveDataElement, {
          name: name,
          key: key
        });
      }
    }, {
      key: 'removeAllDataElements',
      value: function removeAllDataElements(name) {
        return kiiPushQueue(kiiRemoveAllDataElements, {
          name: name
        });
      }
    }, {
      key: 'observeDataStore',
      value: function observeDataStore(uid, name) {
        return kiiPushQueue(kiiObserveDataStore, {
          uid: uid,
          name: name
        });
      }
    }, {
      key: 'disconnectDataStoreObserver',
      value: function disconnectDataStoreObserver(uid, name) {
        return kiiPushQueue(kiiDisconnectDataStoreObserver, {
          uid: uid,
          name: name
        });
      }
    }]);

    return KiiProvider;
  }(ItoProvider);

  var provider = new KiiProvider(self.ito);
  self.ito.provider.kii = provider;

  /*
   * Internal functions
   */

  /*
   * Kii Cloud: Login
   */
  function _getUser() {
    return currentUser;
  }

  function kiiOpenLoginDialog(login) {
    return new Promise(function (resolve, reject) {
      var s = btoa(crypto.getRandomValues(new Uint8Array(32)).reduce(function (s, c) {
        return s + String.fromCharCode(c);
      }, '')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      var w = window.open(LOGIN_DIALOG[login] + '?client_id=' + loginOpt.clientIds[login] + '&scope=' + LOGIN_SCOPE[login] + '&state=' + login + '+' + s + '&redirect_uri=' + loginOpt.redirectUri + '&response_type=token');
      var c = function c(evt) {
        if (evt.origin === location.origin && evt.source === w) {
          var d = evt.data.split('&').reduce(function (r, i) {
            var j = i.split('=');
            r[j[0]] = j[1];
            return r;
          }, {});
          if (!d.state || d.state !== login + '+' + s) reject(new Error('Unexpected OAuth state parameter returned'));
          resolve(d['access_token']);
        }
        window.removeEventListener(c);
      };
      window.addEventListener('message', c);
    });
  }

  /*
   * Kii Cloud: User Accounts and Status
   */
  function kiiSetProfile(createOnly) {
    var user = _getUser();
    _email = _email || user.getID();
    userName = user.getDisplayName() || _email;
    var prof = {
      uid: user.getID(),
      userName: userName,
      email: _email,
      status: isOnline ? 'online' : 'offline'
    };
    return kiiOnOnline().then(function () {
      Object.keys(prof).forEach(function (i) {
        profileRef.set(i, prof[i]);
      });
      return profileRef.save();
    }).then(function () {
      return prof;
    }, function (e) {
      return Promise.reject(e === ERR_DUPLICATE_LOGIN ? true : e);
    });
  }

  function kiiGetProfile() {
    return new Promise(function (resolve, reject) {
      isOnline = true;
      currentUser = KiiUser.getCurrentUser();
      var user = _getUser();
      _email = user.getEmailAddress() || user.getID();
      userName = user.getDisplayName() || _email;
      var prof = {
        uid: user.getID(),
        userName: userName,
        email: _email,
        status: 'online'
      };
      kiiOnOnline().then(function () {
        Object.keys(prof).forEach(function (i) {
          profileRef.set(i, prof[i]);
        });
        return profileRef.save();
      }).then(function () {
        resolve(prof);
      }, function (e) {
        reject(e);
      });
    });
  }

  function kiiInitGroup() {
    var user = _getUser();
    return user.ownerOfGroups().then(function (params) {
      var list = params[1];
      return list.forEach(function (g) {
        switch (g.getName()) {
          case KII_GROUP_FRIENDS:
            friendsGroup = g;
            return;
        }
      });
    }).then(function () {
      if (!friendsGroup) {
        friendsGroup = KiiGroup.groupWithName(KII_GROUP_FRIENDS);
        return friendsGroup.save();
      }
    });
  }

  function kiiSetACLEntry(target, subject, action, grant) {
    var acl = (target.objectACL || target.acl)();
    var entry = KiiACLEntry.entryWithSubject(subject, action);
    entry.setGrant(grant);
    acl.putACLEntry(entry);
    return acl.save().catch(function () {});
  }

  function kiiLimitObjectACL(object) {
    var group = KiiGroup.groupWithID(object.objectURI().replace(/^kiicloud:\/\/groups\/(.*?)\/.*\/(.*)$/, '$1'));
    return kiiSetACLEntry(object, group, KII_ACTION.OBJECT.READ, false);
  }

  function kiiShiftQueue() {
    if (KiiUser.loggedIn() && navigator.onLine) {
      var f = funcQueue.shift();
      return f ? f.func(f.arg).then(function (result) {
        return resolveQueue.shift().resolve(result);
      }, function (error) {
        return resolveQueue.shift().reject(error);
      }).then(kiiShiftQueue) : Promise.resolve();
    } else return Promise.resolve();
  }

  function kiiPushQueue(func, arg) {
    return new Promise(function (resolve, reject) {
      funcQueue.push({ func: func, arg: arg });
      resolveQueue.push({ resolve: resolve, reject: reject });
      if (resolveQueue.length === 1) kiiShiftQueue();
    });
  }

  function kiiPutServerCodeEntry(arg) {
    return Kii.serverCodeEntry(arg.entry).execute(arg.argument);
  }

  function kiiPutObjectWithACL(object) {
    return object.save().then(function (obj) {
      return kiiLimitObjectACL(obj);
    });
  }

  function kiiPutMessageObject(uid, data) {
    var bucket = friendsRef[uid].friendsBucket;
    if (!bucket) return Promise.reject(new Error('no such friend: ' + uid));
    var user = _getUser();
    var msg = bucket.createObject();
    Object.keys(data).forEach(function (k) {
      msg.set(k, data[k]);
    });
    msg.set('uid', user.getID());
    return kiiPushQueue(kiiPutObjectWithACL, msg).then(function () {
      return msg;
    });
  }

  function kiiConvertObject(object) {
    return object.getKeys().reduce(function (a, b) {
      a[b] = object.get(b);
      return a;
    }, {});
  }

  function kiiInitProfileRef() {
    var user = _getUser();
    profileRef = profileBucket.createObjectWithID(KII_OBJ_PROFILE + user.getID());
    profileRef.set('type', 'profile');
    return profileRef.saveAllFields().then(function () {
      return kiiSetACLEntry(profileRef, friendsGroup, KII_ACTION.OBJECT.WRITE, false).then(function () {
        return kiiSetACLEntry(profileBucket, friendsGroup, KII_ACTION.BUCKET.READ, true);
      });
    });
  }

  function kiiSetFriendRef(uid) {
    return KiiUser.userWithID(uid).ownerOfGroups().then(function (params) {
      var g = params[1].filter(function (i) {
        return i.getName() === KII_GROUP_FRIENDS;
      })[0];
      if (g) {
        var fb = g.bucketWithName(KII_BUCKET_FRIENDS);
        var pb = g.bucketWithName(KII_BUCKET_PROFILE);
        var friend = pb.createObjectWithID(KII_OBJ_PROFILE + uid);
        return friend.refresh().then(function () {
          friendsRef[uid] = {
            friendsBucket: fb,
            profileBucket: pb,
            profile: friend
          };
          return friend;
        });
      } else return null;
    });
  }

  function kiiResetFriendRef(uid) {
    if (!friendsRef[uid]) return Promise.resolve();
    var bucket = friendsRef[uid].profileBucket;
    var user = _getUser();
    return kiiUnsubscribePush(bucket);
  }

  function kiiCheckAll() {
    var user = _getUser();
    friendsGroup.getMemberList().then(function (params) {
      return Promise.all(params[1].filter(function (u) {
        return u.getID() !== user.getID();
      }).map(function (u) {
        return u.ownerOfGroups().then(function (params) {
          var g = params[1][0];
          if (g) {
            var uid = u.getID();
            var fb = g.bucketWithName(KII_BUCKET_FRIENDS);
            var pb = g.bucketWithName(KII_BUCKET_PROFILE);
            var friend = pb.createObjectWithID(KII_OBJ_PROFILE + uid);
            return friend.refresh().then(function () {
              friendsRef[uid] = {
                friendsBucket: fb,
                profileBucket: pb,
                profile: friend
              };
              provider.onAddFriend(null, uid, {
                email: friend.get('email'),
                userName: friend.get('userName'),
                status: friend.get('status')
              });
            });
          }
        });
      }));
    }).then(function () {
      return friendsBucket.executeQuery(KiiQuery.queryWithClause());
    }).then(function (params) {
      return Promise.all(params[1].map(function (obj) {
        return kiiDispatchNewObject(obj);
      }));
    }).then(function () {
      var query = KiiQuery.queryWithClause(KiiClause.and(KiiClause.equals('rel', 'notification'), KiiClause.equals('type', 'notification')));
      query.sortByAsc('timestamp');
      return notificationBucket.executeQuery(query);
    }).then(function (params) {
      provider.onNotification(params[1].map(function (obj) {
        return {
          data: obj.get('data'),
          timestamp: obj.get('timestamp')
        };
      }));
    });
  }

  function kiiRefreshAll() {
    return Promise.all(Object.keys(friendsRef).map(function (k) {
      return friendsRef[k].profile.refresh().then(kiiOnUpdate);
    }));
  }

  function kiiObjectURIToKey(object) {
    return object.objectURI().replace(/^kiicloud:\/\/groups\/(.*?)\/.*\/(.*)$/, '$1/$2');
  }

  function kiiOnRequest(data) {
    var user = _getUser();
    var type = data.get('type');
    var uid = data.get('uid');
    var key = void 0;
    switch (type) {
      case 'request':
        provider.onRequest(kiiObjectURIToKey(data), {
          userName: data.get('userName'),
          email: data.get('email'),
          uid: uid
        }, data.get('isPasscode'), data.get('options') || null);
        break;
      case 'accept':
        key = data.get('requestKey');
        data.delete().then(function () {
          return kiiAddFriend(uid);
        }).then(function () {
          return kiiSetFriendChangedRef(uid);
        }).then(function () {
          return kiiNotifyFriendAdded(key, uid);
        }).then(function () {
          provider.onAccept(key, {
            userName: data.get('userName'),
            uid: data.get('uid'),
            email: data.get('email')
          });
          kiiFriendAdded(key, uid);
        });
        break;
      case 'reject':
        data.delete().then(function () {
          provider.onReject(data.get('requestKey'));
        });
        break;
      case 'addfriend':
        data.delete().then(function () {
          return kiiSetFriendChangedRef(uid).then(function () {
            kiiFriendAdded(data.get('requestKey'), uid);
          });
        });
        break;
      case 'remove':
        data.delete().then(function () {
          return kiiRemoveFriend(uid);
        }).then(function () {
          delete friendsRef[uid];
          provider.onRemoveFriend(uid);
        });
        break;
    }
  }

  function kiiOnUpdate(data) {
    var user = _getUser();
    var type = data.get('type');
    var uid = data.get('uid');
    switch (type) {
      case 'profile':
        provider.onUpdateFriend(uid, {
          userName: data.get('userName'),
          email: data.get('email'),
          status: data.get('status')
        });
        break;
    }
  }

  function kiiDispatchNewObject(object) {
    switch (object.get('rel')) {
      case 'message':
        kiiDispatchMessageObject(object);
        break;
      case 'notification':
        kiiDispatchNotificationObject(object);
        break;
      case 'signaling':
        kiiDispatchSignalingObject(object);
        break;
      default:
        kiiOnRequest(object);
        break;
    }
  }

  function kiiInitMqttClient() {
    var user = _getUser();
    var response = void 0,
        endpoint = void 0;
    return user.pushInstallation().installMqtt(development).then(function (r) {
      response = r;
      // getMqttEndpoint would be invoked at maximum three times.
      // If first and/or second trial might fail,
      // an error would appear on your console,
      // however, getMqttEndpoint resolves the Promise
      // when the last trial would succeed.
      return user.pushInstallation().getMqttEndpoint(response.installationID);
    }).then(function (e) {
      endpoint = e;
      // avoid Mixed Content
      var ws = (location.protocol === 'http:' ? 'ws://' : 'wss://') + endpoint.host + ':' + (location.protocol === 'http:' ? endpoint.portWS : endpoint.portWSS) + '/mqtt';
      mqttClient = mqtt.connect(ws, {
        username: endpoint.username,
        password: endpoint.password,
        clientId: endpoint.mqttTopic
      });
      mqttClient.on('connect', function () {
        mqttClient.subscribe(endpoint.mqttTopic);
      });
      mqttClient.on('message', function (topic, message, packet) {
        var body = JSON.parse(message.toString());
        // Note: ito does not currently use Push-to-User notification,
        //       for the purpose of ensuring compatibility with Firebase
        //       and better offline support.
        if (body.objectID) {
          var object = KiiObject.objectWithURI(body.sourceURI);
          var i = void 0;
          if (body.objectID.match(new RegExp('^' + KII_BUCKET_DATASTORE))) {
            switch (body.type) {
              case 'DATA_OBJECT_CREATED':
                object.refresh().then(function (obj) {
                  kiiObserveDataElementAdd(obj, body.bucketID);
                });
                break;
              case 'DATA_OBJECT_UPDATED':
                object.refresh().then(function (obj) {
                  kiiObserveDataElementUpdate(obj, body.bucketID);
                });
                break;
              case 'DATA_OBJECT_DELETED':
                kiiObserveDataElementRemove(object, body.bucketID);
                break;
            }
          } else {
            switch (body.type) {
              case 'DATA_OBJECT_CREATED':
                object.refresh().then(function (obj) {
                  kiiDispatchNewObject(obj);
                });
                break;
              case 'DATA_OBJECT_UPDATED':
                object.refresh().then(function (obj) {
                  kiiOnUpdate(obj);
                });
                break;
              case 'DATA_OBJECT_DELETED':
                i = pendingRequests.indexOf(object.objectURI());
                if (i >= 0) pendingRequests.splice(i, 1);
                break;
            }
          }
        }
      });
    });
  }

  function kiiSetAppScopeObjectACL(object) {
    return kiiSetACLEntry(object, KII_SUB.AUTHENTICATED, KII_ACTION.OBJECT.READ, false).then(function () {
      return kiiSetACLEntry(object, KII_SUB.ANONYMOUS, KII_ACTION.OBJECT.READ, false);
    }).then(function () {
      return kiiSetACLEntry(object, KII_SUB.AUTHENTICATED, KII_ACTION.OBJECT.WRITE, false);
    });
  }

  function kiiSetPasscodeRef() {
    var created = !!passcodeRef;
    return (!created ? Kii.serverCodeEntry('setPasscode').execute({
      passcode: passcode,
      group: friendsGroup.getID()
    }).then(function (result) {
      var r = result[2].getReturnedValue().returnedValue;
      if (r.result === 'ok') {
        if (r.uri) {
          passcodeRef = KiiObject.objectWithURI(r.uri);
          return passcodeRef.refresh();
        } else passcodeRef = null;
      } else return Promise.reject(new Error('the specified passcode is already used'));
    }) : Promise.resolve()).then(function () {
      passcodeRef.set('type', 'passcode');
      passcodeRef.set('passcode', passcode);
      passcodeRef.set('group', friendsGroup.getID());
      return passcodeRef.save();
    });
  }

  function kiiResetPasscodeRef() {
    if (passcodeRef) {
      return passcodeRef.delete().then(function () {
        passcode = null;
        passcodeRef = null;
      });
    } else return Promise.resolve();
  }

  function kiiSetEmailRef() {
    var user = _getUser();
    var created = !!emailRef;
    if (!created) emailRef = itoBucket.createObjectWithID(KII_OBJ_EMAIL + user.getID());
    emailRef.set('type', 'email');
    emailRef.set('email', _email);
    emailRef.set('group', friendsGroup.getID());
    emailRef.set('status', 'online');
    emailRef.set(KII_PROP_DATAOBSERVER, []);
    return emailRef.saveAllFields().then(function () {
      return !created ? kiiSetAppScopeObjectACL(emailRef, true) : Promise.resolve();
    });
  }

  function kiiResetEmailRef() {
    if (emailRef) {
      return emailRef.delete().then(function () {
        emailRef = null;
      });
    }
  }

  function kiiSetFriendChangedRef(uid) {
    var user = _getUser();
    return kiiSetFriendRef(uid).then(function (result) {
      if (result) {
        var bucket = friendsRef[uid].profileBucket;
        return user.pushSubscription().isSubscribed(bucket).then(function (params) {
          return params[2] ? Promise.resolve() : user.pushSubscription().subscribe(bucket);
        });
      } else return group.refresh().then(function (g) {
        return kiiRemoveFriend(g.getCachedOwner().getID());
      });
    });
  }

  function kiiFriendAdded(key, uid) {
    var friend = friendsRef[uid].profile;
    if (friend) provider.onAddFriend(key, uid, {
      email: friend.get('email'),
      userName: friend.get('userName'),
      status: friend.get('status')
    });
  }

  function kiiNotifyFriendAdded(key, uid) {
    if (!friendsRef[uid]) return Promise.resolve();
    return kiiPutMessageObject(uid, { type: 'addfriend', requestKey: key });
  }

  function kiiAddFriend(uid) {
    friendsGroup.addUser(KiiUser.userWithID(uid));
    return kiiPushQueue(friendsGroup.save);
  }

  function kiiRemoveFriend(uid) {
    return kiiResetFriendRef(uid).then(function () {
      friendsGroup.removeUser(KiiUser.userWithID(uid));
      return kiiPushQueue(friendsGroup.save);
    });
  }

  function kiiSetPing() {
    if (!ping) ping = setInterval(kiiPing, 5000);
  }

  function kiiResetPing() {
    if (ping) {
      clearInterval(ping);
      ping = null;
    }
  }

  function kiiPing() {
    if (isOnline && emailRef && (!document || document.visibilityState === 'visible')) {
      emailRef.set('status', 'online');
      emailRef.save().then(function () {
        profileRef.set('status', 'online');
        profileRef.save();
      });
    } else kiiResetPing();
  }

  function kiiSubscribePush(target) {
    var user = _getUser();
    return user.pushSubscription().isSubscribed(target).then(function (params) {
      if (!params[2]) return user.pushSubscription().subscribe(target);
    });
  }

  function kiiUnsubscribePush(target) {
    var user = _getUser();
    return user.pushSubscription().isSubscribed(target).then(function (params) {
      if (params[2]) return user.pushSubscription().unsubscribe(target);
    });
  }

  function kiiCheckAdministrator() {
    return kiiPushQueue(kiiPutServerCodeEntry, {
      entry: 'checkAdministrator',
      argument: { a: 0 }
    }).then(function (result) {
      var r = result[2].getReturnedValue().returnedValue;
      if (r.result === 'ok') isAdmin = r.isAdmin;
    });
  }

  function kiiOnOnline() {
    var user = _getUser();
    return kiiInitGroup().then(function () {
      itoBucket = Kii.bucketWithName(KII_BUCKET);
      notificationBucket = Kii.bucketWithName(KII_BUCKET_NOTIFICATIONS);
      dataStoreRefBucket = Kii.bucketWithName(KII_BUCKET_DATASTORE_REF);
      friendsBucket = friendsGroup.bucketWithName(KII_BUCKET_FRIENDS);
      profileBucket = friendsGroup.bucketWithName(KII_BUCKET_PROFILE);
      profileRef = profileBucket.createObjectWithID(KII_OBJ_PROFILE + user.getID());
      return profileRef.refresh().catch(function () {
        return kiiInitProfileRef();
      });
    }).then(function () {
      return profileRef.get('status') === 'online' ? Promise.resolve().then(function () {
        KiiUser.logOut();
        userName = null;
        _email = null;
        currentUser = null;
        isOnline = false;
        throw ERR_DUPLICATE_LOGIN;
      }) : kiiInitMqttClient().then(function () {
        return kiiSubscribePush(friendsBucket);
      }).then(function () {
        return kiiSubscribePush(notificationBucket);
      }).then(function () {
        return kiiCheckAdministrator();
      }).then(function () {
        return Kii.serverCodeEntry('unsubscribeDataStore').execute({ a: 0 });
      }).then(function () {
        emailRef = itoBucket.createObjectWithID(KII_OBJ_EMAIL + user.getID());
        return emailRef.refresh().catch(function () {}).then(kiiSetEmailRef);
      }).then(function () {
        passcodeRef = itoBucket.createObjectWithID(KII_OBJ_PASSCODE + user.getID());
        return passcodeRef.refresh().then(function (obj) {
          passcode = obj.get('passcode');
        }, function () {
          passcodeRef = null;
        });
      }).then(function () {
        return kiiPushQueue(passcode ? kiiSetPasscodeRef : kiiResetPasscodeRef);
      }).then(kiiCheckAll).then(function () {
        if (!ping) ping = setInterval(kiiPing, 5000);
      });
    });
  }

  function kiiSetOffline() {
    kiiResetPing();
    if (mqttClient) {
      mqttClient.end();
      mqttClient = null;
    }
    if (profileRef) {
      profileRef.set('status', 'offline');
      return profileRef.save().then(function () {
        return emailRef.save();
      }).then(function () {
        emailRef.set('status', 'offline');
        return emailRef.save();
      }).then(function () {
        friendsGroup = null;
        itoBucket = null;
        friendsBucket = null;
        profileRef = null;
        dataStoreRefBucket = null;
        return Kii.serverCodeEntry('removePendingRequests').execute({
          pendingRequests: pendingRequests
        });
      });
    } else return Promise.resolve();
  }

  function kiiDeleteProfile() {
    var user = _getUser();
    if (user) {
      return user.ownerOfGroups().then(function (params) {
        return Promise.all(params[1].map(function (g) {
          return g.delete();
        }));
      }).then(kiiResetEmailRef).then(kiiResetPasscodeRef).then(function () {
        profileRef = null;
      });
    } else return Promise.resolve();
  }

  /*
   * Kii Cloud: Chat Messages
   */
  function kiiDispatchMessageObject(object) {
    var uid = object.get('uid');
    switch (object.get('type')) {
      case 'message':
        provider.onMessage(uid, object.get('data'));
        kiiPutMessageObject(uid, {
          rel: 'message',
          type: 'ack',
          messageKey: kiiObjectURIToKey(object)
        }).then(function () {
          return object.delete();
        });
        break;
      case 'ack':
        provider.onMessageAck(uid, object.get('messageKey'));
        object.delete();
        break;
    }
  }

  /*
   * Kii Cloud: Notifictaions
   */
  function kiiDispatchNotificationObject(object) {
    var uid = object.get('uid');
    switch (object.get('type')) {
      case 'notification':
        provider.onNotification([{
          data: object.get('data'),
          timestamp: object.get('timestamp')
        }]);
        break;
    }
  }

  /*
   * Kii Cloud: WebRTC Signaling Messages
   */
  function kiiDispatchSignalingObject(object) {
    var key = object.get('cid') || kiiObjectURIToKey(object);
    var v = kiiConvertObject(object);
    v.cid = key;
    object.delete().then(function () {
      switch (v.type) {
        case 'invite':
          provider.onInvite(v);
          break;
        case 'accept':
          provider.onAcceptInvite(v);
          break;
        case 'reconnect':
          provider.onReconnect(v);
          break;
        case 'reject':
        case 'close':
          provider.onClose(v);
          break;
        case 'signaling':
          provider.onSignaling(v);
          break;
      }
    });
  }

  /*
   * Kii Cloud: Simple Data Store Sharing
   */
  function kiiEncodeUserID(uid) {
    return btoa(uid.replace(/-/g, '').match(/([0-9a-f]{1,2})/g).reduce(function (a, b) {
      return a + String.fromCharCode(parseInt(b, 16));
    }, '')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function kiiOpenDataStore(arg) {
    var uid = _getUser().getID();
    var name = arg.name;
    var dataStore = KII_BUCKET_DATASTORE + kiiEncodeUserID(uid) + '_' + name;
    return dataStoreRef[name] ? Promise.resolve(dataStoreRef[name].scope) : Kii.serverCodeEntry('openDataStore').execute({
      scope: arg.scope,
      name: name,
      group: friendsGroup.getID(),
      dataStore: dataStore,
      dataStoreRef: KII_OBJ_DATASTORE_REF + uid + '_' + name
    }).then(function (result) {
      var r = result[2].getReturnedValue().returnedValue;
      if (r.result === 'ok') {
        dataStoreRef[name] = {
          scope: r.scope,
          bucket: Kii.bucketWithName(dataStore),
          elements: {}
        };
        return r.scope;
      } else throw new Error('could not open the data store: ' + name);
    });
  }

  function kiiRemoveDataStore(arg) {
    var uid = _getUser().getID();
    var name = arg.name;
    var refid = KII_OBJ_DATASTORE_REF + uid + '_' + name;
    var ref = dataStoreRefBucket.createObjectWithID(refid);
    return kiiRemoveAllDataElements(arg).then(function () {
      delete dataStoreRef[name];
      return ref.delete();
    }).then(function () {
      var store = Kii.bucketWithName(KII_BUCKET_DATASTORE + kiiEncodeUserID(uid) + '_' + name);
      return store.delete();
    });
  }

  function kiiPutDataElement(arg) {
    var key = arg.key;
    var data = arg.data;
    var scope = arg.scope;
    var ref = dataStoreRef[arg.name];
    if (!ref) return Promise.reject(new Error('no such data store'));
    var element = void 0;
    if (ref.elements[key]) {
      element = ref.elements[key];
      element.set('data', data);
      return element.save();
    } else {
      element = ref.bucket.createObjectWithID(ref.bucket.getBucketName() + '_' + key);
      return element.refresh().then(function (obj) {
        element.set('data', data);
        return element.save().then(function (obj) {
          ref.elements[key] = obj;
        });
      }, function () {
        element.set('data', data);
        return element.saveAllFields().then(function () {
          ref.elements[key] = element;
          return scope !== 'public' ? kiiSetACLEntry(element, KII_SUB.AUTHENTICATED, KII_ACTION.OBJECT.READ, false) : Promise.resolve();
        }).then(function () {
          return kiiSetACLEntry(element, KII_SUB.ANONYMOUS, KII_ACTION.OBJECT.READ, false);
        }).then(function () {
          return scope === 'friends' ? kiiSetACLEntry(element, friendsGroup, KII_ACTION.OBJECT.READ, true) : Promise.resolve();
        }).then(function () {
          return kiiSetACLEntry(element, KII_SUB.AUTHENTICATED, KII_ACTION.OBJECT.WRITE, false);
        });
      });
    }
  }

  function kiiGetDataElement(arg) {
    var key = arg.key;
    var ref = dataStoreRef[arg.name];
    if (!ref) return Promise.reject(new Error('no such data store'));
    var element = ref.elements[key];
    if (element) {
      return element.refresh().then(function (obj) {
        return { key: key, data: obj.get('data') };
      });
    } else {
      element = ref.bucket.createObjectWithID(ref.bucket.getBucketName() + '_' + key);
      return element.refresh().then(function (obj) {
        ref.elements[key] = obj;
        return { key: key, data: obj.get('data') };
      }, function () {
        throw new Error('no such key in the data store');
      });
    }
  }

  function kiiGetAllDataElements(arg) {
    var ref = dataStoreRef[arg.name];
    if (!ref) return Promise.reject(new Error('no such data store'));
    return ref.bucket.executeQuery(KiiQuery.queryWithClause()).then(function (params) {
      return params[1].reduce(function (result, obj) {
        var key = obj.getID().substr(ref.bucket.getBucketName().length + 1);
        var data = obj.get('data');
        ref.elements[key] = obj;
        result[key] = data;
        return result;
      }, {});
    });
  }

  function kiiRemoveDataElement(arg) {
    var key = arg.key;
    var ref = dataStoreRef[arg.name];
    if (!ref) return Promise.reject(new Error('no such data store'));
    var element = ref.elements[key] || ref.bucket.createObjectWithID(ref.bucket.getBucketName() + '_' + key);
    delete ref.elements[key];
    return element.delete().catch(function () {});
  }

  function kiiRemoveAllDataElements(arg) {
    var ref = dataStoreRef[arg.name];
    if (!ref) return Promise.reject(new Error('no such data store'));
    ref.elements = [];
    return ref.bucket.executeQuery(KiiQuery.queryWithClause()).then(function (params) {
      return params[1].reduce(function (p, obj) {
        return p.then(function () {
          return obj.delete().catch(function () {});
        });
      }, Promise.resolve());
    });
  }

  function kiiObserveDataStore(arg) {
    var uid = arg.uid;
    var name = arg.name;
    var storeRef = Kii.bucketWithName(KII_BUCKET_DATASTORE_REF).createObjectWithID(KII_OBJ_DATASTORE_REF + uid + '_' + name);
    var store = void 0;
    return storeRef.refresh().then(function (obj) {
      store = Kii.bucketWithName(obj.get('datastore'));
      var observers = emailRef.get(KII_PROP_DATAOBSERVER);
      observers.push(store.getBucketName());
      emailRef.set(KII_PROP_DATAOBSERVER, observers);
      return emailRef.save();
    }).then(function () {
      return kiiSubscribePush(store);
    }).then(function () {
      return arg;
    }).catch(function (e) {
      throw new Error('no such data store or permission denied');
    });
  }

  function kiiDisconnectDataStoreObserver(arg) {
    var store = Kii.bucketWithName(KII_BUCKET_DATASTORE + kiiEncodeUserID(arg.uid) + '_' + arg.name);
    return kiiUnsubscribePush(store).then(function () {
      return emailRef.refresh();
    }).then(function (obj) {
      var list = obj.get(KII_PROP_DATAOBSERVER);
      var i = list.indexOf(store.getBucketName());
      if (i >= 0) {
        list.splice(i, 1);
        emailRef.set(KII_PROP_DATAOBSERVER, list);
        return emailRef.save();
      }
    }).catch(function () {
      throw new Error('cannot unsubscribe the data store: ' + arg.name);
    });
  }

  function kiiBase64ToUUID(ref) {
    var d = atob(ref.replace(/-/g, '+').replace(/_/g, '/'));
    var r = '';
    for (var i = 0; i < d.length; i++) {
      var c = d.charCodeAt(i).toString(16);
      r += ('0' + c).substr(c.length - 1, 2);
      switch (i) {
        case 5:
        case 7:
        case 9:
        case 11:
          r += '-';
      }
    }
    return r;
  }

  function kiiDecodeDataStoreRef(ref, bucket) {
    var r = bucket.replace(new RegExp('^' + KII_BUCKET_DATASTORE), '');
    var uid = kiiBase64ToUUID(r.substr(0, 22));
    var name = r.substr(23);
    var key = ref.replace(new RegExp('^' + bucket + '_'), '');
    return { uid: uid, name: name, key: key };
  }

  function kiiObserveDataElementAdd(object, bucket) {
    var arg = kiiDecodeDataStoreRef(object.getID(), bucket);
    provider.onElementAdd(arg.uid, arg.name, arg.key, object.get('data'));
  }

  function kiiObserveDataElementUpdate(object, bucket) {
    var arg = kiiDecodeDataStoreRef(object.getID(), bucket);
    provider.onElementUpdate(arg.uid, arg.name, arg.key, object.get('data'));
  }

  function kiiObserveDataElementRemove(object, bucket) {
    var arg = kiiDecodeDataStoreRef(object.getID(), bucket);
    provider.onElementRemove(arg.uid, arg.name, arg.key);
  }

  if (isBrowser) {
    window.addEventListener('unload', function () {});

    var onOnlineHandler = function onOnlineHandler() {
      isOnline = !!_getUser();
      kiiRefreshAll();
      kiiSetPing();
      kiiShiftQueue();
    };

    window.addEventListener('online', onOnlineHandler);

    window.addEventListener('offline', function () {
      isOnline = false;
      kiiResetPing();
    });

    if (document) {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') onOnlineHandler();else if (document.visibilityState === 'hidden' || document.visibilityState === 'unloaded') {
          kiiResetPing();
          var user = _getUser();
          if (user) {
            // I wish I cloud deprecate use of synchronous XHR...
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://api-jp.kii.com/api/apps/' + appId + '/server-code/versions/current/onOffline', false);
            xhr.setRequestHeader('Authorization', 'Bearer ' + user.getAccessToken());
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify({ pendingRequests: pendingRequests }));
          }
        }
      });
    }
  }

  if (!isBrowser) module.exports = self.ito;
})((typeof window === 'undefined' ? 'undefined' : _typeof(window)) === 'object' ? window : global, (typeof window === 'undefined' ? 'undefined' : _typeof(window)) === 'object');


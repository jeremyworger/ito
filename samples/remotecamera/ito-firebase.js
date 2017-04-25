/**
 * ito-firebase.js
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
  var signin = null;
  var credential = null;
  var initResolve = null;
  var isOnline = false;
  var _email = null;
  var userName = null;

  var disconnectRef = null;
  var requestRef = null;
  var friendsRef = null;
  var profilesRef = {};
  var isAdmin = false;
  var passcodesRef = null;
  var passcode = null;

  var messagesRef = null;

  var notificationsRef = null;
  var lastNotificationChecked = null;

  var signalsRef = null;

  var dataObserverRef = {};

  if (!self.ito.provider) self.ito.provider = {};

  var FirebaseProvider = function (_ItoProvider) {
    _inherits(FirebaseProvider, _ItoProvider);

    function FirebaseProvider(parent) {
      _classCallCheck(this, FirebaseProvider);

      var _this = _possibleConstructorReturn(this, (FirebaseProvider.__proto__ || Object.getPrototypeOf(FirebaseProvider)).call(this, parent));

      _this.signIn = {
        anonymous: function anonymous() {
          return firebase.auth().signInAnonymously().then(function () {
            isOnline = true;
            return firebaseSetProfile();
          });
        },
        google: function google() {
          signin = new firebase.auth.GoogleAuthProvider();
          signin.addScope('email');
          return new Promise(function (resolve, reject) {
            firebase.auth().signInWithPopup(signin).then(function (result) {
              credential = result.credential;
              fetch('https://www.googleapis.com/userinfo/v2/me', { headers: { Authorization: 'Bearer ' + credential.accessToken } }).then(function (response) {
                return response.json();
              }).then(function (json) {
                _email = json.email;
                isOnline = true;
                return firebaseSetProfile();
              }).then(function (p) {
                resolve(p);
              });
            }, function (error) {
              reject(error);
            });
          });
        },
        facebook: function facebook() {
          signin = new firebase.auth.FacebookAuthProvider();
          signin.addScope('email');
          return new Promise(function (resolve, reject) {
            firebase.auth().signInWithPopup(signin).then(function (result) {
              credential = result.credential;
              fetch('https://graph.facebook.com/v2.7/me?fields=email&access_token=' + credential.accessToken).then(function (response) {
                return response.json();
              }).then(function (json) {
                _email = json.email;
                isOnline = true;
                return firebaseSetProfile();
              }).then(function (p) {
                resolve(p);
              });
            }, function (error) {
              reject(error);
            });
          });
        },
        email: function email(id, pass) {
          return new Promise(function (resolve, reject) {
            firebase.auth().signInWithEmailAndPassword(id, pass).then(function (user) {
              _email = user.email;
              isOnline = true;
              resolve(firebaseSetProfile());
            });
          }, function (error) {
            reject(error);
          });
        }
      };
      return _this;
    }

    /*
     * Firebase Login
     */


    _createClass(FirebaseProvider, [{
      key: 'load',
      value: function load(url) {
        // Initialize Firebase client
        if (!self.firebase) {
          // Browser
          if (isBrowser) {
            var h = document.querySelector('head');
            return new Promise(function (resolve, reject) {
              var s = document.createElement('script');
              s.src = url || 'https://www.gstatic.com/firebasejs/3.8.0/firebase.js';
              s.addEventListener('load', function () {
                resolve();
              });
              s.addEventListener('error', function () {
                reject(new Error('cannot load Firebase SDK'));
              });
              h.appendChild(s);
            });
          }
          // Node.js
          else {
              self.firebase = require('firebase');
              return Promise.resolve();
            }
        } else return Promise.resolve();
      }
    }, {
      key: 'init',
      value: function init(arg) {
        var _this2 = this;

        return new Promise(function (resolve, reject) {
          initResolve = resolve;
          firebase.initializeApp({
            apiKey: arg.apiKey,
            authDomain: arg.authDomain,
            databaseURL: arg.databaseURL
          });
          firebase.auth().onAuthStateChanged(function (user) {
            var b = !!user;
            if (initResolve) {
              var r = initResolve;
              initResolve = null;
              if (user) firebaseGetProfile().then(firebaseSetOnDisconnectRef).then(function () {
                r(b);
              });else r(b);
            } else {
              if (user) firebaseSetOnDisconnectRef();
              _this2.onOnline(b);
            }

            // Disconnect/Reconnect to Firebase
            firebase.database().ref('.info/connected').on('value', function (snapshot) {
              if (snapshot.val() === true) {
                if (disconnectRef && _getUser()) {
                  disconnectRef.set('online');
                  firebaseSetOnDisconnectRef();
                  if (passcode) {
                    var p = passcode;
                    passcode = null;
                    firebaseSetPasscodeRef(p);
                  }
                }
                _this2.onOnline(!!_getUser());
              } else {
                firebaseResetPasscodeRef(true);
                _this2.onDisconnect();
              }
            });
          });
        });
      }
    }, {
      key: 'getUser',
      value: function getUser() {
        var user = _getUser();
        return user ? {
          userName: userName,
          email: _email,
          isAnonymous: user.isAnonymous,
          uid: user.uid
        } : null;
      }
    }, {
      key: 'createUser',
      value: function createUser(id, pass) {
        var _this3 = this;

        var user = _getUser();
        return user ? Promise.reject(new Error('already signed in')) : new Promise(function (resolve, reject) {
          firebase.auth().createUserWithEmailAndPassword(id, pass).then(function (user) {
            _email = user.email || user.uid;
            return firebaseSetProfile(true);
          }).then(function (p) {
            _this3.signOut().then(function () {
              resolve(p);
            });
          });
        });
      }
    }, {
      key: 'updateUserName',
      value: function updateUserName(name) {
        var user = _getUser();
        return user ? user.updateProfile({
          displayName: name
        }).then(function () {
          var user = _getUser();
          userName = user.displayName || _email;
          return firebaseSetProfile(true);
        }) : Promise.reject(new Error('not signed in'));
      }
    }, {
      key: 'signOut',
      value: function signOut() {
        return new Promise(function (resolve, reject) {
          firebaseSetOffline().then(function () {
            var user = _getUser();
            if (user && user.isAnonymous) {
              return firebase.database().ref('lastNotificationChecked/' + user.uid).remove().then(firebase.database().ref('emails/' + firebaseEscape(_email)).remove()).then(firebaseDeleteProfile()).then(function () {
                user.delete();
                _email = null;
                userName = null;
              });
            } else return firebase.auth().signOut();
          }).then(function () {
            resolve();
          }, function (error) {
            reject(error);
          });
        });
      }

      /*
       * Firebase Database: User Accounts and Status
       */

    }, {
      key: 'getPasscode',
      value: function getPasscode() {
        return passcode;
      }
    }, {
      key: 'setPasscode',
      value: function setPasscode(pass) {
        return firebaseSetPasscodeRef(pass);
      }
    }, {
      key: 'sendRequest',
      value: function sendRequest(m, opt) {
        return new Promise(function (resolve, reject) {
          var user = _getUser();
          var e = firebaseEscape(m);
          var ref = firebase.database().ref('requests/' + e).push();
          firebase.database().ref('requestKeys/' + user.uid + '/' + e).set(ref.key).then(function () {
            var arg = {
              type: 'request',
              email: _email,
              userName: user.displayName,
              uid: user.uid
            };
            if (opt) arg.options = opt;
            return ref.set(arg);
          }).then(function () {
            resolve(ref.key);
          }, function () {
            reject(new Error('No user for requested email address or passcode exists.'));
          });
        });
      }
    }, {
      key: 'sendRemove',
      value: function sendRemove(uid, m) {
        return new Promise(function (resolve, reject) {
          var user = _getUser();
          var e = firebaseEscape(m);
          var ref = firebase.database().ref('requests/' + e).push();
          firebase.database().ref('friends/' + user.uid + '/' + uid).remove().then(function () {
            return ref.set({
              type: 'remove',
              uid: user.uid
            });
          }).then(function () {
            resolve();
          });
        });
      }
    }, {
      key: 'dropRequest',
      value: function dropRequest(key, passcode) {
        return _dropRequest(key, passcode);
      }
    }, {
      key: 'acceptRequest',
      value: function acceptRequest(key, m, uid, usePasscode) {
        return new Promise(function (resolve, reject) {
          var user = _getUser();
          var ref = firebase.database().ref('requests/' + firebaseEscape(m)).push();
          firebaseAddFriend(uid).then(function () {
            var arg = {
              type: 'accept',
              email: _email,
              userName: user.displayName,
              uid: user.uid,
              requestKey: key
            };
            if (usePasscode) {
              arg.passcode = passcode;
              firebaseResetPasscodeRef();
            }
            return ref.set(arg);
          }).then(firebaseFinishRequest(usePasscode ? passcode : firebaseEscape(_email), uid)).then(function () {
            resolve();
          });
        });
      }
    }, {
      key: 'rejectRequest',
      value: function rejectRequest(key, m, uid, usePasscode) {
        return new Promise(function (resolve, reject) {
          var ref = firebase.database().ref('requests/' + firebaseEscape(m)).push();
          var arg = {
            type: 'reject',
            requestKey: key
          };
          if (usePasscode) arg.passcode = passcode;else arg.email = _email;
          ref.set(arg).then(firebaseFinishRequest(usePasscode ? passcode : firebaseEscape(_email), uid)).then(function () {
            resolve();
          });
        });
      }

      /*
       * Firebase Database: Chat Messages
       */

    }, {
      key: 'sendMessage',
      value: function sendMessage(uid, msg) {
        var user = _getUser();
        if (messagesRef) {
          var ref = firebase.database().ref('messages/' + uid).push();
          return ref.set({
            type: 'message',
            uid: user.uid,
            data: msg
          }).then(function () {
            return { uid: uid, messageKey: ref.key };
          });
        } else {
          return Promise.reject(new Error('cannot send message: not online'));
        }
      }

      /*
       * Firebase Database: Notifications
       */

    }, {
      key: 'sendNotification',
      value: function sendNotification(msg) {
        return new Promise(function (resolve, reject) {
          var ref = firebase.database().ref('notifications').push();
          ref.set({
            data: msg,
            timestamp: firebase.database.ServerValue.TIMESTAMP
          }).then(function () {
            firebaseClearOldNotifications();
            resolve();
          }, function () {
            reject(new Error('the current user is not permitted to send a notification'));
          });
        });
      }

      /*
       * Firebase Database: WebRTC Signaling Messages
       */

    }, {
      key: 'sendInvite',
      value: function sendInvite(uid, opt) {
        return new Promise(function (resolve, reject) {
          var user = _getUser();
          var ref = firebase.database().ref('signals/' + uid).push();
          ref.set({
            type: 'invite',
            uid: user.uid,
            cid: ref.key,
            audio: opt.audio,
            video: opt.video,
            dataChannel: !!opt.dataChannel
          }).then(function () {
            ref.onDisconnect().remove();
            resolve(ref.key);
          });
        });
      }
    }, {
      key: 'sendAccept',
      value: function sendAccept(uid, cid, opt) {
        return new Promise(function (resolve, reject) {
          var user = _getUser();
          var ref = firebase.database().ref('signals/' + uid).push();
          ref.set({
            type: 'accept',
            uid: user.uid,
            cid: cid,
            audio: opt.audio,
            video: opt.video
          }).then(function () {
            resolve();
          });
        });
      }
    }, {
      key: 'sendReject',
      value: function sendReject(uid, cid, reason) {
        return new Promise(function (resolve, reject) {
          var user = _getUser();
          var ref = firebase.database().ref('signals/' + uid).push();
          ref.set({
            type: 'reject',
            uid: user.uid,
            cid: cid,
            reason: reason
          }).then(function () {
            resolve();
          });
        });
      }
    }, {
      key: 'sendReconnect',
      value: function sendReconnect(uid, cid, opt) {
        return new Promise(function (resolve, reject) {
          var user = _getUser();
          var ref = firebase.database().ref('signals/' + uid).push();
          ref.set({
            type: 'reconnect',
            uid: user.uid,
            cid: cid,
            audio: opt.audio,
            video: opt.video,
            dataChannel: !!opt.dataChannel
          }).then(function () {
            resolve();
          });
        });
      }
    }, {
      key: 'sendClose',
      value: function sendClose(uid, cid) {
        return new Promise(function (resolve, reject) {
          var user = _getUser();
          var ref = firebase.database().ref('signals/' + uid).push();
          ref.set({
            type: 'close',
            uid: user.uid,
            cid: cid
          }).then(function () {
            resolve();
          });
        });
      }
    }, {
      key: 'sendSignaling',
      value: function sendSignaling(uid, cid, type, data) {
        return new Promise(function (resolve, reject) {
          var user = _getUser();
          var ref = firebase.database().ref('signals/' + uid).push();
          ref.set({
            type: 'signaling',
            signalingType: type,
            uid: user.uid,
            cid: cid,
            data: JSON.stringify(data)
          }).then(function () {
            resolve();
          });
        });
      }

      /*
       * Firebase Database: Simple Data Store Sharing
       */

    }, {
      key: 'openDataStore',
      value: function openDataStore(scope, name) {
        var user = _getUser();
        var ref = firebase.database().ref('datastorescopes/' + user.uid + '/' + name);
        return ref.once('value').then(function (data) {
          var val = data.val();
          return val || ref.set(scope).then(function () {
            return scope;
          });
        });
      }
    }, {
      key: 'removeDataStore',
      value: function removeDataStore(name) {
        var user = _getUser();
        var dataRef = firebase.database().ref('datastore/' + user.uid + '/' + name);
        var scopeRef = firebase.database().ref('datastorescopes/' + user.uid + '/' + name);
        return dataRef.remove().then(function () {
          return scopeRef.remove();
        });
      }
    }, {
      key: 'putDataElement',
      value: function putDataElement(name, key, data, scope) {
        var user = _getUser();
        var ref = firebase.database().ref('datastore/' + user.uid + '/' + name + '/' + key);
        return ref.set(data);
      }
    }, {
      key: 'getDataElement',
      value: function getDataElement(name, key) {
        var user = _getUser();
        var ref = firebase.database().ref('datastore/' + user.uid + '/' + name + '/' + key);
        return ref.once('value').then(function (data) {
          if (data) return { key: data.key, data: data.val() };else throw new Error('no such key in the data store');
        });
      }
    }, {
      key: 'getAllDataElements',
      value: function getAllDataElements(name) {
        var user = _getUser();
        var ref = firebase.database().ref('datastore/' + user.uid + '/' + name);
        return ref.once('value').then(function (data) {
          return data.val();
        });
      }
    }, {
      key: 'removeDataElement',
      value: function removeDataElement(name, key) {
        var user = _getUser();
        var ref = firebase.database().ref('datastore/' + user.uid + '/' + name + '/' + key);
        return ref.remove();
      }
    }, {
      key: 'removeAllDataElements',
      value: function removeAllDataElements(name) {
        var user = _getUser();
        var ref = firebase.database().ref('datastore/' + user.uid + '/' + name);
        return ref.remove();
      }
    }, {
      key: 'observeDataStore',
      value: function observeDataStore(uid, name) {
        var ref = void 0;
        if (uid in dataObserverRef && name in dataObserverRef[uid]) ref = dataObserverRef[uid][name];else {
          ref = firebase.database().ref('datastore/' + uid + '/' + name);
          ref.on('child_added', firebaseObserveElementAdd);
          ref.on('child_changed', firebaseObserveElementUpdate);
          ref.on('child_removed', firebaseObserveElementRemove);
          if (!(uid in dataObserverRef)) dataObserverRef[uid] = {};
          dataObserverRef[uid][name] = ref;
        }
        return Promise.resolve({ uid: uid, name: name });
      }
    }, {
      key: 'disconnectDataStoreObserver',
      value: function disconnectDataStoreObserver(uid, name) {
        var ref = void 0;
        if (uid in dataObserverRef && name in dataObserverRef[uid]) {
          ref = dataObserverRef[uid][name];
          ref.off('child_added', firebaseObserveElementAdd);
          ref.off('child_changed', firebaseObserveElementUpdate);
          ref.off('child_removed', firebaseObserveElementRemove);
          delete dataObserverRef[uid][name];
        }
      }
    }]);

    return FirebaseProvider;
  }(ItoProvider);

  self.ito.provider.firebase = new FirebaseProvider(self.ito);
  var provider = self.ito.provider.firebase;

  /*
   * Internal functions
   */

  /*
   * Firebase Login
   */
  function _getUser() {
    return firebase.auth().currentUser;
  }

  /*
   * Firebase Database: User Accounts and Status
   */
  function firebaseEscape(s) {
    return s ? s.replace(/[\W_]/g, function (c) {
      return '%' + c.charCodeAt(0).toString(16);
    }) : null;
  }

  function firebaseCheckAdministrator() {
    var user = _getUser();
    return firebase.database().ref('administrators/' + firebaseEscape(_email)).once('value').then(function (v) {
      isAdmin = !!v && v.val() === true;
    }, function () {
      isAdmin = false;
    });
  }

  function firebaseCheckExistingPasscode() {
    var user = _getUser();
    var passRef = firebase.database().ref('passcodes/' + user.uid);
    return passRef.once('value').then(function (v) {
      passcode = v ? v.val() : null;
    });
  }

  function firebaseSetProfile(createOnly) {
    var user = _getUser();
    _email = _email || user.uid;
    userName = user.displayName || _email;
    var prof = {
      userName: userName,
      email: _email,
      emailEscaped: firebaseEscape(_email),
      status: isOnline ? 'online' : 'offline'
    };
    var p = firebase.database().ref('users/' + user.uid).set(prof).then(firebase.database().ref('emails/' + firebaseEscape(_email)).set(user.uid)).then(firebaseCheckAdministrator);
    if (!createOnly) firebaseOnOnline();
    return p.then(function () {
      return prof;
    });
  }

  function firebaseGetProfile() {
    return new Promise(function (resolve, reject) {
      var user = _getUser();
      isOnline = true;
      firebase.database().ref('users/' + user.uid).once('value', function (snapshot) {
        _email = snapshot.val().email;
        userName = user.displayName || _email;
        firebase.database().ref('users/' + user.uid + '/status').set('online').then(firebase.database().ref('emails/' + firebaseEscape(_email)).set(user.uid)).then(firebaseCheckAdministrator).then(firebaseCheckExistingPasscode).then(firebaseOnOnline).then(resolve);
      });
    });
  }

  function firebaseGetFriendProfile(uid) {
    return new Promise(function (resolve, reject) {
      firebase.database().ref('users/' + uid).once('value', function (snapshot) {
        resolve(snapshot.val());
      });
    });
  }

  function firebaseOnRequest(usePasscode, data) {
    if (data) {
      var v = data.val();
      var r = data.ref;
      switch (v.type) {
        case 'request':
          provider.onRequest(data.key, {
            userName: v.userName,
            uid: v.uid,
            email: v.email
          }, usePasscode, v.options || null);
          break;
        case 'accept':
          _dropRequest(data.key, usePasscode).then(function () {
            return firebaseAddFriend(v.uid);
          }).then(function () {
            firebaseSetFriendChangedRef(v.requestKey, v.uid);
            provider.onAccept(v.requestKey, {
              userName: v.userName,
              uid: v.uid,
              email: v.email
            });
            notifyFriendAdded(v.requestKey, firebaseEscape(v.email));
          });
          break;
        case 'reject':
          _dropRequest(data.key, usePasscode).then(function () {
            provider.onReject(v.requestKey);
          });
          break;
        case 'addfriend':
          _dropRequest(data.key, false).then(function () {
            firebase.database().ref('users/' + v.uid).once('value', function () {
              firebaseSetFriendChangedRef(v.requestKey, v.uid);
            }, function () {
              throw new Error('Unexpected internal message (addfriend)');
            });
          });
          break;
        case 'remove':
          firebaseRemoveFriend(v.uid);
          _dropRequest(data.key, usePasscode);
          break;
      }
    }
  }

  function checkRevokedRequests(data) {
    var val = data.val();
    var r = data.ref;
    return val ? Object.keys(val).reduce(function (p, k) {
      var v = val[k];
      if (v.uid) {
        return p.then(firebase.database().ref('users/' + v.uid).once('value').then(function (d) {
          if (!d || !d.val()) {
            r.child(k).remove();
            firebase.database().ref('requestKeys/' + v.uid + '/' + escaped).remove();
          }
        }, function () {/* Removal of the user might be in progress... */}));
      } else return p;
    }, Promise.resolve()) : Promise.resolve();
  }

  function firebaseSetRequestRef() {
    var _this4 = this;

    var escaped = firebaseEscape(_email);
    requestRef = firebase.database().ref('requests/' + escaped);
    requestRef.once('value').then(checkRevokedRequests).then(function () {
      requestRef.on('child_added', firebaseOnRequest.bind(_this4, false));
    }).then(function () {
      if (passcode) {
        passcodesRef = firebase.database().ref('requests/' + passcode);
        return passcodesRef.once('value').then(checkRevokedRequests).then(function () {
          passcodesRef.on('child_added', firebaseOnRequest.bind(_this4, true));
        });
      }
    });
  }

  function firebaseSetPasscodeRef(pass) {
    var _this5 = this;

    return new Promise(function (resolve, reject) {
      if (passcode === pass) {
        resolve();
      } else if (!pass) {
        firebaseResetPasscodeRef();
        resolve();
      } else {
        var _user = _getUser();
        if (pass) firebaseResetPasscodeRef();
        var passRef = firebase.database().ref('passcodes/' + _user.uid);
        return passRef.set(pass).then(function () {
          passcode = pass;
          var regRef = firebase.database().ref('passcodeReg/' + pass);
          regRef.set(true).then(function () {
            passcodesRef = firebase.database().ref('requests/' + pass);
            passcodesRef.on('child_added', firebaseOnRequest.bind(_this5, true));
            resolve();
          });
        }, function () {
          reject(new Error('the specified passcode is already used'));
        });
      }
    });
  }

  function firebaseResetRequestRef() {
    if (requestRef) {
      requestRef.off('child_added');
      requestRef = null;
    }
    firebaseResetPasscodeRef();
  }

  function firebaseResetPasscodeRef(isOffline) {
    if (passcode && !isOffline) {
      var _user2 = _getUser();
      firebase.database().ref('passcodeReg/' + passcode).remove().then(firebase.database().ref('passcodes/' + _user2.uid).remove());
      passcode = null;
    }
    if (passcodesRef) {
      passcodesRef.off('child_added');
      passcodesRef = null;
    }
  }

  function firebaseSetFriendChangedRef(requestKey, key) {
    var _this6 = this;

    firebaseGetFriendProfile(key).then(function (friend) {
      profilesRef[key] = firebase.database().ref('users/' + key);
      profilesRef[key].on('child_changed', function (k, d) {
        var arg = {};
        arg[d.key] = d.val();
        provider.onUpdateFriend(key, arg);
      }.bind(_this6, key));
      if (friend) provider.onAddFriend(requestKey, key, friend);else firebase.database().ref('friends/' + user.uid + '/' + key).remove();
    });
  }

  function firebaseSetFriendsRef() {
    var user = _getUser();
    friendsRef = firebase.database().ref('friends/' + user.uid);
    friendsRef.once('value', function (data) {
      var val = data.val();
      if (val) {
        Object.keys(val).forEach(function (uid) {
          firebaseSetFriendChangedRef(null, uid);
        });
      }
    });
    friendsRef.on('child_removed', function (data) {
      var key = data.key;
      if (profilesRef[key]) {
        profilesRef[key].off('child_changed');
        delete profilesRef[key];
        provider.onRemoveFriend(key);
      }
    });
  }

  function firebaseResetFriendsRef() {
    if (friendsRef) {
      Object.keys(profilesRef).forEach(function (i) {
        profilesRef[i].off('child_changed');
      });
      profilesRef = {};
      friendsRef.off('child_added');
      friendsRef.off('child_removed');
      friendsRef = null;
    }
  }

  function _dropRequest(key, usePasscode) {
    var ref = usePasscode ? passcodesRef : requestRef;
    return ref ? ref.child(key).remove() : Promise.reject(new Error('internal error (firebaseDropRequest)'));
  }

  function notifyFriendAdded(k, m) {
    var user = _getUser();
    var ref = firebase.database().ref('requests/' + firebaseEscape(m)).push();
    return ref.set({
      type: 'addfriend',
      uid: user.uid,
      requestKey: k
    });
  }

  function firebaseFinishRequest(m, uid) {
    var user = _getUser();
    return firebase.database().ref('requestKeys/' + uid + '/' + m).remove();
  }

  function firebaseAddFriend(uid) {
    var user = _getUser();
    return firebase.database().ref('friends/' + user.uid + '/' + uid).set(true);
  }

  function firebaseRemoveFriend(uid) {
    var user = _getUser();
    return firebase.database().ref('friends/' + user.uid + '/' + uid).remove();
  }

  function firebaseSetOnDisconnectRef() {
    var user = _getUser();
    disconnectRef = firebase.database().ref('users/' + user.uid + '/status');
    disconnectRef.onDisconnect().remove();
    disconnectRef.onDisconnect().set('offline');
  }

  function firebaseResetOnDisconnectRef() {
    if (disconnectRef) {
      var p = disconnectRef.set('offline');
      disconnectRef.onDisconnect().cancel();
      disconnectRef = null;
      return p;
    } else return Promise.resolve();
  }

  function firebaseOnOnline() {
    firebaseSetRequestRef();
    firebaseSetFriendsRef();
    firebaseSetMessagesRef();
    firebaseSetSignalsRef();
    firebaseSetNotificationsRef();
  }

  function firebaseSetOffline() {
    isOnline = false;
    return firebaseResetOnDisconnectRef().then(function () {
      firebaseResetRequestRef();
      firebaseResetFriendsRef();
      firebaseResetMessagesRef();
      firebaseResetSignalsRef();
      firebaseResetNotificationsRef();
    });
  }

  function firebaseDeleteProfile() {
    var user = _getUser();
    return firebase.database().ref('users/' + user.uid).remove();
  }

  /*
   * Firebase Database: Chat Messages
   */
  function firebaseSetMessagesRef() {
    var user = _getUser();
    messagesRef = firebase.database().ref('messages/' + user.uid);
    messagesRef.on('child_added', function (data) {
      var key = data.key;
      var v = data.val();
      messagesRef.child(key).remove();
      switch (v.type) {
        case 'message':
          provider.onMessage(v.uid, v.data);
          firebase.database().ref('messages/' + v.uid).push().set({
            type: 'ack',
            uid: v.uid,
            messageKey: key
          });
          break;
        case 'ack':
          provider.onMessageAck(v.uid, v.messageKey);
          break;
      }
    });
  }

  function firebaseResetMessagesRef() {
    if (messagesRef) {
      messagesRef.off('child_added');
      messagesRef = null;
    }
  }

  /*
   * Firebase Database: Notifications
   */
  function firebaseGetLastNotificationChecked() {
    return firebase.database().ref('lastNotificationChecked/' + _getUser().uid).once('value').then(function (data) {
      lastNotificationChecked = data.val();
    });
  }

  function firebaseClearOldNotifications() {
    return isAdmin ? notificationsRef.endAt(Date.now() - 14 * 24 * 60 * 60 * 1000, 'timestamp').once('value').then(function (data) {
      if (data) {
        var v = data.val();
        if (v) {
          Object.keys(v).forEach(function (k) {
            data.ref.child(k).remove();
          });
        }
      }
    }) : Promise.resolve();
  }

  function firebaseCheckNotifications() {
    return firebaseGetLastNotificationChecked().then(function () {
      return lastNotificationChecked ? notificationsRef.startAt(lastNotificationChecked - 1, 'timestamp').once('value') : notificationsRef.startAt(Date.now() - 14 * 24 * 60 * 60 * 1000 - 1, 'timestamp').once('value');
    }).then(function (data) {
      if (data) {
        var v = data.val();
        if (v) {
          provider.onNotification(Object.keys(v).map(function (k) {
            return v[k];
          }).sort(function (a, b) {
            return a.timestamp < b.timestamp ? -1 : 1;
          }));
        }
      } else return null;
    }, function () {});
  }

  function firebaseSetNotificationTimestamp() {
    return firebase.database().ref('lastNotificationChecked/' + _getUser().uid).set(firebase.database.ServerValue.TIMESTAMP).then(firebaseGetLastNotificationChecked);
  }

  function firebaseSetNotificationsRef() {
    var user = _getUser();
    notificationsRef = firebase.database().ref('notifications').orderByChild('timestamp');
    firebaseCheckNotifications().then(firebaseSetNotificationTimestamp).then(firebaseClearOldNotifications).then(function () {
      notificationsRef.startAt(lastNotificationChecked - 1, 'timestamp').on('child_added', function (data) {
        var key = data.key;
        var v = data.val();
        firebaseSetNotificationTimestamp();
        provider.onNotification([v]);
      });
    });
  }

  function firebaseResetNotificationsRef() {
    if (notificationsRef) {
      notificationsRef.off('child_added');
      notificationsRef = null;
    }
  }

  /*
   * Firebase Database: WebRTC Signaling Messages
   */
  function firebaseSetSignalsRef() {
    var user = _getUser();
    signalsRef = firebase.database().ref('signals/' + user.uid);
    signalsRef.on('child_added', function (data) {
      var key = data.key;
      var v = data.val();
      signalsRef.child(key).remove();
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

  function firebaseResetSignalsRef() {
    if (signalsRef) {
      signalsRef.off('child_added');
      signalsRef = null;
    }
  }

  /*
   * Firebase Database: Simple Data Store Sharing
   */

  function firebaseObserveElementAdd(data) {
    var uid = data.ref.parent.parent.key;
    var name = data.ref.parent.key;
    provider.onElementAdd(uid, name, data.key, data.val());
  }

  function firebaseObserveElementUpdate(data) {
    var uid = data.ref.parent.parent.key;
    var name = data.ref.parent.key;
    provider.onElementUpdate(uid, name, data.key, data.val());
  }

  function firebaseObserveElementRemove(data) {
    var uid = data.ref.parent.parent.key;
    var name = data.ref.parent.key;
    provider.onElementRemove(uid, name, data.key);
  }

  if (!isBrowser) module.exports = self.ito;
})((typeof window === 'undefined' ? 'undefined' : _typeof(window)) === 'object' ? window : global, (typeof window === 'undefined' ? 'undefined' : _typeof(window)) === 'object');


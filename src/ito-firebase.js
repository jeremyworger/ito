/*
 * Copyright 2017 KDDI Research, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

((self, isBrowser) => {
  if(!isBrowser) {
    self.ItoProvider = self.ito.ItoProvider;
  }

  if(!self.ito) {
    throw new Error('Ito base library has not been loaded yet.');
  }

  /*
   * Global variables
   */
  let signin = null;
  let credential = null;
  let initResolve = null;
  let isOnline = false;
  let email = null;
  let userName = null;

  let disconnectRef = null;
  let requestRef = null;
  let friendsRef = null;
  let profilesRef = {};
  let isAdmin = false;
  let passcodesRef = null;
  let passcode = null;

  let messagesRef = null;

  let notificationsRef = null;
  let lastNotificationChecked = null;

  let signalsRef = null;

  let dataObserverRef = {};

  if(!self.ito.provider)
    self.ito.provider = {};

  class FirebaseProvider extends ItoProvider {
    constructor(parent) {
      super(parent);
      this.signIn = {
        anonymous: () => {
          return firebase.auth().signInAnonymously().then(() => {
            isOnline = true;
            return firebaseSetProfile();
          });
        },
        google: () => {
          signin = new firebase.auth.GoogleAuthProvider();
          signin.addScope('email');
          return new Promise((resolve, reject) => {
            firebase.auth().signInWithPopup(signin).then(result => {
              credential = result.credential;
              fetch('https://www.googleapis.com/userinfo/v2/me',
                { headers: { Authorization: 'Bearer ' + credential.accessToken }}
              ).then(response => {
                return response.json();
              }).then(json => {
                email = json.email;
                isOnline = true;
                return firebaseSetProfile();
              }).then(p => {
                resolve(p);
              });
            }, error => {
              reject(error);
            })
          });
        },
        facebook: () => {
          signin = new firebase.auth.FacebookAuthProvider();
          signin.addScope('email');
          return new Promise((resolve, reject) => {
            firebase.auth().signInWithPopup(signin).then(result => {
              credential = result.credential;
              fetch('https://graph.facebook.com/v2.7/me?fields=email&access_token=' + credential.accessToken
              ).then(response => {
                return response.json();
              }).then(json => {
                email = json.email;
                isOnline = true;
                return firebaseSetProfile();
              }).then(p => {
                resolve(p);
              });
            }, error => {
              reject(error);
            })
          });
        },
        email: (id, pass) => {
          return new Promise((resolve, reject) => {
            firebase.auth().signInWithEmailAndPassword(id, pass).then(user => {
              email = user.email;
              isOnline = true;
              resolve(firebaseSetProfile());
            });
          }, error => {
            reject(error);
          });
        }
      };
    }

    /*
     * Firebase Login
     */
    load(url) {
      // Initialize Firebase client
      if(!self.firebase) {
        // Browser
        if(isBrowser) {
          let h = document.querySelector('head');
          return new Promise((resolve, reject) => {
            let s = document.createElement('script');
            s.src = url || 'https://www.gstatic.com/firebasejs/3.6.4/firebase.js';
            s.addEventListener('load', () => { resolve(); });
            s.addEventListener('error', () => {
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
      }
      else
        return Promise.resolve();
    }

    init(arg) {
      return new Promise((resolve, reject) => {
        initResolve = resolve;
        firebase.initializeApp({
          apiKey: arg.apiKey,
          authDomain: arg.authDomain,
          databaseURL: arg.databaseURL
        });
        firebase.auth().onAuthStateChanged(user => {
          let b = !!user;
          if(initResolve) {
            let r = initResolve;
            initResolve = null;
            if(user)
              firebaseGetProfile()
                .then(firebaseSetOnDisconnectRef)
                .then(() => { r(b); });
            else
              r(b);
          }
          else {
            if(user)
              firebaseSetOnDisconnectRef();
            this.onOnline(b);
          }

          // Disconnect/Reconnect to Firebase
          firebase.database().ref('.info/connected').on('value', snapshot => {
            if(snapshot.val() === true) {
              if(disconnectRef && getUser()) {
                disconnectRef.set('online');
                firebaseSetOnDisconnectRef();
                if(passcode) {
                  let p = passcode;
                  passcode = null;
                  firebaseSetPasscodeRef(p);
                }
              }
              this.onOnline(!!getUser());
            }
            else {
              firebaseResetPasscodeRef(true);
              this.onDisconnect();
            }
          });
        });
      });
    }

    getUser() {
      let user = getUser();
      return user ? {
        userName: userName,
        email: email,
        isAnonymous: user.isAnonymous,
        uid: user.uid
      } : null;
    }

    createUser(id, pass) {
      let user = getUser();
      return user ?
        Promise.reject(new Error('already signed in')) :
        new Promise((resolve, reject) => {
          firebase.auth().createUserWithEmailAndPassword(id, pass).then(user => {
            email = user.email || user.uid;
            return firebaseSetProfile(true);
          }).then(p => {
            this.signOut().then(() => {
              resolve(p);
            });
          });
        });
    }

    updateUserName(name) {
      let user = getUser();
      return user ? user.updateProfile({
        displayName: name
      }).then(() => {
        let user = getUser();
        userName = user.displayName || email;
        return firebaseSetProfile(true);
      }) : Promise.reject(new Error('not signed in'));
    }

    signOut() {
      return new Promise((resolve, reject) => {
        firebaseSetOffline().then(() => {
          let user = getUser();
          if(user && user.isAnonymous) {
            return firebase.database().ref('lastNotificationChecked/' + user.uid).remove()
              .then(firebase.database().ref('emails/' + firebaseEscape(email)).remove())
              .then(firebaseDeleteProfile())
              .then(() => {
                user.delete();
                email = null;
                userName = null;
              });
          }
          else
            return firebase.auth().signOut();
        }).then(() => {
          resolve();
        }, error => {
          reject(error);
        })
      });
    }

    /*
     * Firebase Database: User Accounts and Status
     */
    getPasscode() {
      return passcode;
    }

    setPasscode(pass) {
      return firebaseSetPasscodeRef(pass);
    }

    sendRequest(m, opt) {
      return new Promise((resolve, reject) => {
        let user = getUser();
        let e = firebaseEscape(m);
        let ref = firebase.database().ref('requests/' + e).push();
        firebase.database().ref('requestKeys/' + user.uid + '/' + e).set(ref.key).then(() => {
          let arg = {
            type: 'request',
            email: email,
            userName: user.displayName,
            uid: user.uid
          };
          if(opt)
            arg.options = opt;
          return ref.set(arg);
        }).then(() => {
          resolve(ref.key);
        }, () => {
          reject(new Error('No user for requested email address or passcode exists.'));
        });
      });
    }

    sendRemove(uid, m) {
      return new Promise((resolve, reject) => {
        let user = getUser();
        let e = firebaseEscape(m);
        let ref = firebase.database().ref('requests/' + e).push();
        firebase.database().ref('friends/' + user.uid + '/' + uid).remove().then(() => {
          return ref.set({
            type: 'remove',
            uid: user.uid
          });
        }).then(() => {
          resolve();
        })
      });
    }

    dropRequest(key, passcode) {
      dropRequest(key, passcode);
    }

    acceptRequest(key, m, uid, usePasscode) {
      return new Promise((resolve, reject) => {
        let user = getUser();
        let ref = firebase.database().ref('requests/' + firebaseEscape(m)).push();
        firebaseAddFriend(uid).then(() => {
          let arg = {
            type: 'accept',
            email: email,
            userName: user.displayName,
            uid: user.uid,
            requestKey: key
          };
          if(usePasscode) {
            arg.passcode = passcode;
            firebaseResetPasscodeRef();
          }
          return ref.set(arg);
        }).then(
          firebaseFinishRequest(usePasscode ? passcode : firebaseEscape(email), uid)
        ).then(() => {
          resolve();
        });
      });
    }

    rejectRequest(key, m, uid, usePasscode) {
      return new Promise((resolve, reject) => {
        let ref = firebase.database().ref('requests/' + firebaseEscape(m)).push();
        let arg = {
          type: 'reject',
          requestKey: key
        };
        if(usePasscode)
          arg.passcode = passcode;
        else
          arg.email = email;
        ref.set(arg).then(
          firebaseFinishRequest(usePasscode ? passcode : firebaseEscape(email), uid)
        ).then(() => {
          resolve();
        });
      });
    }

    /*
     * Firebase Database: Chat Messages
     */
    sendMessage(uid, msg) {
      let user = getUser();
      if(messagesRef) {
        let ref = firebase.database().ref('messages/' + uid).push();
        return ref.set({
          type: 'message',
          uid: user.uid,
          data: msg
        }).then(() => {
          return { uid: uid, messageKey: ref.key };
        });
      }
      else {
        return Promise.reject(new Error('cannot send message: not online'));
      }
    }

    /*
     * Firebase Database: Notifications
     */
    sendNotification(msg) {
      return new Promise((resolve, reject) => {
        let ref = firebase.database().ref('notifications').push();
        ref.set({
          data: msg,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
          firebaseClearOldNotifications();
          resolve();
        }, () => {
          reject(new Error('the current user is not permitted to send a notification'));
        });
      });
    }

    /*
     * Firebase Database: WebRTC Signaling Messages
     */
    sendInvite(uid, opt) {
      return new Promise((resolve, reject) => {
        let user = getUser();
        let ref = firebase.database().ref('signals/' + uid).push();
        ref.set({
          type: 'invite',
          uid: user.uid,
          cid: ref.key,
          audio: opt.audio,
          video: opt.video,
          dataChannel: !!opt.dataChannel
        }).then(() => {
          ref.onDisconnect().remove();
          resolve(ref.key);
        })
      });
    }

    sendAccept(uid, cid, opt) {
      return new Promise((resolve, reject) => {
        let user = getUser();
        let ref = firebase.database().ref('signals/' + uid).push();
        ref.set({
          type: 'accept',
          uid: user.uid,
          cid: cid,
          audio: opt.audio,
          video: opt.video
        }).then(() => {
          resolve();
        })
      });
    }

    sendReject(uid, cid, reason) {
      return new Promise((resolve, reject) => {
        let user = getUser();
        let ref = firebase.database().ref('signals/' + uid).push();
        ref.set({
          type: 'reject',
          uid: user.uid,
          cid: cid,
          reason: reason
        }).then(() => {
          resolve();
        })
      });
    }

    sendReconnect(uid, cid, opt) {
      return new Promise((resolve, reject) => {
        let user = getUser();
        let ref = firebase.database().ref('signals/' + uid).push();
        ref.set({
          type: 'reconnect',
          uid: user.uid,
          cid: cid,
          audio: opt.audio,
          video: opt.video,
          dataChannel: !!opt.dataChannel
        }).then(() => {
          resolve();
        });
      });
    }

    sendClose(uid, cid) {
      return new Promise((resolve, reject) => {
        let user = getUser();
        let ref = firebase.database().ref('signals/' + uid).push();
        ref.set({
          type: 'close',
          uid: user.uid,
          cid: cid
        }).then(() => {
          resolve();
        });
      });
    }

    sendSignaling(uid, cid, type, data) {
      return new Promise((resolve, reject) => {
        let user = getUser();
        let ref = firebase.database().ref('signals/' + uid).push();
        ref.set({
          type: 'signaling',
          signalingType: type,
          uid: user.uid,
          cid: cid,
          data: JSON.stringify(data)
        }).then(() => {
          resolve();
        });
      });
    }

    /*
     * Firebase Database: Simple Data Store Sharing
     */
    openDataStore(scope, name) {
      let user = getUser();
      let ref = firebase.database().ref(
        'datastorescopes/' + user.uid + '/' + name);
      return ref.once('value').then(data => {
        let val = data.val();
        return val || ref.set(scope).then(() => { return scope; });
      });
    }

    removeDataStore(name) {
      let user = getUser();
      let dataRef = firebase.database().ref(
        'datastore/' + user.uid + '/' + name);
      let scopeRef = firebase.database().ref(
        'datastorescopes/' + user.uid + '/' + name);
      return dataRef.remove().then(() => {
        return scopeRef.remove();
      });
    }

    putDataElement(name, key, data) {
      let user = getUser();
      let ref = firebase.database().ref(
        'datastore/' + user.uid + '/' + name + '/' + key);
      return ref.set(data);
    }

    getDataElement(name, key) {
      let user = getUser();
      let ref = firebase.database().ref(
        'datastore/' + user.uid + '/' + name + '/' + key);
      return ref.once('value').then(data => {
        if(data)
          return { key: data.key, data: data.val() };
        else
          throw new Error('no such key in the data store');
      });
    }

    getAllDataElements(name) {
      let user = getUser();
      let ref = firebase.database().ref(
        'datastore/' + user.uid + '/' + name);
      return ref.once('value').then(data => {
        return data.val();
      });
    }

    removeDataElement(name, key) {
      let user = getUser();
      let ref = firebase.database().ref(
        'datastore/' + user.uid + '/' + name + '/' + key);
      return ref.remove();
    }

    removeAllDataElements(name) {
      let user = getUser();
      let ref = firebase.database().ref('datastore/' + user.uid + '/' + name);
      return ref.remove();
    }

    observeDataStore(uid, name) {
      let ref;
      if(uid in dataObserverRef && name in dataObserverRef[uid])
        ref = dataObserverRef[uid][name];
      else {
        ref = firebase.database().ref('datastore/' + uid + '/' + name);
        ref.on('child_added', firebaseObserveElementAdd);
        ref.on('child_changed', firebaseObserveElementUpdate);
        ref.on('child_removed', firebaseObserveElementRemove);
        if(!(uid in dataObserverRef))
          dataObserverRef[uid] = {};
        dataObserverRef[uid][name] = ref;
      }
      return Promise.resolve({ uid: uid, name: name });
    };

    disconnectDataStoreObserver(uid, name) {
      let ref;
      if(uid in dataObserverRef && name in dataObserverRef[uid]) {
        ref = dataObserverRef[uid][name];
        ref.off('child_added', firebaseObserveElementAdd);
        ref.off('child_changed', firebaseObserveElementUpdate);
        ref.off('child_removed', firebaseObserveElementRemove);
        delete dataObserverRef[uid][name];
      }
    }
  }
  self.ito.provider.firebase = new FirebaseProvider(self.ito);
  let provider = self.ito.provider.firebase;

  /*
   * Internal functions
   */

  /*
   * Firebase Login
   */
  function getUser() {
    return firebase.auth().currentUser;
  }

  /*
   * Firebase Database: User Accounts and Status
   */
  function firebaseEscape(s) {
    return s ? s.replace(/[\W_]/g, c=>{return '%' + c.charCodeAt(0).toString(16);}) : null;
  }

  function firebaseCheckAdministrator() {
    let user = getUser();
    return firebase.database().ref('administrators/' + firebaseEscape(email))
      .once('value').then(v => {
        isAdmin = !!v && v.val() === true;
      }, () => {
        isAdmin = false;
      });
  }

  function firebaseCheckExistingPasscode() {
    let user = getUser();
    let passRef = firebase.database().ref('passcodes/' + user.uid);
    return passRef.once('value').then(v => {
      passcode = v ? v.val() : null;
    });
  }

  function firebaseSetProfile(createOnly) {
    let user = getUser();
    email = email || user.uid;
    userName = user.displayName || email;
    let prof = {
      userName: userName,
      email: email,
      emailEscaped: firebaseEscape(email),
      status: isOnline ? 'online' : 'offline'
    };
    let p = firebase.database().ref('users/' + user.uid).set(prof)
      .then(firebase.database().ref('emails/' + firebaseEscape(email)).set(user.uid))
      .then(firebaseCheckAdministrator);
    if(!createOnly)
      firebaseOnOnline();
    return p.then(() => { return prof; });
  }

  function firebaseGetProfile() {
    return new Promise((resolve, reject) => {
      let user = getUser();
      isOnline = true;
      firebase.database().ref('users/' + user.uid).once('value', snapshot => {
        email = snapshot.val().email;
        userName = user.displayName || email;
        firebase.database().ref('users/' + user.uid + '/status').set('online')
          .then(firebase.database().ref('emails/' + firebaseEscape(email)).set(user.uid))
          .then(firebaseCheckAdministrator)
          .then(firebaseCheckExistingPasscode)
          .then(firebaseOnOnline)
          .then(resolve);
      });
    });
  }

  function firebaseGetFriendProfile(uid) {
    return new Promise((resolve, reject) => {
      firebase.database().ref('users/' + uid).once('value', snapshot => {
        resolve(snapshot.val());
      });
    });
  }

  function firebaseOnRequest(usePasscode, data) {
    if(data) {
      let v = data.val();
      let r = data.ref;
      switch(v.type) {
      case 'request':
        provider.onRequest(data.key, {
          userName: v.userName,
          uid: v.uid,
          email: v.email
        }, usePasscode, v.options || null);
        break;
      case 'accept':
        dropRequest(data.key, usePasscode).then(() => {
          return firebaseAddFriend(v.uid);
        }).then(() => {
          firebaseSetFriendChangedRef(v.uid);
          provider.onAccept(v.requestKey, {
            userName: v.userName,
            uid: v.uid,
            email: v.email
          });
          notifyFriendAdded(firebaseEscape(v.email));
        });
        break;
      case 'reject':
        dropRequest(data.key, usePasscode).then(() => {
          provider.onReject(v.requestKey);
        });
        break;
      case 'addfriend':
        dropRequest(data.key, false).then(() => {
          firebase.database().ref('users/' + v.uid).once('value', () => {
            firebaseSetFriendChangedRef(v.uid);
          }, () => {
            throw new Error('Unexpected internal message (addfriend)');
          });
        });
        break;
      case 'remove':
        firebaseRemoveFriend(v.uid);
        dropRequest(data.key, usePasscode);
        break;
      }
    }
  }

  function checkRevokedRequests(data) {
    let val = data.val();
    let r = data.ref;
    return val ? Object.keys(val).reduce((p, k) => {
      let v = val[k];
      if(v.uid) {
        return p.then(
          firebase.database().ref('users/' + v.uid).once('value').then(d => {
            if(!d || !d.val()) {
              r.child(k).remove();
              firebase.database().ref('requestKeys/' + v.uid + '/' + escaped).remove();
            }
          }, () => { /* Removal of the user might be in progress... */ })
        );
      }
      else
        return p;
    }, Promise.resolve()) : Promise.resolve();
  }

  function firebaseSetRequestRef() {
    let escaped = firebaseEscape(email);
    requestRef = firebase.database().ref('requests/' + escaped);
    requestRef.once('value').then(checkRevokedRequests).then(() => {
      requestRef.on('child_added', firebaseOnRequest.bind(this, false));
    }).then(() => {
      if(passcode) {
        passcodesRef = firebase.database().ref('requests/' + passcode);
        return passcodesRef.once('value').then(checkRevokedRequests).then(() => {
          passcodesRef.on('child_added', firebaseOnRequest.bind(this, true));
        });
      }
    })
  }

  function firebaseSetPasscodeRef(pass) {
    return new Promise((resolve, reject) => {
      if(passcode === pass) {
        resolve();
      }
      else if(!pass) {
        firebaseResetPasscodeRef();
        resolve();
      }
      else {
        let user = getUser();
        if(pass)
          firebaseResetPasscodeRef();
        let passRef = firebase.database().ref('passcodes/' + user.uid);
        return passRef.set(pass)
          .then(() => {
            passcode = pass;
            let regRef = firebase.database().ref('passcodeReg/' + pass);
            regRef.set(true).then(() => {
              passcodesRef = firebase.database().ref('requests/' + pass);
              passcodesRef.on('child_added', firebaseOnRequest.bind(this, true));
              resolve();
            });
          }, () => {
            reject(new Error('the specified passcode is already used'));
          });
      }
    });
  }

  function firebaseResetRequestRef() {
    if(requestRef) {
      requestRef.off('child_added');
      requestRef = null;
    }
    firebaseResetPasscodeRef();
  }

  function firebaseResetPasscodeRef(isOffline) {
    if(passcode && !isOffline) {
      let user = getUser();
      firebase.database().ref('passcodeReg/' + passcode).remove()
        .then(firebase.database().ref('passcodes/' + user.uid).remove());
      passcode = null;
    }
    if(passcodesRef) {
      passcodesRef.off('child_added');
      passcodesRef = null;
    }
  }

  function firebaseSetFriendChangedRef(key) {
    firebaseGetFriendProfile(key).then(friend => {
      profilesRef[key] = firebase.database().ref('users/' + key);
      profilesRef[key].on('child_changed', ((k, d) => {
        let arg = {};
        arg[d.key] = d.val();
        provider.onUpdateFriend(key, arg);
      }).bind(this, key));
      if(friend)
        provider.onAddFriend(key, friend);
      else
        firebase.database().ref('friends/' + user.uid + '/' + key).remove();
    })
  }

  function firebaseSetFriendsRef() {
    let user = getUser();
    friendsRef = firebase.database().ref('friends/' + user.uid);
    friendsRef.once('value', data => {
      let val = data.val();
      if(val) {
        Object.keys(val).forEach(uid => {
          firebaseSetFriendChangedRef(uid);
        });
      }
    });
    friendsRef.on('child_removed', data => {
      let key = data.key;
      if(profilesRef[key]) {
        profilesRef[key].off('child_changed');
        delete profilesRef[key];
        provider.onRemoveFriend(key);
      }
    });
  }

  function firebaseResetFriendsRef() {
    if(friendsRef) {
      Object.keys(profilesRef).forEach(i => {
        profilesRef[i].off('child_changed');
      });
      profilesRef = {};
      friendsRef.off('child_added');
      friendsRef.off('child_removed');
      friendsRef = null;
    }
  }

  function dropRequest(key, usePasscode) {
    let ref = usePasscode ? passcodesRef : requestRef;
    return ref ? ref.child(key).remove() : Promise.reject(new Error('internal error (firebaseDropRequest)'));
  }

  function notifyFriendAdded(m) {
    let user = getUser();
    let ref = firebase.database().ref('requests/' + firebaseEscape(m)).push();
    return ref.set({
      type: 'addfriend',
      uid: user.uid
    });
  }

  function firebaseFinishRequest(m, uid) {
    let user = getUser();
    return firebase.database().ref('requestKeys/' + uid + '/' + m).remove();
  }

  function firebaseAddFriend(uid) {
    let user = getUser();
    return firebase.database().ref('friends/' + user.uid + '/' + uid).set(true);
  }

  function firebaseRemoveFriend(uid) {
    let user = getUser();
    return firebase.database().ref('friends/' + user.uid + '/' + uid).remove();
  }

  function firebaseSetOnDisconnectRef() {
    let user = getUser();
    disconnectRef = firebase.database().ref('users/' + user.uid + '/status');
    disconnectRef.onDisconnect().remove();
    disconnectRef.onDisconnect().set('offline');
  }

  function firebaseResetOnDisconnectRef() {
    if(disconnectRef) {
      let p = disconnectRef.set('offline');
      disconnectRef.onDisconnect().cancel();
      disconnectRef = null;
      return p;
    }
    else
      return Promise.resolve();
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
    return firebaseResetOnDisconnectRef().then(() => {
      firebaseResetRequestRef();
      firebaseResetFriendsRef();
      firebaseResetMessagesRef();
      firebaseResetSignalsRef();
      firebaseResetNotificationsRef();
    });
  }

  function firebaseDeleteProfile() {
    let user = getUser();
    return firebase.database().ref('users/' + user.uid).remove();
  }

  /*
   * Firebase Database: Chat Messages
   */
  function firebaseSetMessagesRef() {
    let user = getUser();
    messagesRef = firebase.database().ref('messages/' + user.uid);
    messagesRef.on('child_added', data => {
      const key = data.key;
      let v = data.val();
      messagesRef.child(key).remove();
      switch(v.type) {
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
    if(messagesRef) {
      messagesRef.off('child_added');
      messagesRef = null;
    }
  }

  /*
   * Firebase Database: Notifications
   */
  function firebaseGetLastNotificationChecked() {
    return firebase.database().ref('lastNotificationChecked/' + getUser().uid).once('value').then(data => {
      lastNotificationChecked = data.val();
    });
  }

  function firebaseClearOldNotifications() {
    return isAdmin ?
      notificationsRef.endAt(Date.now() - 14*24*60*60*1000, 'timestamp').once('value').then(data => {
        if(data) {
          let v = data.val();
          if(v) {
            Object.keys(v).forEach(k => {
              data.ref.child(k).remove();
            });
          }
        }
      }) : Promise.resolve();
  }

  function firebaseCheckNotifications() {
    return firebaseGetLastNotificationChecked().then(() => {
      return lastNotificationChecked ?
        notificationsRef.startAt(lastNotificationChecked - 1, 'timestamp').once('value') :
        notificationsRef.startAt(Date.now() - 14*24*60*60*1000 - 1, 'timestamp').once('value');
    }).then(data => {
      if(data) {
        let v = data.val();
        if(v) {
          provider.onNotification(
            Object.keys(v).map(k => { return v[k]; }).sort((a, b) => {
              return a.timestamp < b.timestamp ? -1 : 1;
            })
          );
        }
      }
      else
        return null;
    }, () => {});
  }

  function firebaseSetNotificationTimestamp() {
    return firebase.database().ref('lastNotificationChecked/' + getUser().uid).set(
      firebase.database.ServerValue.TIMESTAMP).then(firebaseGetLastNotificationChecked);
  }

  function firebaseSetNotificationsRef() {
    let user = getUser();
    notificationsRef = firebase.database().ref('notifications').orderByChild('timestamp');
    firebaseCheckNotifications()
      .then(firebaseSetNotificationTimestamp)
      .then(firebaseClearOldNotifications)
      .then(() => {
        notificationsRef.startAt(lastNotificationChecked - 1, 'timestamp').on(
          'child_added',
          data => {
            const key = data.key;
            let v = data.val();
            firebaseSetNotificationTimestamp();
            provider.onNotification([v]);
          });
      });
  }

  function firebaseResetNotificationsRef() {
    if(notificationsRef) {
      notificationsRef.off('child_added');
      notificationsRef = null;
    }
  }

  /*
   * Firebase Database: WebRTC Signaling Messages
   */
  function firebaseSetSignalsRef() {
    let user = getUser();
    signalsRef = firebase.database().ref('signals/' + user.uid);
    signalsRef.on('child_added', data => {
      const key = data.key;
      let v = data.val();
      signalsRef.child(key).remove();
      switch(v.type) {
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
    if(signalsRef) {
      signalsRef.off('child_added');
      signalsRef = null;
    }
  }

  /*
   * Firebase Database: Simple Data Store Sharing
   */

  function firebaseObserveElementAdd(data) {
    let uid = data.ref.parent.parent.key;
    let name = data.ref.parent.key;
    provider.onElementAdd(uid, name, data.key, data.val());
  }

  function firebaseObserveElementUpdate(data) {
    let uid = data.ref.parent.parent.key;
    let name = data.ref.parent.key;
    provider.onElementUpdate(uid, name, data.key, data.val());
  }

  function firebaseObserveElementRemove(data) {
    let uid = data.ref.parent.parent.key;
    let name = data.ref.parent.key;
    provider.onElementRemove(uid, name, data.key);
  }

  if(!isBrowser)
    module.exports = self.ito;
})((typeof window === 'object' ? window : global), typeof window === 'object');
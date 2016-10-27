'use strict';

((self, isBrowser) => {
  if(!isBrowser) {
    self.ito = require('./ito.js');
    self.ItoProvider = self.ito.ItoProvider;
  }

  if(!self.ito) {
    throw new Error('Ito base library has not been loaded yet.');
  }

  if(!ito.provider)
    ito.provider = {};
  function FirebaseProvider() {};
  Object.setPrototypeOf(FirebaseProvider.prototype, ItoProvider.prototype);
  ito.provider.firebase = new FirebaseProvider();
  let firebaseProvider = ito.provider.firebase;

  /*
   * Firebase Login
   */
  let provider = null;
  let credential = null;
  let initResolve = null;
  let email = null;
  let userName = null;

  firebaseProvider.load = () => {
    // Initialize Firebase client
    if(!self.firebase) {
      // Browser
      if(isBrowser) {
        let h = document.querySelector('head');
        return Promise.all(['app', 'auth', 'database'].map(i => {
          return new Promise((resolve, reject) => {
            let s = document.createElement('script');
            s.src = 'https://www.gstatic.com/firebasejs/3.3.0/firebase-' + i + '.js';
            s.addEventListener('load', () => { resolve(); });
            s.addEventListener('error', () => { reject(); });
            h.appendChild(s);
          });
        }));
      }
      // Node.js
      else {
        self.firebase = require('firebase');
        return Promise.resolve();
      }
    }
    else
      return Promise.resolve();
  };

  firebaseProvider.init = arg => {
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
              .then(r.bind(this, b));
          else
            r(b);
        }
        else {
          if(user)
            firebaseSetOnDisconnectRef();
          firebaseProvider.onOnline(b);
        }

        firebase.database().ref('.info/connected').on('value', snapshot => {
          if(snapshot.val() === true) {
            if(disconnectRef && getUser()) {
              disconnectRef.set('online');
              firebaseSetOnDisconnectRef();
            }
            firebaseProvider.onOnline(!!getUser());
          }
          else
            firebaseProvider.onDisconnect();
        });
      });
    });
  }

  function getUser() {
    return firebase.auth().currentUser;
  }
  firebaseProvider.getUser = () => {
    let user = getUser();
    return user ? {
      userName: userName,
      email: email,
      isAnonymous: user.isAnonymous,
      uid: user.uid
    } : null;
  };

  firebaseProvider.signIn = {
    anonymous: () => {
      return firebase.auth().signInAnonymously().then(() => {
        return firebaseSetProfile();
      });
    },
    google: () => {
      provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      return new Promise((resolve, reject) => {
        firebase.auth().signInWithPopup(provider).then(result => {
          credential = result.credential;
          fetch('https://www.googleapis.com/userinfo/v2/me',
            { headers: { Authorization: 'Bearer ' + credential.accessToken }}
          ).then(response => {
            return response.json();
          }).then(json => {
            email = json.email;
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
      provider = new firebase.auth.FacebookAuthProvider();
      provider.addScope('email');
      return new Promise((resolve, reject) => {
        firebase.auth().signInWithPopup(provider).then(result => {
          credential = result.credential;
          fetch('https://graph.facebook.com/v2.7/me?fields=email&access_token=' + credential.accessToken
          ).then(response => {
            return response.json();
          }).then(json => {
            email = json.email;
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
          resolve(firebaseSetProfile());
        });
      }, error => {
        reject(error);
      });
    }
  };

  firebaseProvider.createUser = (id, pass) => {
    return new Promise((resolve, reject) => {
      firebase.auth().createUserWithEmailAndPassword(id, pass).then(user => {
        return firebaseSetProfile(true);
      }).then(p => {
        firebaseProvider.signOut().then(() => {
          resolve(p);
        });
      });
    }, error => {
      reject(error);
    });
  };

  firebaseProvider.signOut = () => {
    return new Promise((resolve, reject) => {
      firebaseSetOffline().then(() => {
        let user = getUser();
        if(user && user.isAnonymous) {
          return firebase.database().ref('lastNotificationChecked/' + user.uid).remove()
            .then(firebaseDeleteProfile())
            .then(() => { user.delete(); });
        }
        else
          return firebase.auth().signOut();
      }).then(() => {
        resolve();
      }, error => {
        reject(error);
      })
    });
  };

  /*
   * Firebase Database: User Accounts and Status
   */
  let disconnectRef = null;
  let requestRef = null;
  let friendsRef = null;
  let profilesRef = {};
  let isAdmin = false;
  let passcodesRef = null;
  let passcode = null;

  function firebaseEscape(s) {
    return s ? s.replace(/[\W_]/g, c=>{return '%' + c.charCodeAt(0).toString(16);}) : null;
  }
  firebaseProvider.escape = firebaseEscape;

  function firebaseCheckAdministrator() {
    let user = getUser();
    return firebase.database().ref('administrators/' + firebaseEscape(email))
      .once('value').then(v => {
        isAdmin = !!v && v.val() === true;
      }, () => {
        isAdmin = false;
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
      status: createOnly ? 'offline' : 'online'
    };
    let p = firebase.database().ref('users/' + user.uid).set(prof)
      .then(firebaseCheckAdministrator);
    if(!createOnly)
      firebaseOnOnline();
    return p.then(() => { return prof; });
  }

  function firebaseGetProfile() {
    return new Promise((resolve, reject) => {
      let user = getUser();
      firebase.database().ref('users/' + user.uid).once('value', snapshot => {
        email = snapshot.val().email;
        firebase.database().ref('users/' + user.uid + '/status').set('online')
          .then(firebaseCheckAdministrator)
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
        firebaseProvider.onRequest(data.key, {
          userName: v.userName,
          uid: v.uid,
          email: v.email
        }, usePasscode, v.options || null);
        break;
      case 'accept':
        dropRequest(data.key, usePasscode).then(() => {
          return firebaseAddFriend(v.uid);
        }).then(() => {
          /*return firebaseFinishRequest(v.passcode || firebaseEscape(v.email));
        }).then(() => {*/
          firebaseProvider.onAccept(v.requestKey, {
            userName: v.userName,
            uid: v.uid,
            email: v.email
          });
        });
        break;
      case 'reject':
        dropRequest(data.key, usePasscode).then(() => {
          /*return firebaseFinishRequest(v.passcode || firebaseEscape(v.email));
        }).then(() => {*/
          firebaseProvider.onReject(v.requestKey);
        });
        break;
      case 'remove':
        firebaseRemoveFriend(v.uid);
        dropRequest(data.key, usePasscode);
        break;
      }
    }
  }

  function firebaseSetRequestRef() {
    let escaped = firebaseEscape(email);
    requestRef = firebase.database().ref('requests/' + escaped);
    requestRef.once('value').then(data => {
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
            })
          );
        }
        else
          return p;
      }, Promise.resolve()) : Promise.resolve();
    }).then(() => {
      requestRef.on('child_added', firebaseOnRequest.bind(this, false));
    });
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
        passcode = pass;
        firebase.database().ref('passcodes/' + user.uid).set(pass);
        passcodesRef = firebase.database().ref('requests/' + pass);
        passcodesRef.on('child_added', firebaseOnRequest.bind(this, true));
      }
    });
  }
  firebaseProvider.setPasscode = firebaseSetPasscodeRef;

  function firebaseResetRequestRef() {
    if(requestRef) {
      requestRef.off('child_added');
      requestRef = null;
    }
    firebaseResetPasscodeRef();
  }

  function firebaseResetPasscodeRef() {
    if(passcode) {
      let user = getUser();
      firebase.database().ref('passcodes/' + user.uid).remove();
      passcode = null;
    }
    if(passcodesRef) {
      passcodesRef.off('child_added');
      passcodesRef = null;
    }
  }

  function firebaseSetFriendsRef() {
    let user = getUser();
    friendsRef = firebase.database().ref('friends/' + user.uid);
    friendsRef.on('child_added', data => {
      let key = data.key;
      firebaseGetFriendProfile(key).then(friend => {
        profilesRef[key] = firebase.database().ref('users/' + key);
        profilesRef[key].on('child_changed', ((k, d) => {
          let arg = {};
          arg[d.key] = d.val();
          firebaseProvider.onUpdateFriend(key, arg);
        }).bind(this, key));
        if(friend)
          firebaseProvider.onAddFriend(key, friend);
        else
          firebase.database().ref('friends/' + user.uid + '/' + key).remove();
      })
    });
    friendsRef.on('child_removed', data => {
      let key = data.key;
      if(profilesRef[key]) {
        profilesRef[key].off('child_changed');
        delete profilesRef[key];
        firebaseProvider.onRemoveFriend(key);
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

  firebaseProvider.sendRequest = (m, opt) => {
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
      })
    });
  };

  firebaseProvider.sendRemove = (uid, m) => {
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
  };

  function dropRequest(key, usePasscode) {
    let ref = usePasscode ? passcodesRef : requestRef;
    return ref ? ref.child(key).remove() : Promise.reject(new Error('internal error (firebaseDropRequest)'));
  }
  firebaseProvider.dropRequest = dropRequest;
/*
  function firebaseFinishRequest(m) {
    let user = getUser();
    return firebase.database().ref('requestKeys/' + user.uid + '/' + m).remove();
  }
*/
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

  firebaseProvider.acceptRequest = (key, m, uid, usePasscode) => {
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
  };

  firebaseProvider.rejectRequest = (key, m, uid, usePasscode) => {
    return new Promise((resolve, reject) => {
      let ref = firebase.database().ref('requests/' + firebaseEscape(m)).push();
      let arg = {
        type: 'reject',
        email: email,
        requestKey: key
      };
      if(usePasscode)
        arg.passcode = passcode;
      ref.set(arg).then(
        firebaseFinishRequest(usePasscode ? passcode : firebaseEscape(email), uid)
      ).then(() => {
        resolve();
      });
    });
  };

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
  let messagesRef = null;

  function firebaseSetMessagesRef() {
    let user = getUser();
    messagesRef = firebase.database().ref('messages/' + user.uid);
    messagesRef.on('child_added', data => {
      const key = data.key;
      let v = data.val();
      messagesRef.child(key).remove();
      switch(v.type) {
      case 'message':
        firebaseProvider.onMessage(v.uid, v.data);
        firebase.database().ref('messages/' + v.uid).push().set({
          type: 'ack',
          uid: v.uid,
          messageKey: key
        });
        break;
      case 'ack':
        firebaseProvider.onMessageAck(v.uid, v.messageKey);
        break;
      }
    });
  }

  firebaseProvider.sendMessage = (uid, msg) => {
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
  };

  function firebaseResetMessagesRef() {
    if(messagesRef) {
      messagesRef.off('child_added');
      messagesRef = null;
    }
  }

  /*
   * Firebase Database: Notifications
   */
  let notificationsRef = null;
  let lastNotificationChecked = null;

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
          firebaseProvider.onNotification(
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
            firebaseProvider.onNotification([v]);
          });
      });
  }

  function firebaseResetNotificationsRef() {
    if(notificationsRef) {
      notificationsRef.off('child_added');
      notificationsRef = null;
    }
  }

  firebaseProvider.sendNotification = msg => {
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
  let signalsRef = null;

  function firebaseSetSignalsRef() {
    let user = getUser();
    signalsRef = firebase.database().ref('signals/' + user.uid);
    signalsRef.on('child_added', data => {
      const key = data.key;
      let v = data.val();
      console.log(v);
      signalsRef.child(key).remove();
      switch(v.type) {
      case 'invite':
        firebaseProvider.onInvite(v);          
        break;
      case 'accept':
        firebaseProvider.onAcceptInvite(v);
        break;
      case 'reconnect':
        firebaseProvider.onReconnect(v);
        break;
      case 'reject':
      case 'close':
        firebaseProvider.onClose(v);
        break;
      case 'signaling':
        firebaseProvider.onSignaling(v);
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

  firebaseProvider.sendInvite = (uid, opt) => {
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
  };

  firebaseProvider.sendAccept = (uid, cid, opt) => {
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
  };

  firebaseProvider.sendReject = (uid, cid, reason) => {
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
  };

  firebaseProvider.sendReconnect = (uid, cid, opt) => {
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
      })
    });
  };

  firebaseProvider.sendClose = (uid, cid) => {
    return new Promise((resolve, reject) => {
      let user = getUser();
      let ref = firebase.database().ref('signals/' + uid).push();
      ref.set({
        type: 'close',
        uid: user.uid,
        cid: cid
      }).then(() => {
        resolve();
      })
    })
  };

  firebaseProvider.sendSignaling = (uid, cid, type, data) => {
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
      })
    })
  };

  if(!isBrowser)
    module.exports = ito;
})(typeof window === 'object' ? window : global, typeof window === 'object');
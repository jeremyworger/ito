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
  const KII_LOGIN_TYPE     = 'ito.provider.kii.login.type';
  const KII_LOGIN_TOKEN    = {
    anonymous: 'ito.provider.kii.loginToken.anonymous',
    email:     'ito.provider.kii.loginToken.email'
  };
  const KII_GROUP_FRIENDS  = 'itofriends';
  const KII_BUCKET         = 'ito';
  const KII_BUCKET_FRIENDS = KII_GROUP_FRIENDS;
  const KII_BUCKET_PROFILE = 'itoprofile';

  let appId = null;

  /** @type {?KiiGroup} */
  let friendsGroup = null;
  /** @type {?KiiBucket} */
  let itoBucket = null;
  /** @type {?KiiBucket} */
  let friendsBucket = null;
  /** @type {?KiiBucket} */
  let profileBucket = null;
  /** @type {?KiiObject} */
  let profileRef = null;
  /** @type {?KiiObject} */
  let passcodeRef = null;
  /** @type {?KiiObject} */
  let emailRef = null;
  let friendsRef = {};
  let ping = null;

  let mqttClient = null;

  /** @type {boolean} */
  let development = true;
  /** @type {boolean} */
  let isOnline = false;
  let email = null;
  let userName = null;

  /** @type {boolean} */
  let isAdmin = false;
  /** @type {KiiUser} */
  let currentUser = null;

  let passcode = null;

  if(!self.ito.provider)
    self.ito.provider = {};

  class KiiProvider extends ItoProvider {
    constructor(parent) {
      super(parent);
      this.signIn = {
        anonymous: () => {
          return KiiUser.registerAsPseudoUser().then(() => {
            currentUser = KiiUser.getCurrentUser();
            let user = getUser();
            localStorage.setItem(KII_LOGIN_TYPE, 'anonymous');
            localStorage.setItem(KII_LOGIN_TOKEN['anonymous'], user.getAccessToken());
            isOnline = true;
            return kiiSetProfile();
          });
        },
        email: (id, pass) => {
          return KiiUser.authenticate(id, pass).then(() => {
            currentUser = KiiUser.getCurrentUser();
            let user = getUser();
            localStorage.setItem(KII_LOGIN_TYPE, 'email');
            localStorage.setItem(KII_LOGIN_TOKEN['email'], user.getAccessToken());
            email = user.getEmailAddress() || user.getID();
            isOnline = true;
            return kiiSetProfile();
          });
        }
      };
    }

    /*
     * Constant properties
     */
    get US()  { return 'US'; }
    get EU()  { return 'EU'; }
    get CN()  { return 'CN'; }
    get CN3() { return 'CN3'; }
    get SG()  { return 'SG'; }
    get JP()  { return 'JP'; }

    /*
     * Kii Login
     */
    load(url) {
      // Initialize Kii Cloud SDK and MQTT.js
      if(!self.Kii) {
        // Browser
        if(isBrowser) {
          let h = document.querySelector('head');
          return new Promise((resolve, reject) => {
            let s = document.createElement('script');
            s.src = url || 'KiiSDK.min.js';
            s.addEventListener('load', () => {
              let t = document.createElement('script');
              t.src = 'https://unpkg.com/mqtt/dist/mqtt.min.js';
              t.addEventListener('load', () => {resolve(); });
              t.addEventListener('error', () => {
                reject(new Error('cannot load mqtt.js'));
              });
              h.appendChild(t);
            });
            s.addEventListener('error', () => {
              reject(new Error('cannot load Kii SDK'));
            });
            h.appendChild(s);
          });
        }
        // Node.js
        else {
          let kii = require('kii-cloud-sdk').create();
          Object.keys(kii).forEach(i=> { self[i] = kii[i]; });
          self.mqtt = require('mqtt');
          return Promise.resolve();
        }
      }
      else
        return Promise.resolve();
    }

    init(arg) {
      return new Promise((resolve, reject) => {
        development = !!arg && !!arg.development;
        appId = !!arg && arg.appId;
        Kii.initializeWithSite(appId, arg.appKey, KiiSite[arg.serverLocation]);
        let type = localStorage.getItem(KII_LOGIN_TYPE);
        let token = localStorage.getItem(KII_LOGIN_TOKEN[type]);
        if(token)
          KiiUser.authenticateWithToken(token)
            .then(kiiGetProfile)
            .then(prof => { resolve(true); });
        else
          resolve(false);
      });
    }

    /** @return {KiiUser} */
    getUser() {
      let user = getUser();
      return user ? {
        userName: user.getDisplayName(),
        email: email,
        isAnonymous: user.isPseudoUser(),
        uid: user.getID()
      } : null;
    }

    createUser(id, pass, name) {
      let user = getUser();
      return user ?
        Promise.reject(new Error('already signed in')) :
        KiiUser.userWithEmailAddress(id, pass).register().then(() => {
          return KiiUser.authenticate(id, pass);
        }).then(user => {
          currentUser = user;
          email = user.getEmailAddress() || user.getID();
          return kiiSetProfile(true);
        }).then(p => {
          this.signOut().then(() => {
            return p;
          });
        });
    }

    updateUserName(name) {
      let user = getUser();
      return user ? user.update(null, null, {
        displayName: name
      }).then(() => {
        return getUser().refresh();
      }).then(user => {
        currentUser = user;
        userName = user.getDisplayName() || email;
        return null;
      }) : Promise.reject(new Error('not signed in'));
    }

    signOut() {
      return new Promise((resolve, reject) => {
        isOnline = false;
        let saved = profileRef;
        kiiSetOffline().then(() => {
          let user = getUser();
          this.onOnline(false);
          let type = localStorage.getItem(KII_LOGIN_TYPE);
          if(type) {
            localStorage.removeItem(KII_LOGIN_TYPE);
            localStorage.removeItem(KII_LOGIN_TOKEN[type]);
          }
          if(user && user.isPseudoUser()) {
            profileRef = saved;
            return kiiDeleteProfile().then(() => {
              return user.delete();
            }).then(() => {
              currentUser = null;
              email = null;
              userName = null;
            }).then(KiiUser.logOut);
          }
          else {
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
    getPasscode() {
      return passcode;
    }

    setPasscode(pass) {
      if(passcode === pass)
        return Promise.resolve();
      else if(!pass) 
        return kiiResetPasscodeRef();
      else {
        passcode = pass;
        return kiiSetPasscodeRef();
      }
    }

    sendRequest(m, opt) {
      return new Promise((resolve, reject) => {
        let user = getUser();
        Kii.serverCodeEntry('sendRequest').execute({
          query: m,
          uid: user.getID(),
          userName: userName,
          email: email,
          options: opt
        }).then(result => {
          let r = result[2].getReturnedValue().returnedValue;
          if(r.result === 'ok')
            resolve(r.key.replace(/^kiicloud:\/\/groups\/(.*?)\/.*\/(.*)$/, '$1/$2'));
          else
            reject(new Error('No user for requested email address or passcode exists.'));
        });
      });
    }

    dropRequest(key, usePasscode) {
      let object = KiiObject.objectWithURI(key.replace(/^(.*)\/(.*)$/, 'kiicloud://groups/$1/buckets/itofriends/$2'));
      return object.delete();
    }

    acceptRequest(key, m, uid, usePasscode) {
      let user = getUser();
      let arg = {
        type: 'accept',
        email: email,
        userName: userName,
        uid: uid,
        requestKey: key
      };
      kiiAddFriend(uid).then(() => {
        if(usePasscode)
          arg.passcode = passcode;
        return usePasscode ? kiiResetPasscodeRef() : Promise.resolve();
      }).then(() => {
        Kii.serverCodeEntry('acceptRequest').execute(arg).catch(() => {});
      });
    }

    rejectRequest(key, m, uid, usePasscode) {
      let arg = {
        type: 'reject',
        uid: uid,
        requestKey: key
      };
      if(usePasscode)
        arg.passcode = passcode;
      else
        arg.email = email;
      return Kii.serverCodeEntry('rejectRequest').execute(arg).catch(() => {});
    }

    sendRemove(uid, m) {
      let user = getUser();
      return friendsRef[uid] ? (
        kiiRemoveFriend(uid).then(() => {
          /** @type {KiiBucket} */
          let bucket = friendsRef[uid].friendsBucket;
          let msg = bucket.createObject();
          msg.set('type', 'remove');
          msg.set('uid', user.getID());
          msg.save().then(obj => {
            return kiiLimitObjectACL(obj);
          });
        }).then(() => {
          provider.onRemoveFriend(uid);
        })
      ) : Promise.resolve();
    }

    /*
     * Kii Cloud: Chat Messages
     */
    sendMessage(uid, msg) {
      let user = getUser();
      return kiiPutMessageObject(uid, {
        rel: 'message',
        type: 'message',
        data: msg
      }).then(obj => {
        return { uid: uid, messageKey: kiiObjectURIToKey(obj) };
      });
    }
  }
  let provider = new KiiProvider(self.ito);
  self.ito.provider.kii = provider;

  /*
   * Internal functions
   */

  /*
   * Kii Cloud: Login
   */

  /** @return {KiiUser} */
  function getUser() {
    return currentUser;
  }

  function kiiGenerateRandomString(l) {
    return crypto.getRandomValues(new Uint8Array(l)).reduce((a,b)=>{
      let c = '0' + b.toString(16);
      return a + c.substr(c.length-2);
    }, '');
  }

  function kiiCreateAnonymousUser() {
    let name = 'user_' + kiiGenerateRandomString(16);
    let password = kiiGenerateRandomString(24);
    let user = KiiUser.userWithUsername(name, password);
    return user.register().catch(kiiCreateAnonymousUser);
  }

  /*
   * Kii Cloud: User Accounts and Status
   */
  function kiiSetProfile(createOnly) {
    let user = getUser();
    email = email || user.getID();
    userName = user.getDisplayName() || email;
    let prof = {
      uid: user.getID(),
      userName: userName,
      email: email,
      status: isOnline ? 'online' : 'offline'
    };
    /*
    let p = firebase.database().ref('users/' + user.uid).set(prof)
      .then(firebase.database().ref('emails/' + firebaseEscape(email)).set(user.uid))
      .then(firebaseCheckAdministrator);
      */
    return kiiOnOnline().then(() => {
      Object.keys(prof).forEach(i => {
        profileRef.set(i, prof[i]);
      });
      return profileRef.save();
    }).then(() => {
      return prof;
    });
  }

  function kiiGetProfile() {
    return new Promise((resolve, reject) => {
      isOnline = true;
      currentUser = KiiUser.getCurrentUser();
      let user = getUser();
      email = user.getEmailAddress() || user.getID();
      userName = user.getDisplayName() || email;
      let prof = {
        userName: userName,
        email: email,
        status: 'online'
      };
      kiiOnOnline().then(() => {
        Object.keys(prof).forEach(i => {
          profileRef.set(i, prof[i]);
        });
        return profileRef.save();
      }).then(() => {
        resolve(prof);
      })
    });
  }

  function kiiInitGroup() {
    let user = getUser();
    return user.ownerOfGroups().then(params => {
      let list = params[1];
      return list.forEach(g => {
        switch(g.getName()) {
        case KII_GROUP_FRIENDS:
          friendsGroup = g;
          return;
        }
      });
    }).then(() => {
      if(!friendsGroup) {
        friendsGroup = KiiGroup.groupWithName(KII_GROUP_FRIENDS);
        return friendsGroup.save();
      }
    })
  }

  function kiiSetACLEntry(target, scope, action, grant) {
    let acl = (target.objectACL || target.acl)();
    let entry = KiiACLEntry.entryWithSubject(scope, action);
    entry.setGrant(grant);
    acl.putACLEntry(entry);
    return acl.save();
  }

  function kiiLimitObjectACL(object) {
    let group = KiiGroup.groupWithID(object.objectURI().replace(/^kiicloud:\/\/groups\/(.*?)\/.*\/(.*)$/, '$1'));
    return kiiSetACLEntry(
      object,
      group,
      KiiACLAction.KiiACLObjectActionRead,
      false
    );
  }

  /** @param {KiiObject} object */
  function kiiPutMessageObject(uid, data) {
    /** @type {KiiBucket} */
    let bucket = friendsRef[uid].friendsBucket;
    if(!bucket)
      return Promise.reject(new Error('no such friend: ' + uid));
    let user = getUser();
    let msg = bucket.createObject();
    Object.keys(data).forEach(k => {
      msg.set(k, data[k]);
    });
    msg.set('uid', user.getID());
    return msg.save().then(obj => {
      return kiiLimitObjectACL(obj);
    }).then(() => {
      return msg;
    });
  }

  function kiiInitProfileRef() {
    profileRef = profileBucket.createObject('profile');
    profileRef.set('type', 'profile');
    return profileRef.save().then(() => {
      return kiiSetACLEntry(
        profileRef,
        friendsGroup,
        KiiACLAction.KiiACLObjectActionWrite,
        false
      ).then(() => {
        return kiiSetACLEntry(
          profileBucket,
          friendsGroup,
          KiiACLAction.KiiACLBucketActionReadObjects,
          true );
      });
    });
  }

  function kiiSetFriendRef(uid) {
    return KiiUser.userWithID(uid).ownerOfGroups().then(params => {
      let g = params[1].filter(i => { return i.getName() === KII_GROUP_FRIENDS; })[0];
      if(g) {
        let fb = g.bucketWithName(KII_BUCKET_FRIENDS);
        let pb = g.bucketWithName(KII_BUCKET_PROFILE);
        let q = KiiQuery.queryWithClause(KiiClause.equals('type', 'profile'));
        return pb.executeQuery(q).then(p => {
          if(p[1].length > 0) {
            friendsRef[uid] = {
              friendsBucket: fb,
              profileBucket: pb,
              profile: p[1][0]
            };
            return p[1][0];
          }
          else
            return null;
        });
      }
      else
        return null;
    });
  }

  function kiiResetFriendRef(uid) {
    if (!friendsRef[uid])
      return Promise.resolve();
    let bucket = friendsRef[uid].profileBucket;
    let user = getUser();
    return user.pushSubscription().isSubscribed(bucket).then(params => {
      if (params[2]) {
        return user.pushSubscription().unsubscribe(bucket);
      }
    });
  }

  function kiiCheckAll() {
    let user = getUser();
    friendsGroup.getMemberList().then(params => {
      return Promise.all(params[1].filter(u => {
        return u.getID() !== user.getID();
      }).map(u => {
        return u.ownerOfGroups().then(params => {
          let g = params[1][0];
          if(g) {
            let uid = u.getID();
            let fb = g.bucketWithName(KII_BUCKET_FRIENDS);
            let pb = g.bucketWithName(KII_BUCKET_PROFILE);
            let q = KiiQuery.queryWithClause(KiiClause.equals('type', 'profile'));
            return pb.executeQuery(q).then(p => {
              if(p[1].length > 0) {
                let friend = p[1][0];
                friendsRef[uid] = {
                  friendsBucket: fb,
                  profileBucket: pb,
                  profile: friend
                };
                provider.onAddFriend(uid, {
                  email: friend.get('email'),
                  userName: friend.get('userName'),
                  status: friend.get('status')
                });
              }
            });
          }
        })
      }));
    }).then(() => {
      return friendsBucket.executeQuery(KiiQuery.queryWithClause());
    }).then(params => {
      return Promise.all(params[1].map(obj => { return kiiDispatchNewObject(obj); }));
    });
  }

  function kiiRefreshAll() {
    return Promise.all(Object.keys(friendsRef).map(k => {
      return friendsRef[k].profile.refresh().then(kiiOnMessage);
    }));
  }

  /** @param {KiiObject} object */
  function kiiObjectURIToKey(object) {
    return object.objectURI().replace(/^kiicloud:\/\/groups\/(.*?)\/.*\/(.*)$/, '$1/$2');
  }

  /** @param {KiiObject} data */
  function kiiOnRequest(data) {
    let user = getUser();
    let type = data.get('type');
    let uid = data.get('uid');
    let key;
    switch(type) {
    case 'request':
      provider.onRequest(kiiObjectURIToKey(data), {
        userName: data.get('userName'),
        email: data.get('email'),
        uid: uid
      }, data.get('isPasscode'), data.get('options') || null);
      break;
    case 'accept':
      data.delete().then(() => {
        return kiiAddFriend(uid);
      }).then(() => {
        return kiiSetFriendChangedRef(uid);
      }).then(() => {
        provider.onAccept(data.get('requestKey'), {
          userName: data.get('userName'),
          uid: data.get('uid'),
          email: data.get('email')
        });
      }).then(() => {
        return kiiNotifyFriendAdded(uid);
      });
      break;
    case 'reject':
      data.delete().then(() => {
        provider.onReject(data.get('requestKey'));
      });
      break;
    case 'addfriend':
      data.delete().then(() => {
        return kiiSetFriendChangedRef(uid);
      });
      break;
    case 'remove':
      data.delete().then(() => {
        return kiiRemoveFriend(uid);
      }).then(() => {
        provider.onRemoveFriend(uid);
      });
      break;
    }
  }

  /** @param {KiiObject} data */
  function kiiOnMessage(data) {
    let user = getUser();
    let type = data.get('type');
    let uid = data.get('uid');
    switch(type) {
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
    switch(object.get('rel')) {
    case 'message':
      kiiDispatchMessageObject(object);
      break;
    default:
      kiiOnRequest(object);
      break;
    }
  }

  function kiiDispatchUpdatedObject(object) {
    return kiiOnMessage(object);
  }

  function kiiInitMqttClient() {
    let user = getUser();
    let response, endpoint;
    return user.pushInstallation().installMqtt(development).then(r => {
      response = r;
      // getMqttEndpoint would be invoked at maximum three times.
      // If first and/or second trial might fail,
      // an error would appear on your console,
      // however, getMqttEndpoint resolves the Promise
      // when the last trial would succeed.
      return user.pushInstallation().getMqttEndpoint(response.installationID);
    }).then(e => {
      endpoint = e;
      // avoid Mixed Content
      let ws = (location.protocol === 'http:' ? 'ws://' : 'wss://')
         + endpoint.host + ':'
         + (location.protocol === 'http:' ? endpoint.portWS : endpoint.portWSS)
         + '/mqtt';
      mqttClient = mqtt.connect(ws, {
        username: endpoint.username,
        password: endpoint.password,
        clientId: endpoint.mqttTopic
      });
      mqttClient.on('connect', () => {
        mqttClient.subscribe(endpoint.mqttTopic);
      });
      mqttClient.on('message', (topic, message, packet) => {
        let body = JSON.parse(message.toString());
        let object = KiiObject.objectWithURI(body.sourceURI);
        switch(body.type) {
        case 'DATA_OBJECT_CREATED':
          object.refresh().then(obj => {
            kiiDispatchNewObject(obj);
          });
          break;
        case 'DATA_OBJECT_UPDATED':
          object.refresh().then(obj => {
            kiiDispatchUpdatedObject(obj);
          });
          break;
        default:
          console.log(body.type, body.sourceURI);
          break;
        }
      });
    });
  }

  function kiiSetAppScopeObjectACL(object) {
    return kiiSetACLEntry(
      object,
      new KiiAnyAuthenticatedUser(),
      KiiACLAction.KiiACLObjectActionRead,
      false
    ).then(() => {
      return kiiSetACLEntry(
        object,
        new KiiAnonymousUser(),
        KiiACLAction.KiiACLObjectActionRead,
        false
      );
    }).then(() => {
      return kiiSetACLEntry(
        object,
        new KiiAnyAuthenticatedUser(),
        KiiACLAction.KiiACLObjectActionWrite,
        false
      );
    });
  }

  function kiiSetPasscodeRef() {
    let created = !!passcodeRef;
    return (!created ? Kii.serverCodeEntry('setPasscode').execute({
      passcode: passcode,
      group: friendsGroup.getID()
    }).then(result => {
      let r = result[2].getReturnedValue().returnedValue;
      if(r.result === 'ok') {
        if(r.uri) {
          passcodeRef = KiiObject.objectWithURI(r.uri);
          return passcodeRef.refresh();
        }
        else
          passcodeRef = null;
      }
      else
        return Promise.reject(new Error('the specified passcode is already used'));
    }) : Promise.resolve()).then(() => {
      passcodeRef.set('type', 'passcode');
      passcodeRef.set('passcode', passcode);
      passcodeRef.set('group', friendsGroup.getID());
      return passcodeRef.save();
    });
  }

  function kiiResetPasscodeRef() {
    if(passcodeRef) {
      return passcodeRef.delete().then(() => {
        passcode = null;
        passcodeRef = null;
      });
    }
    else
      return Promise.resolve();
  }

  function kiiSetEmailRef() {
    let created = !!emailRef;
    if(!created)
      emailRef = itoBucket.createObject();
    emailRef.set('type', 'email');
    emailRef.set('email', email);
    emailRef.set('group', friendsGroup.getID());
    emailRef.set('status', 'online');
    return emailRef.save().then(() => {
      return !created ? kiiSetAppScopeObjectACL(emailRef, true) : Promise.resolve();
    });
  }

  function kiiResetEmailRef() {
    if(emailRef) {
      return emailRef.delete().then(() => {
        emailRef = null;
      });
    }
  }

  /** @param {KiiGroup} group */
  function kiiSetFriendChangedRef(uid) {
    let user = getUser();
    return kiiSetFriendRef(uid).then(result => {
      if(result) {
        let bucket = friendsRef[uid].profileBucket;
        let friend = friendsRef[uid].profile;
        return user.pushSubscription().isSubscribed(bucket).then(params => {
          return params[2] ? Promise.resolve() : user.pushSubscription().subscribe(bucket);
        }).then(() => {
          provider.onAddFriend(uid, {
            email: friend.get('email'),
            userName: friend.get('userName'),
            status: friend.get('status')
          });
        }, e=>{console.error(e);});
      }
      else
        return group.refresh().then(g => {
          return kiiRemoveFriend(g.getCachedOwner().getID());
        });
    })
  }

  function kiiNotifyFriendAdded(uid) {
    if(!friendsRef[uid])
      return Promise.resolve();
    return kiiPutMessageObject(uid, { type: 'addfriend' });
  }

  function kiiAddFriend(uid) {
    friendsGroup.addUser(KiiUser.userWithID(uid));
    return friendsGroup.save();
  }

  function kiiRemoveFriend(uid) {
    return kiiResetFriendRef(uid).then(() => {
      friendsGroup.removeUser(KiiUser.userWithID(uid));
      return friendsGroup.save();
    });
  }

  function kiiPing() {
    if(isOnline && emailRef)
      emailRef.save();
  }

  function kiiOnOnline() {
    let user = getUser();
    let query = KiiQuery.queryWithClause(KiiClause.equals('_owner', user.getID()));
    return kiiInitMqttClient().then(kiiInitGroup).then(() => {
      itoBucket = Kii.bucketWithName(KII_BUCKET);
      friendsBucket = friendsGroup.bucketWithName(KII_BUCKET_FRIENDS);
      profileBucket = friendsGroup.bucketWithName(KII_BUCKET_PROFILE);
      return profileBucket.executeQuery(query);
    }).then(params => {
      params[1].forEach(object => {
        switch(object.get('type')) {
        case 'profile':
          profileRef = object;
          break;
        }
      });
    }).then(() => {
      if(!profileRef)
        return kiiInitProfileRef();
    }).then(() => {
      return user.pushSubscription().isSubscribed(friendsBucket);
    }).then(params => {
      if(!params[2])
        return user.pushSubscription().subscribe(friendsBucket);
    }).then(() => {
      return itoBucket.executeQuery(query);
    }).then(params => {
      params[1].forEach(object => {
        switch(object.get('type')) {
        case 'passcode':
          passcodeRef = object;
          passcode = object.get('passcode');
          break;
        case 'email':
          emailRef = object;
          break;
        }
      });
    }).then(() => {
      return passcode ? kiiSetPasscodeRef() : kiiResetPasscodeRef();
    }).then(kiiSetEmailRef)
    .then(kiiCheckAll)
    .then(() => {
      if(!ping)
        ping = setInterval(kiiPing, 5000);
    }).catch(e=>{console.error(e);});
  }

  function kiiSetOffline() {
    if(ping) {
      clearInterval(ping);
      ping = null;
    }
    if(mqttClient) {
      mqttClient.end();
      mqttClient = null;
    }
    if(profileRef) {
      profileRef.set('status', 'offline');
      return profileRef.save().then(() => {
        return emailRef.save();
      }).then(() => {
        emailRef.set('status', 'offline');
        return emailRef.save();
      }).then(() => {
        friendsGroup = null;
        itoBucket = null;
        friendsBucket = null;
        profileRef = null;
      });
    }
    else
      return Promise.resolve();
  }

  function kiiDeleteProfile() {
    let user = getUser();
    if(user) {
      return user.ownerOfGroups().then(params => {
        return Promise.all(params[1].map(g => { return g.delete(); }));
      }).then(kiiResetEmailRef)
      .then(kiiResetPasscodeRef)
      .then(() => {
        profileRef = null;
      });
    }
    else
      return Promise.resolve();
  }

  /*
   * Kii Cloud: Chat Messages
   */
  /** @param {KiiObject} object */
  function kiiDispatchMessageObject(object) {
    let uid = object.get('uid');
    switch(object.get('type')) {
    case 'message':
      provider.onMessage(uid, object.get('data'));
      kiiPutMessageObject(uid, {
        rel: 'message',
        type: 'ack',
        messageKey: kiiObjectURIToKey(object)
      }).then(() => {
        return object.delete();
      });
      break;
    case 'ack':
      provider.onMessageAck(uid, object.get('messageKey'));
      object.delete();
      break;
    }
  }

  if(isBrowser) {
    window.addEventListener('unload', () => {
      let user = getUser();
      if(user) {
        // I wish I cloud deprecate use of synchronous XHR...
        let xhr = new XMLHttpRequest();
        xhr.open(
          'POST',
          'https://api-jp.kii.com/api/apps/' + appId + '/server-code/versions/current/onOffline',
          false
        );
        xhr.setRequestHeader('Authorization', 'Bearer ' + user.getAccessToken());
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({a: 0}));
      }
    });
    window.addEventListener('online', () => {
      isOnline = true;
      kiiRefreshAll();
    });
    window.addEventListener('offline', () => {
      isOnline = false;
    });
  }

  if(!isBrowser)
    module.exports = self.ito;
})(this, typeof window === 'object');
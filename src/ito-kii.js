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
  const KII_LOGIN_TYPE           = 'ito.provider.kii.login.type';
  const KII_LOGIN_TOKEN          = {
    anonymous: 'ito.provider.kii.loginToken.anonymous',
    email:     'ito.provider.kii.loginToken.email'
  };
  const KII_GROUP_FRIENDS        = 'itofriends';
  const KII_BUCKET               = 'ito';
  const KII_BUCKET_NOTIFICATIONS = 'itonotifications';
  const KII_BUCKET_FRIENDS       = KII_GROUP_FRIENDS;
  const KII_BUCKET_PROFILE       = 'itoprofile';
  const KII_BUCKET_DATASTORE_REF = 'itodatastore';
  const KII_BUCKET_DATASTORE     = 'itodata_';
  const KII_OBJ_EMAIL            = 'itoemail_';
  const KII_OBJ_PASSCODE         = 'itopasscode_';
  const KII_OBJ_PROFILE          = KII_BUCKET_PROFILE + '_';
  const KII_OBJ_DATASTORE_REF    = KII_BUCKET_DATASTORE_REF + '_';
  const KII_PROP_DATAOBSERVER    = 'dataobserver';

  const KII_SUB = {};
  const KII_ACTION = {
    BUCKET: {},
    OBJECT: {}
  };

  let appId = null;

  /** @type {?KiiGroup} */
  let friendsGroup = null;
  /** @type {?KiiBucket} */
  let itoBucket = null;
  /** @type {?KiiBucket} */
  let notificationBucket = null;
  /** @type {?KiiBucket} */
  let friendsBucket = null;
  /** @type {?KiiBucket} */
  let profileBucket = null;
  /** @type {?KiiBucket} */
  let dataStoreRefBucket = null;
  /** @type {?KiiObject} */
  let profileRef = null;
  /** @type {?KiiObject} */
  let passcodeRef = null;
  /** @type {?KiiObject} */
  let emailRef = null;
  let friendsRef = {};
  let ping = null;
  /** @type {Array<string>} */
  let pendingRequests = [];

  let mqttClient = null;

  let funcQueue = [];
  let resolveQueue = [];

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

  let dataStoreRef = {};

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
              // constant values
              KII_SUB.ANONYMOUS        = new KiiAnonymousUser();
              KII_SUB.AUTHENTICATED    = new KiiAnyAuthenticatedUser();
              KII_ACTION.BUCKET.CREATE = KiiACLAction.KiiACLBucketActionCreateObjects;
              KII_ACTION.BUCKET.QUERY  = KiiACLAction.KiiACLBucketActionQueryObjects;
              KII_ACTION.BUCKET.DROP   = KiiACLAction.KiiACLBucketActionDropBucket;
              KII_ACTION.BUCKET.READ   = KiiACLAction.KiiACLBucketActionReadObjects;
              KII_ACTION.OBJECT.READ   = KiiACLAction.KiiACLObjectActionRead;
              KII_ACTION.OBJECT.WRITE  = KiiACLAction.KiiACLObjectActionWrite;
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
          Object.keys(kii).forEach(i => { self[i] = kii[i]; });
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
        let token = type ? localStorage.getItem(KII_LOGIN_TOKEN[type]) : null;
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
        return kiiPushQueue(kiiResetPasscodeRef);
      else {
        return kiiPushQueue(p => {
          passcode = p;
          return kiiSetPasscodeRef();
        }, pass);
      }
    }

    sendRequest(m, opt) {
      return new Promise((resolve, reject) => {
        let user = getUser();
        kiiPushQueue(kiiPutServerCodeEntry, {
          entry: 'sendRequest',
          argument: {
            query: m,
            uid: user.getID(),
            userName: userName,
            email: email,
            options: opt
          }
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
      return kiiPushQueue(object.delete);
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
        return kiiPushQueue(kiiPutServerCodeEntry, {
          entry: 'acceptRequest',
          argument: arg
        }).catch(() => {});
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
      return kiiPushQueue(kiiPutServerCodeEntry, {
        entry: 'rejectRequest',
        argument: arg
      }).catch(() => {});
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
          return kiiPushQueue(kiiPutObjectWithACL, msg);
        }).then(() => {
          provider.onRemoveFriend(uid);
        })
      ) : Promise.resolve();
    }

    /*
     * Kii Cloud: Chat Messages
     */
    sendMessage(uid, msg) {
      return kiiPutMessageObject(uid, {
        rel: 'message',
        type: 'message',
        data: msg
      }).then(obj => {
        return { uid: uid, messageKey: kiiObjectURIToKey(obj) };
      });
    }

    /*
     * KiiCloud: Notifications
     */
    sendNotification(msg) {
      return kiiPushQueue(kiiPutServerCodeEntry, {
        entry: 'sendNotification',
        argument: { data: msg }
      }).then(result => {
        let r = result[2].getReturnedValue().returnedValue;
        if(r.result === 'ok')
          return;
        else
          throw new Error('the current user is not permitted to send a notification');
      });
    }

    /*
     * Kii Cloud: WebRTC Signaling Messages
     */
    sendInvite(uid, opt) {
      let user = getUser();
      return kiiPutMessageObject(uid, {
        rel: 'signaling',
        type: 'invite',
        audio: opt.audio,
        video: opt.video,
        dataChannel: !!opt.dataChannel
      }).then(obj => {
        pendingRequests.push(obj.objectURI());
        return kiiObjectURIToKey(obj);
      });
    }

    sendAccept(uid, cid, opt) {
      let user = getUser();
      return kiiPutMessageObject(uid, {
        rel: 'signaling',
        type: 'accept',
        cid: cid,
        audio: opt.audio,
        video: opt.video
      }).then(obj => {
        return;
      });
    }

    sendReject(uid, cid, reason) {
      let user = getUser();
      return kiiPutMessageObject(uid, {
        rel: 'signaling',
        type: 'reject',
        cid: cid,
        reason: reason
      }).then(obj => {
        return;
      });
    }

    sendReconnect(uid, cid, opt) {
      let user = getUser();
      return kiiPutMessageObject(uid, {
        rel: 'signaling',
        type: 'reconnect',
        cid: cid,
        audio: opt.audio,
        video: opt.video,
        dataChannel: !!opt.dataChannel
      }).then(obj => {
        return;
      });
    }

    sendClose(uid, cid) {
      let user = getUser();
      return kiiPutMessageObject(uid, {
        rel: 'signaling',
        type: 'close',
        cid: cid
      }).then(obj => {
        return;
      });
    }

    sendSignaling(uid, cid, type, data) {
      let user = getUser();
      return kiiPutMessageObject(uid, {
        rel: 'signaling',
        type: 'signaling',
        signalingType: type,
        cid: cid,
        data: JSON.stringify(data)
      }).then(obj => {
        return;
      });
    }

    /*
     * Kii Cloud: Simple Data Store Sharing
     */
    openDataStore(scope, name) {
      return kiiPushQueue(kiiOpenDataStore, {
        scope: scope,
        name: name
      }).then(s => { return s || scope; });
    }

    removeDataStore(name) {
      return kiiPushQueue(kiiRemoveDataStore, {
        name: name
      });
    }

    putDataElement(name, key, data, scope) {
      return kiiPushQueue(kiiPutDataElement, {
        name: name,
        key: key,
        data: data,
        scope: scope
      });
    }

    getDataElement(name, key) {
      return kiiPushQueue(kiiGetDataElement, {
        name: name,
        key: key
      });
    }

    getAllDataElements(name) {
      return kiiPushQueue(kiiGetAllDataElements, {
        name: name
      });
    }

    removeDataElement(name, key) {
      return kiiPushQueue(kiiRemoveDataElement, {
        name: name,
        key: key
      });
    }

    removeAllDataElements(name) {
      return kiiPushQueue(kiiRemoveAllDataElements, {
        name: name
      });
    }

    observeDataStore(uid, name) {
      return kiiPushQueue(kiiObserveDataStore, {
        uid: uid,
        name: name
      });
    }

    disconnectDataStoreObserver(uid, name) {
      return kiiPushQueue(kiiDisconnectDataStoreObserver, {
        uid: uid,
        name: name
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
        uid: user.getID(),
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

  function kiiSetACLEntry(target, subject, action, grant) {
    let acl = (target.objectACL || target.acl)();
    let entry = KiiACLEntry.entryWithSubject(subject, action);
    entry.setGrant(grant);
    acl.putACLEntry(entry);
    return acl.save().catch(() => {});
  }

  function kiiLimitObjectACL(object) {
    let group = KiiGroup.groupWithID(object.objectURI().replace(/^kiicloud:\/\/groups\/(.*?)\/.*\/(.*)$/, '$1'));
    return kiiSetACLEntry(object, group, KII_ACTION.OBJECT.READ, false);
  }

  function kiiShiftQueue() {
    if(isOnline) {
      let f = funcQueue.shift();
      return f ? f.func(f.arg).then(result => {
        return (resolveQueue.shift().resolve(result));
      }, error => {
        return (resolveQueue.shift().reject(error));
      }).then(kiiShiftQueue) : Promise.resolve()
    }
    else
      return Promise.resolve();
  }

  function kiiPushQueue(func, arg) {
    return new Promise((resolve, reject) => {
      funcQueue.push({ func: func, arg: arg });
      resolveQueue.push({ resolve: resolve, reject: reject });
      if(resolveQueue.length === 1)
        kiiShiftQueue();
    })
  }

  function kiiPutServerCodeEntry(arg) {
    return Kii.serverCodeEntry(arg.entry).execute(arg.argument);
  }

  function kiiPutObjectWithACL(object) {
    return object.save().then(obj => {
      return kiiLimitObjectACL(obj);
    });
  }

  /** @param {KiiObject} data */
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
    return kiiPushQueue(kiiPutObjectWithACL, msg).then(() => {
      return msg;
    });
  }

  /** @param {KiiObject} object */
  function kiiConvertObject(object) {
    return object.getKeys().reduce((a, b) => {
      a[b] = object.get(b);
      return a;
    }, {});
  }

  function kiiInitProfileRef() {
    let user = getUser();
    profileRef = profileBucket.createObjectWithID(KII_OBJ_PROFILE + user.getID());
    profileRef.set('type', 'profile');
    return profileRef.saveAllFields().then(() => {
      return   kiiSetACLEntry(profileRef,    friendsGroup, KII_ACTION.OBJECT.WRITE, false)
      .then(() => {
        return kiiSetACLEntry(profileBucket, friendsGroup, KII_ACTION.BUCKET.READ,  true);
      });
    });
  }

  function kiiSetFriendRef(uid) {
    return KiiUser.userWithID(uid).ownerOfGroups().then(params => {
      let g = params[1].filter(i => { return i.getName() === KII_GROUP_FRIENDS; })[0];
      if(g) {
        let fb = g.bucketWithName(KII_BUCKET_FRIENDS);
        let pb = g.bucketWithName(KII_BUCKET_PROFILE);
        let friend = pb.createObjectWithID(KII_OBJ_PROFILE + uid);
        return friend.refresh().then(() => {
          friendsRef[uid] = {
            friendsBucket: fb,
            profileBucket: pb,
            profile: friend
          };
          return friend;
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
    return kiiUnsubscribePush(bucket);
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
            let friend = pb.createObjectWithID(KII_OBJ_PROFILE + uid);
            return friend.refresh().then(() => {
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
            });
          }
        })
      }));
    }).then(() => {
      return friendsBucket.executeQuery(KiiQuery.queryWithClause());
    }).then(params => {
      return Promise.all(params[1].map(obj => { return kiiDispatchNewObject(obj); }));
    }).then(() => {
      let query = KiiQuery.queryWithClause(KiiClause.and(
        KiiClause.equals('rel', 'notification'),
        KiiClause.equals('type', 'notification')
      ));
      return notificationBucket.executeQuery(query);
    }).then(params => {
      provider.onNotification(params[1].map(obj => { return obj.get('data'); }));
    })
  }

  function kiiRefreshAll() {
    return Promise.all(Object.keys(friendsRef).map(k => {
      return friendsRef[k].profile.refresh().then(kiiOnUpdate);
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
  function kiiOnUpdate(data) {
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
        // Note: ito does not currently use Push-to-User notification,
        //       for the purpose of ensuring compatibility with Firebase
        //       and better offline support.
        if(body.objectID) {
          let object = KiiObject.objectWithURI(body.sourceURI);
          let i;
          if(body.objectID.match(new RegExp('^' + KII_BUCKET_DATASTORE))) {
            console.log('datastore', body);
            switch(body.type) {
            case 'DATA_OBJECT_CREATED':
              object.refresh().then(obj => {
                kiiObserveDataElementAdd(obj, body.bucketID);
              });
              break;
            case 'DATA_OBJECT_UPDATED':
              object.refresh().then(obj => {
                kiiObserveDataElementUpdate(obj, body.bucketID);
              });
              break;
            case 'DATA_OBJECT_DELETED':
              kiiObserveDataElementRemove(object, body.bucketID);
              break;
            }
          }
          else {
            switch(body.type) {
            case 'DATA_OBJECT_CREATED':
              object.refresh().then(obj => {
                kiiDispatchNewObject(obj);
              });
              break;
            case 'DATA_OBJECT_UPDATED':
              object.refresh().then(obj => {
                kiiOnUpdate(obj);
              });
              break;
            case 'DATA_OBJECT_DELETED':
              i = pendingRequests.indexOf(object.objectURI());
              if(i >= 0)
                pendingRequests.splice(i, 1);
              break;
            }
          }
        }
      });
    });
  }

  function kiiSetAppScopeObjectACL(object) {
    return kiiSetACLEntry(  object, KII_SUB.AUTHENTICATED, KII_ACTION.OBJECT.READ,  false)
    .then(() => {
      return kiiSetACLEntry(object, KII_SUB.ANONYMOUS,     KII_ACTION.OBJECT.READ,  false);
    }).then(() => {
      return kiiSetACLEntry(object, KII_SUB.AUTHENTICATED, KII_ACTION.OBJECT.WRITE, false);
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
    let user = getUser();
    let created = !!emailRef;
    if(!created)
      emailRef = itoBucket.createObjectWithID(KII_OBJ_EMAIL + user.getID());
    emailRef.set('type', 'email');
    emailRef.set('email', email);
    emailRef.set('group', friendsGroup.getID());
    emailRef.set('status', 'online');
    emailRef.set(KII_PROP_DATAOBSERVER, []);
    return emailRef.saveAllFields().then(() => {
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
        });
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
    return kiiPushQueue(friendsGroup.save);
  }

  function kiiRemoveFriend(uid) {
    return kiiResetFriendRef(uid).then(() => {
      friendsGroup.removeUser(KiiUser.userWithID(uid));
    return kiiPushQueue(friendsGroup.save);
    });
  }

  function kiiSetPing() {
    if(!ping)
      ping = setInterval(kiiPing, 5000);
  }

  function kiiResetPing() {
    if(ping) {
      clearInterval(ping);
      ping = null;
    }
  }

  function kiiPing() {
    if(isOnline && emailRef && (!document || document.visibilityState === 'visible')) {
      emailRef.set('status', 'online');
      emailRef.save().then(() => {
        profileRef.set('status', 'online');
        profileRef.save();
      })
    }
    else
      kiiResetPing();
  }

  function kiiSubscribePush(target) {
    let user = getUser();
    return user.pushSubscription().isSubscribed(target).then(params => {
      if(!params[2])
        return user.pushSubscription().subscribe(target);
    });
  }

  function kiiUnsubscribePush(target) {
    console.log('unsubscribe');
    let user = getUser();
    return user.pushSubscription().isSubscribed(target).then(params => {
      if(params[2])
        return user.pushSubscription().unsubscribe(target);
    });
  }

  function kiiCheckAdministrator() {
    return kiiPushQueue(kiiPutServerCodeEntry, {
      entry: 'checkAdministrator',
      argument: { a: 0 }
    }).then(result => {
      let r = result[2].getReturnedValue().returnedValue;
      if(r.result === 'ok')
        isAdmin = r.isAdmin;
    });
  }

  function kiiOnOnline() {
    let user = getUser();
    return kiiInitMqttClient().then(kiiInitGroup).then(() => {
      itoBucket = Kii.bucketWithName(KII_BUCKET);
      notificationBucket = Kii.bucketWithName(KII_BUCKET_NOTIFICATIONS);
      dataStoreRefBucket = Kii.bucketWithName(KII_BUCKET_DATASTORE_REF);
      friendsBucket = friendsGroup.bucketWithName(KII_BUCKET_FRIENDS);
      profileBucket = friendsGroup.bucketWithName(KII_BUCKET_PROFILE);
      profileRef = profileBucket.createObjectWithID(KII_OBJ_PROFILE + user.getID());
      return profileRef.refresh().catch(() => {
        return kiiInitProfileRef();
      });
    }).then(() => {
      return kiiSubscribePush(friendsBucket);
    }).then(() => {
      return kiiSubscribePush(notificationBucket);
    }).then(() => {
      return kiiCheckAdministrator();
    }).then(() => {
      return Kii.serverCodeEntry('unsubscribeDataStore').execute({ a: 0 });
    }).then(() => {
      emailRef = itoBucket.createObjectWithID(KII_OBJ_EMAIL + user.getID());
      return emailRef.refresh().catch(() => {}).then(kiiSetEmailRef);
    }).then(() => {
      passcodeRef = itoBucket.createObjectWithID(KII_OBJ_PASSCODE + user.getID());
      return passcodeRef.refresh().then(obj => {
        passcode = obj.get('passcode');
      }, () => { passcodeRef = null; });
    }).then(() => {
      return kiiPushQueue( passcode ? kiiSetPasscodeRef : kiiResetPasscodeRef );
    }).then(kiiCheckAll)
    .then(() => {
      if(!ping)
        ping = setInterval(kiiPing, 5000);
    });
  }

  function kiiSetOffline() {
    kiiResetPing();
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
        dataStoreRefBucket = null;
        return Kii.serverCodeEntry('removePendingRequests').execute({
          pendingRequests: pendingRequests
        });
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

  /*
   * Kii Cloud: Notifictaions
   */
  function kiiDispatchNotificationObject(object) {
    let uid = object.get('uid');
    switch(object.get('type')) {
    case 'notification':
      provider.onNotification([object.get('data')]);
      break;
    }
  }

  /*
   * Kii Cloud: WebRTC Signaling Messages
   */
  /** @param {KiiObject} object */
  function kiiDispatchSignalingObject(object) {
    const key = object.get('cid') || kiiObjectURIToKey(object);
    let v = kiiConvertObject(object);
    v.cid = key;
    object.delete().then(() => {
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

  /*
   * Kii Cloud: Simple Data Store Sharing
   */
  function kiiEncodeUserID(uid) {
    return btoa(uid.replace(/-/g, '').match(/([0-9a-f]{1,2})/g).reduce((a, b) => {
      return a + String.fromCharCode(parseInt(b, 16));
    }, '')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function kiiOpenDataStore(arg) {
    const uid = getUser().getID();
    const name = arg.name;
    let dataStore = KII_BUCKET_DATASTORE + kiiEncodeUserID(uid) + '_' + name;
    return dataStoreRef[name] ?
      Promise.resolve(dataStoreRef[name].scope) :
      Kii.serverCodeEntry('openDataStore').execute({
        scope: arg.scope,
        name: name,
        group: friendsGroup.getID(),
        dataStore: dataStore,
        dataStoreRef: KII_OBJ_DATASTORE_REF + uid + '_' + name
      }).then(result => {
        let r = result[2].getReturnedValue().returnedValue;
        if(r.result === 'ok') {
          dataStoreRef[name] = {
            scope: r.scope,
            bucket: Kii.bucketWithName(dataStore),
            elements: {}
          };
          return r.scope;
        }
        else
          throw new Error('could not open the data store: ' + name);
      });
  }

  function kiiRemoveDataStore(arg) {
    const uid = getUser().getID();
    const name = arg.name;
    const refid = KII_OBJ_DATASTORE_REF + uid + '_' + name;
    let ref = dataStoreRefBucket.createObjectWithID(refid);
    delete dataStoreRef[name];
    return ref.delete().then(() => {
      let store = Kii.bucketWithName(KII_BUCKET_DATASTORE + kiiEncodeUserID(uid) + '_' + name);
      return store.delete();
    });
  }

  function kiiPutDataElement(arg) {
    const key = arg.key;
    const data = arg.data;
    const scope = arg.scope;
    let ref = dataStoreRef[arg.name];
    if(!ref)
      return Promise.reject(new Error('no such data store'));
    let element;
    if(ref.elements[key]) {
      element = ref.elements[key];
      element.set('data', data);
      return element.save();
    }
    else {
      element = ref.bucket.createObjectWithID(ref.bucket.getBucketName() + '_' + key);
      element.set('data', data);
      return element.saveAllFields().then(() => {
        return scope !== 'public' ?
               kiiSetACLEntry(element, KII_SUB.AUTHENTICATED, KII_ACTION.OBJECT.READ,  false) : Promise.resolve();
      }).then(() => {
        return kiiSetACLEntry(element, KII_SUB.ANONYMOUS,     KII_ACTION.OBJECT.READ,  false);
      }).then(() => {
        return scope === 'friends' ?
               kiiSetACLEntry(element, friendsGroup,          KII_ACTION.OBJECT.READ,  true ) : Promise.resolve();
      }).then(() => {
        return kiiSetACLEntry(element, KII_SUB.AUTHENTICATED, KII_ACTION.OBJECT.WRITE, false);
      });
    }
  }

  function kiiGetDataElement(arg) {
    const key = arg.key;
    let ref = dataStoreRef[arg.name];
    if(!ref)
      return Promise.reject(new Error('no such data store'));
    let element = ref.elements[key];
    if(element) {
      return element.refresh().then(obj => {
        return { key: key, data: obj.get('data') };
      });
    }
    else {
      element = ref.bucket.createObjectWithID(ref.bucket.getBucketName() + '_' + key);
      return element.refresh().then(obj => {
        ref.elements[key] = obj;
        return { key: key, data: obj.get('data') };
      }, () => {
        throw new Error('no such key in the data store');
      });
    }
  }

  function kiiGetAllDataElements(arg) {
    let ref = dataStoreRef[arg.name];
    if(!ref)
      return Promise.reject(new Error('no such data store'));
    return ref.bucket.executeQuery(KiiQuery.queryWithClause()).then(params => {
      return params[1].reduce((result, obj) => {
        const key = obj.getID().substr(ref.bucket.getBucketName().length + 1);
        const data = obj.get('data');
        ref.elements[key] = obj;
        result[key] = data;
        return result;
      }, {});
    });
  }

  function kiiRemoveDataElement(arg) {
    const key = arg.key;
    let ref = dataStoreRef[arg.name];
    if(!ref)
      return Promise.reject(new Error('no such data store'));
    let element = ref.elements[key] || ref.bucket.createObjectWithID(ref.bucket.getBucketName() + '_' + key);
    delete ref.elements[key];
    return element.delete().catch(() => {});
  }

  function kiiRemoveAllDataElements(arg) {
    let ref = dataStoreRef[arg.name];
    if(!ref)
      return Promise.reject(new Error('no such data store'));
    ref.elements = [];
    return ref.bucket.executeQuery(KiiQuery.queryWithClause()).then(params => {
      return params[1].reduce((p, obj) => {
        return p.then(() => { return obj.delete().catch(() => {}); });
      }, Promise.resolve());
    });
  }

  function kiiObserveDataStore(arg) {
    const uid = arg.uid;
    const name = arg.name;
    let storeRef = Kii.bucketWithName(KII_BUCKET_DATASTORE_REF).createObjectWithID(KII_OBJ_DATASTORE_REF + uid + '_' + name);
    let store;
    return storeRef.refresh().then(obj => {
      store = Kii.bucketWithName(obj.get('datastore')); 
      let observers = emailRef.get(KII_PROP_DATAOBSERVER);
      observers.push(store.getBucketName());
      emailRef.set(KII_PROP_DATAOBSERVER, observers);
      return emailRef.save();
    }).then(() => {
      return kiiSubscribePush(store);
    }).then(() => {
      return arg;
    }).catch(e => {
      throw new Error('no such data store or permission denied');
    });
  }

  function kiiDisconnectDataStoreObserver(arg) {
    let store = Kii.bucketWithName(KII_BUCKET_DATASTORE + kiiEncodeUserID(arg.uid) + '_' + arg.name);
    return kiiUnsubscribePush(store).then(() => {
      return emailRef.refresh();
    }).then(obj => {
      let list = obj.get(KII_PROP_DATAOBSERVER);
      let i = list.indexOf(store.getBucketName());
      if(i >= 0) {
        list.splice(i, 1);
        emailRef.set(KII_PROP_DATAOBSERVER, list);
        return emailRef.save();
      }
    }).catch(() => {
      throw new Error('cannot unsubscribe the data store: ' + arg.name);
    });
  }

  function kiiBase64ToUUID(ref) {
    let d = atob(ref.replace(/-/g, '+').replace(/_/g, '/'));
    let r = '';
    for(let i = 0 ; i < d.length ; i++) {
      let c = d.charCodeAt(i).toString(16);
      r += ('0' + c).substr(c.length - 1, 2);
      switch(i) {
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
    const r = bucket.replace(new RegExp('^' + KII_BUCKET_DATASTORE), '');
    const uid = kiiBase64ToUUID(r.substr(0, 22));
    const name = r.substr(23);
    const key = ref.replace(new RegExp('^' + bucket + '_'), '');    
    return { uid: uid, name: name, key: key };
  }

  function kiiObserveDataElementAdd(object, bucket) {
    let arg = kiiDecodeDataStoreRef(object.getID(), bucket);
    provider.onElementAdd(arg.uid, arg.name, arg.key, object.get('data'));
  }

  function kiiObserveDataElementUpdate(object, bucket) {
    let arg = kiiDecodeDataStoreRef(object.getID(), bucket);
    provider.onElementUpdate(arg.uid, arg.name, arg.key, object.get('data'));
  }

  function kiiObserveDataElementRemove(object, bucket) {
    let arg = kiiDecodeDataStoreRef(object.getID(), bucket);
    provider.onElementRemove(arg.uid, arg.name, arg.key);
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
        xhr.send(JSON.stringify({pendingRequests: pendingRequests}));
      }
    });

    window.addEventListener('online', () => {
      isOnline = true;
      kiiRefreshAll();
      kiiSetPing();
      kiiShiftQueue();
    });

    window.addEventListener('offline', () => {
      isOnline = false;
      kiiResetPing();
    });

    if(document) {
      document.addEventListener('visibilitychange', () => {
        if(document.visibilityState === 'visible')
          kiiSetPing();
      });
    }
  }

  if(!isBrowser)
    module.exports = self.ito;
})((typeof window === 'object' ? window : global), typeof window === 'object');
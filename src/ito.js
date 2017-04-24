/**
 * ito.js
 * 
 * Copyright 2017 KDDI Research, Inc.
 * 
 * This software is released under the MIT License.
 * http://opensource.org/licenses/mit-license.php
 */

'use strict';

((self, isBrowser) => {
  if (!isBrowser) {
    // node-localstorage
    let LocalStorage = require('node-localstorage').LocalStorage;
    self.localStorage = new LocalStorage('./localStorage');
  }


  /*
   * Simple fetch polyfill
   */
  if(isBrowser && !window.fetch) {
    window.fetch = (url, opt) => {
      let xhr = new XMLHttpRequest();
      opt = opt || {};
      return new Promise((resolve, reject) => {
        xhr.open(opt.method || 'GET', url);
        if(opt.headers) {
          let h = opt.headers;
          Object.keys(h).forEach(i => {
            xhr.setRequestHeader(i, h[i]);
          });
        }
        xhr.withCredentials = (opt.mode && opt.mode !== 'omit');
        xhr.responseType = 'arraybuffer';
        xhr.onerror = reject;
        xhr.onload = () => {
          let toText = a => {
            return new Uint8Array(a).reduce((s, c) => s + String.fromCharCode(c), '');
          };
          resolve({
            text: () => {
              return Promise.resolve(toText(xhr.response));
            },
            json: () => {
              return new Promise(r => JSON.parse(toText(xhr.response)));
            },
            arrayBuffer: () => {
              return Promise.resolve(xhr.response);
            },
            blob: () => {
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
  let provider = null;
  let state = 'uninitialized';
  let profile = {};
  let friends = {};
  Object.defineProperties(profile, {
    userName: {
      get: () => {
        let user = provider.getUser();
        return user ? user.userName : null;
      },
      enumerable: true
    },
    email: {
      get: () => {
        let user = provider.getUser();
        return user ? user.email : null;
      },
      enumerable: true
    },
    isAnonymous: {
      get: () => {
        let user = provider.getUser();
        return user ? user.isAnonymous : null;
      },
      enumerable: true
    },
    uid: {
      get: () => {
        let user = provider.getUser();
        return user ? user.uid : null;
      },
      enumerable: true
    }
  });

  const useTrack = !!self.RTCRtpSender;
  const useTransceiver = !!self.RTCRtpTransceiver;
  let endpoints = {};
  let pcOpt = {
    iceServers: [{
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302'
      ]
    }]
  };

  let epOpt = {};

  let scopes = {};
  let observers = {};

  /*
   * ItoProvider base class
   */
  self.ItoProvider = class ItoProvider {
    constructor(parent) {
      this.signIn = {};
      this.parent = parent;
      Object.defineProperty(this, 'parent', { enumerable: false });
    }

    /*
     * Client: Login
     */
    onStateChange(s) {
      if (state !== s) {
        state = s;
        this.parent.emit(new ItoStateChangeEvent(s));
      }
    }

    onOnline(b) {
      setTimeout(reconnectAll, 500);
      this.onStateChange(b ? 'online' : 'offline');
    }

    onDisconnect() {
      if (state !== 'uninitialized')
        this.onStateChange('disconnected');
    }

    /*
     * Client: User Accounts and Status
     */
    onRequest(key, profile, usePasscode, options) {
      this.parent.emit(new ItoRequestEvent(key, profile, usePasscode, options));
    }

    onAccept(key, profile) {
      this.parent.emit(new ItoAcceptEvent(key, profile));
    }

    onReject(key) {
      this.parent.emit(new ItoRejectEvent(key));
    }

    onAddFriend(key, uid, friend) {
      friends[uid] = friend;
      this.parent.emit(new ItoAddFriendEvent('add', key, uid, Object.assign(friend)));
    }

    onUpdateFriend(uid, friend) {
      if (friends[uid] instanceof Object) {
        if(Object.keys(friend).reduce((a, b) => {
          let f = (b in friends[uid]) && (friends[uid][b] !== friend[b]);
          friends[uid][b] = friend[b];
          return a || f;
        }, false))
          this.parent.emit(new ItoFriendEvent('update', uid, Object.assign(friends[uid])));
        if (friends[uid].status === 'offline')
          setTimeout(onFriendOffline.bind(this, uid), 500);
      }
    }

    onRemoveFriend(uid) {
      if (friends[uid] instanceof Object) {
        let f = friends[uid];
        delete friends[uid];
        delete endpoints[uid];
        this.parent.emit(new ItoFriendEvent('remove', uid, f));
        onFriendOffline(uid);
      }
    }

    /*
     * Client: Messages
     */
    onMessage(uid, msg) {
      this.parent.emit(new ItoMessageEvent(uid, msg));
    }

    onMessageAck(uid, key) {
      this.parent.emit(new ItoMessageAckEvent(uid, key));
    }

    /*
     * Client: notifications
     */
    onNotification(data) {
      this.parent.emit(new ItoNotificationEvent(data));
    }

    /*
     * Client: WebRTC Signaling
     */
    onInvite(options) {
      let uid = options.uid;
      let cid = options.cid;
      if (!MediaStream || !RTCPeerConnection)
        provider.sendReject(uid, cid, 'incompatible');
      else if (endpoints[uid] && endpoints[uid][cid])
        provider.sendReject(uid, cid, 'unexpected_id');
      else {
        if (!endpoints[uid])
          endpoints[uid] = {};
        let e = new ItoEndpoint(uid, cid, false, options.dataChannel);
        e.setReceiveTrack(options);
        endpoints[uid][cid] = e;
        this.parent.emit(new ItoInviteEvent(e));
      }
    }

    onReconnect(options) {
      let uid = options.uid;
      let cid = options.cid;
      if (endpoints[uid] && endpoints[uid][cid]) {
        let e = endpoints[uid][cid];
        let stream = e.inputStream;
        let opt = {
          audio: !!stream && stream.getAudioTracks().length > 0,
          video: !!stream && stream.getVideoTracks().length > 0
        };
        e.setReceiveTrack(options);
        e.isOfferer = false;
        provider.sendAccept(uid, cid, opt).then(() => {
          onEndpointStateChange(uid, cid, 'connecting');
          createPeerConnection(e);
        });
      }
    }

    onAcceptInvite(options) {
      let uid = options.uid;
      let cid = options.cid;
      if (endpoints[uid] && endpoints[uid][cid]) {
        let e = endpoints[uid][cid];
        e.setReceiveTrack(options);
        createPeerConnection(e);
      }
    }

    onClose(options) {
      let uid = options.uid;
      let cid = options.cid;
      if (endpoints[uid] && endpoints[uid][cid]) {
        let e = endpoints[uid][cid];
        let opt = epOpt[uid][cid];
        let pc = e.peerConnection;
        if (pc)
          pc.close();
        const isRejected = (e.isOfferer && e.state === 'inviting');
        onEndpointStateChange(uid, cid, 'closed');
        delete endpoints[uid][cid];
        delete epOpt[uid][cid];
        const reason = options.reason || 'terminated';
        if (isRejected)
          e.emit(new ItoEndpointRejectEvent(e, reason));
        else
          e.emit(new ItoEndpointEvent('close', e));
      }
    }

    onSignaling(options) {
      let uid = options.uid;
      let cid = options.cid;
      if (endpoints[uid] && endpoints[uid][cid]) {
        let e = endpoints[uid][cid];
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
    onElementAdd(uid, name, key, data) {
      if (!(uid in observers) || !(name in observers[uid]))
        return;
      let observer = observers[uid][name];
      observer.emit(new ItoDataObserverElementEvent(observer, 'add', key, data));
    }

    onElementUpdate(uid, name, key, data) {
      if (!(uid in observers) || !(name in observers[uid]))
        return;
      let observer = observers[uid][name];
      observer.emit(new ItoDataObserverElementEvent(observer, 'update', key, data));
    }

    onElementRemove(uid, name, key) {
      if (!(uid in observers) || !(name in observers[uid]))
        return;
      let observer = observers[uid][name];
      observer.emit(new ItoDataObserverElementEvent(observer, 'remove', key));
    }
  };

  /*
   * ItoEmitter base class
   */
  class ItoEmitter {
    constructor() {
      this._ = {};
    }

    on(type, func) {
      if (!this._[type])
        this._[type] = [];
      if (this._[type].indexOf(func) < 0)
        this._[type].push(func);
    }

    emit(event) {
      if (!(event instanceof ItoEvent))
        return;
      if (this._[event.type]) {
        this._[event.type].forEach(func => { func.call(null, event); });
      }
    }

    removeListener(type, func) {
      if (this._[type])
        this._[type].splice(this._[type].indexOf(func), 1);
    }

    removeAllListeners(type) {
      delete this._[type];
    }
  }

  /*
   * ItoEvent and descendant classes
   */
  class ItoEvent {
    constructor(type) {
      this.type = type;
      this.target = self.ito;
    }
  }

  class ItoStateChangeEvent extends ItoEvent {
    constructor(state) {
      super('statechange');
      this.state = state;
    }
  }

  class ItoRequestEvent extends ItoEvent {
    constructor(key, profile, usePasscode, options) {
      super('request');
      this.key = key;
      this.profile = profile;
      this.status = 'pending';
      this.usePasscode = usePasscode;
      this.options = options;
    }

    accept() {
      let key = this.key;
      let m = this.profile.email;
      let uid = this.profile.uid;
      let u = this.usePasscode;
      if (this.status !== 'pending')
        return Promise.reject(new Error('already ' + this.status));
      this.status = 'accepted';
      return new Promise((resolve, reject) => {
        provider.dropRequest(key, u).then(() => {
          return provider.acceptRequest(key, m, uid, u);
        }).then(() => {
          resolve();
        });
      });
    }

    reject() {
      let key = this.key;
      let m = this.profile.email;
      let uid = this.profile.uid;
      let u = this.usePasscode;
      if (this.status !== 'pending')
        return Promise.reject(new Error('already ' + this.status));
      this.status = 'rejected';
      return new Promise((resolve, reject) => {
        provider.dropRequest(key, u).then(() => {
          return provider.rejectRequest(key, m, uid, u);
        });
      });
    }
  }

  class ItoAcceptEvent extends ItoEvent {
    constructor(key, profile) {
      super('accept');
      this.key = key;
      this.profile = profile;
    }
  }

  class ItoRejectEvent extends ItoEvent {
    constructor(key) {
      super('reject');
      this.key = key;
    }
  }

  class ItoFriendEvent extends ItoEvent {
    constructor(type, uid, profile) {
      super(type + 'friend');
      this.uid = uid;
      this.profile = profile;
    }
  }

  class ItoAddFriendEvent extends ItoFriendEvent {
    constructor(type, key, uid, profile) {
      super(type, uid, profile);
      this.key = key;
    }
  }

  class ItoMessageEvent extends ItoEvent {
    constructor(uid, msg) {
      super('message');
      this.uid = uid;
      this.data = msg;
    }
  }

  class ItoMessageAckEvent extends ItoEvent {
    constructor(uid, key) {
      super('messageack');
      this.uid = uid;
      this.messageKey = key;
    }
  }

  class ItoInviteEvent extends ItoEvent {
    constructor(endpoint) {
      super('invite');
      this.endpoint = endpoint;
    }
  }

  class ItoNotificationEvent extends ItoEvent {
    constructor(data) {
      super('notification');
      this.data = data; // an array of notifications (timestamp, data)
    }
  }

  /*
   * Main Object
   */
  class Ito extends ItoEmitter {
    constructor() {
      super();
      this.profile = {};
      Object.defineProperties(this, {
        state: { get: () => { return state; } },
        profile: { get: () => { return profile; } },
        passcode: { get: () => { return provider.getPasscode(); } },
        peerConnectionOptions: {
          get: () => { return pcOpt; },
          set: opt => { if (opt instanceof Object) pcOpt = Object.assign(pcOpt); }
        }
      });
    }

    /*
     * Client: Login
     */
    init(p, arg, url) {
      return new Promise((resolve, reject) => {
        if (state !== 'uninitialized')
          resolve();
        else if (!(p instanceof ItoProvider))
          reject(new Error('Incorrect Provider'));
        else {
          provider = p;

          // load WebRTC adapter
          const adapter = document.createElement('script');
          adapter.src = 'https://webrtc.github.io/adapter/adapter-latest.js';
          adapter.onload = () => {
            p.load(url).then(() => {
              return p.init(arg);
            }).then(b => {
              provider.onOnline(b);
              resolve(p.getUser());
            }, error => {
              if(error === true) {
                provider.onOnline(false);
                reject('duplicated sign-in');
              }
              else
                reject(error);
            });
          };
          const h = document.querySelector('head');
          h.insertBefore(adapter, h.firstChild);
        }
      });
    }

    signIn(p, id, pass) {
      return new Promise((resolve, reject) => {
        let user = provider.getUser();
        switch (state) {
          case 'uninitialized':
            reject(new Error('not initialized'));
            break;
          case 'online':
            resolve(provider.getUser());
            break;
          case 'disconnected':
            if (user)
              resolve(user);
            else
              reject(new Error('network offline'));
            break;
          case 'offline':
            if (provider.signIn[p])
              provider.signIn[p](id, pass).then(u => {
                state = 'online';
                resolve(u);
              }, error => {
                reject(error === true ? new Error('duplicated sign-in') : error);
              });
            else
              reject(new Error('auth provider is not indicated or wrong'));
            break;
        }
      })
    }

    updateUserName(name) {
      return provider.updateUserName(name);
    }

    signOut() {
      return !profile.uid ? Promise.resolve() : new Promise((resolve, reject) => {
        Object.keys(profile.isAnonymous ? friends : {}).reduce((a, b) => {
          return a.then(provider.sendRemove.bind(this, b, friends[b].email))
        }, Promise.resolve()).then(() => {
          provider.signOut().then(() => {
            resolve();
          }, error => {
            reject(error);
          })
        });
      });
    }

    /*
     * Client: User Accounts and Status
     */
    request(m, opt) {
      if (!provider.getUser())
        return Promise.reject(new Error('not signed in'));
      for (let i in friends) {
        if (friends[i].email === m)
          return Promise.reject(new Error('already registered as a friend: ' + m + ' (uid: ' + i + ')'));
      }
      return provider.sendRequest(m, opt);
    }

    setPasscode(pass) {
      return provider.setPasscode(pass);
    }

    remove(uid) {
      return friends[uid] ? provider.sendRemove(uid, friends[uid].email) : Promise.reject(new Error('not registered as a friend: ' + uid));
    }

    /*
     * Client: Messages
     */
    send(uid, msg) {
      if (!friends[uid])
        return Promise.reject(new Error('not registered as a friend: ' + uid));
      else
        return provider.sendMessage(uid, msg);
    }

    /*
     * Client: notifications
     */

    sendNotification(msg) {
      return provider.sendNotification(msg);
    }

    /*
     * Client: WebRTC Signaling
     */
    invite(uid, stream, opt) {
      if(!(stream instanceof MediaStream) && stream !== null)
        return Promise.reject(new Error('the second argument is neigher an instance of MediaStream nor null.'));
      if(!(opt instanceof Object))
        return Promise.reject(new Error('the third argument is not an appropriate option.'));
      return new Promise((resolve, reject) => {
        if (!MediaStream || !RTCPeerConnection)
          reject(new Error('WebRTC is not available on this browser'))
        else if (!friends[uid])
          reject(new Error('not registered as a friend: ' + uid));
        // else if(friends[uid].status !== 'online')
        //   reject(new Error('not online: ' + uid));
        else if (MediaStream && stream && !(stream instanceof MediaStream))
          reject(new Error('the second parameter (\'stream\') is invalid)'));
        else {
          let options = {
            audio: !!stream && stream.getAudioTracks().length > 0,
            video: !!stream && stream.getVideoTracks().length > 0,
            dataChannel: opt && !!opt.dataChannel
          };
          provider.sendInvite(uid, options).then(cid => {
            if (!endpoints[uid])
              endpoints[uid] = {};
            let e = new ItoEndpoint(uid, cid, true, options.dataChannel);
            e.inputStream = stream;
            endpoints[uid][cid] = e;
            resolve(e);
          });
        }
      });
    };

    /*
     * Client: Simple Data Store Sharing
     */
    openDataStore(name, opt) {
      let scope = 'private';
      if (opt) {
        if(typeof name !== 'string' || !name.match(/^[\w\.-]{2,32}$/))
          throw new Error('data store name must be 2-32 letters of alphabet, number, underscore, period and/or minus.');
        else if (typeof opt.scope === 'string' && opt.scope.match(/^(public|friends|private)$/))
          scope = opt.scope;
        else
          throw new Error('the "scope" option must be "public", "friends" or "private".');
      }
      if (!(typeof name === 'string') || !name.match(/^.+$/))
        throw new Error('the specified data store name includes illegal letter(s).');
      return provider.openDataStore(scope, name).then(s => {
        return new ItoDataStore(s, name);
      });
    }

    observeDataStore(uid, name) {
      return provider.observeDataStore(uid, name).then(arg => {
        if (!(arg.uid in observers))
          observers[arg.uid] = {};
        let observer = new ItoDataObserver(arg.uid, arg.name);
        observers[arg.uid][arg.name] = observer;
        return observer;
      });
    }
  }
  self.ito = new Ito();

  /*
   * Internal functions
   */

  /*
   * Client: WebRTC Signaling
   */
  function onEndpointStateChange(uid, cid, s) {
    if (!endpoints[uid] || !endpoints[uid][cid])
      return;
    let e = endpoints[uid][cid];
    if (e.state !== s) {
      e.state = s;
      e.emit(new ItoEndpointStateChangeEvent(e));
    }
  }

  function onFriendOffline(uid) {
    if (friends[uid] && friends[uid].status !== 'online') {
      Object.keys(endpoints).forEach(cid => {
        provider.onClose({ uid: uid, cid: cid });
      });
      endpoints[uid] = {};
    }
  }

  function updateStream(e, stream) {
    let s = e.receivedStream;
    if (!s) {
      e.receivedStream = stream;
      e.emit(new ItoEndpointAddStreamEvent(e, stream));
    }
    else {
      if (s === stream)
        return;
      else {
        s.getTracks().filter(track => {
          return stream.getTracks().indexOf(track) < 0;
        }).forEach(track => {
          s.removeTrack(track);
        });
        stream.getTracks().forEach(track => {
          s.addTrack(track);
        });
      }
    }
  }

  function onDataChannelMessage(e, event) {
    e.emit(new ItoEndpointMessageEvent(e, event.data));
  }

  function onDataChannelOpen(e) {
    let uid = e.peer;
    let cid = e.connection;
    let opt = epOpt[uid][cid];
    e.dataChannel.addEventListener('message', onDataChannelMessage.bind(this, e));
    while (opt.buffer.length > 0) {
      e.send(opt.buffer.shift());
    }
  }

  function createPeerConnection(e) {
    let uid = e.peer;
    let cid = e.connection;
    let opt = epOpt[uid][cid];
    if (e.peerConnection)
      opt.peerConnection = e.peerConnection;
    let pc = new RTCPeerConnection(pcOpt);
    onEndpointStateChange(uid, cid, 'connecting');
    e.peerConnection = pc;
    pc.addEventListener('icecandidate', onIceCandidate.bind(pc, e));
    if (useTrack)
      pc.addEventListener('track', event => {
        updateStream(e, event.streams[0]);
      });
    else
      pc.addEventListener('addstream', event => {
        updateStream(e, event.stream);
      });
    pc.addEventListener('iceconnectionstatechange', () => {
      if (e.state === 'connecting' && pc.iceConnectionState.match(/^(connected|completed)$/)) {
        onEndpointStateChange(uid, cid, 'open');
        if (!opt.peerConnection) {
          e.emit(new ItoEndpointEvent('open', e));
        }
        else {
          opt.peerConnection.close();
          delete opt.peerConnection;
        }

        pc.addEventListener('negotiationneeded', event => {
          let f = opt.negotiationReady;
          opt.negotiationReady = false;
          opt.negotiationNeeded = true;
          if (f)
            sendReconnect(e);
        });
      }
    });
    if (opt.useDataChannel) {
      if (e.isOfferer) {
        e.dataChannel = pc.createDataChannel('ItoEndpoint');
        e.dataChannel.addEventListener('open', onDataChannelOpen.bind(this, e));
      }
      else
        pc.addEventListener('datachannel', event => {
          e.dataChannel = event.channel;
          onDataChannelOpen(e);
          e.emit(new ItoEndpointEvent('datachannel'));
        });
    }
    if (e.inputStream) {
      if (useTransceiver) {
        e.inputStream.getTracks().forEach(track => {
          // TODO: replace the following line into codes using addTransceiver()
        });
      }
      else {
        if (useTrack) {
          e.inputStream.getTracks().forEach(track => {
            pc.addTrack(track, e.inputStream);
          });
        }
        else
          pc.addStream(e.inputStream);
      }
    }
    if (e.isOfferer)
      sendOffer(e);
  }

  function createSdpOptions(e) {
    let opt = epOpt[e.peer][e.connection];
    let sdpOpt = {};
    if (opt && !useTransceiver) {
      sdpOpt = {
        offerToReceiveAudio: opt.receiveAudioTrack,
        offerToReceiveVideo: opt.receiveVideoTrack
      };
    }
    return sdpOpt;
  }

  function sendOffer(e) {
    let pc = e.peerConnection;
    pc.createOffer(createSdpOptions(e)).then(onSdp.bind(pc, e));
  }

  function reconnectAll() {
    Object.keys(endpoints).forEach(uid => {
      Object.keys(endpoints[uid]).forEach(cid => {
        let e = endpoints[uid][cid];
        if (e.isOfferer && e.peerConnection && e.peerConnection.iceConnectionState.match(/^(disconnected|failed)$/))
          sendReconnect(e);
      });
    });
  }

  function sendReconnect(e) {
    return new Promise((resolve, reject) => {
      let uid = e.peer;
      let cid = e.connection;
      let stream = e.inputStream;
      let opt = epOpt[uid][cid];
      let options = {
        audio: !!stream && stream.getAudioTracks().length > 0,
        video: !!stream && stream.getVideoTracks().length > 0,
        dataChannel: opt.dataChannel
      };
      e.isOfferer = true;
      provider.sendReconnect(uid, cid, options).then(() => {
        resolve();
      });
    })
  }

  function onSdp(e, sdp) {
    this.setLocalDescription(sdp).then(() => {
      provider.sendSignaling(e.peer, e.connection, 'sdp', sdp);
    });
  }

  function onIceCandidate(e, event) {
    if (event.candidate)
      provider.sendSignaling(e.peer, e.connection, 'iceCandidate', event.candidate);
  }

  function setRemoteSdp(e, data) {
    let pc = e.peerConnection;
    let sdp = new RTCSessionDescription(JSON.parse(data));
    pc.setRemoteDescription(sdp).then(() => {
      if (sdp.type === 'offer')
        pc.createAnswer(createSdpOptions(e)).then(onSdp.bind(pc, e));
    }, error => {
      console.log(error);
    });
  }

  function addIceCandidate(e, data) {
    e.peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(data)));
  }

  /*
   * Communication Endpoint
   */
  class ItoEndpointEvent extends ItoEvent {
    constructor(type, endpoint) {
      super(type);
      this.target = endpoint;
    }
  }

  class ItoEndpointStateChangeEvent extends ItoEndpointEvent {
    constructor(endpoint) {
      super('statechange', endpoint);
      this.state = endpoint.state;
    }
  }

  class ItoEndpointRejectEvent extends ItoEndpointEvent {
    constructor(endpoint, reason) {
      super('reject', endpoint);
      this.reason = reason;
    }
  }

  class ItoEndpointAddStreamEvent extends ItoEndpointEvent {
    constructor(endpoint, stream) {
      super('addstream', endpoint);
      this.stream = stream;
    }
  }

  class ItoEndpointRemoveStreamEvent extends ItoEndpointEvent {
    constructor(endpoint, stream) {
      super('removestream', endpoint);
      this.stream = stream;
    }
  }

  class ItoEndpointMessageEvent extends ItoEndpointEvent {
    constructor(endpoint, data) {
      super('message', endpoint);
      this.data = data;
    }
  }

  class ItoEndpoint extends ItoEmitter {
    constructor(uid, cid, isOfferer, data) {
      super();
      this.peer = uid;
      this.connection = cid;
      this.state = isOfferer ? 'inviting' : 'invited';
      this.isOfferer = isOfferer;
      this.peerConnection = null;
      this.dataChannel = null;
      this.inputStream = null;
      this.receivedStream = null;
      if (!epOpt[uid])
        epOpt[uid] = {};
      epOpt[uid][cid] = {
        receiveAudioTrack: false,
        receiveVideoTrack: false,
        useDataChannel: !!data,
        buffer: []
      }
    }

    setInputStream(stream) {
      if (stream && !(stream instanceof MediaStream))
        throw new Error('the first parameter is not an instance of MediaStream');
      let opt = epOpt[this.peer][this.connection];
      if (stream === this.inputStream)
        return;
      let oldStream = this.inputStream;
      this.inputStream = stream;
      let pc = this.peerConnection;
      if (pc && this.state === 'open') {
        opt.negotiationReady = false;
        opt.negotiationNeeded = false;
        if (useTrack) {
          if (oldStream) {
            oldStream.getTracks().filter(track => {
              let f = true;
              if (stream)
                stream.getTracks().forEach(t => {
                  f = f && track !== t;
                });
              return f;
            }).forEach(track => {
              pc.getSenders().forEach(sender => {
                if (sender.track === track)
                  pc.removeTrack(sender);
              });
            });
          }
          if (stream) {
            stream.getTracks().forEach(track => {
              pc.getSenders().forEach(sender => {
                if (sender.track !== track)
                  pc.addTrack(track, stream);
              })
            })
          }
        }
        else {
          if (oldStream)
            pc.removeStream(oldStream);
          if (stream)
            pc.addStream(stream);
        }
        opt.negotiationReady = true;
        if (opt.negotiationNeeded)
          sendReconnect(this);
      }
    }

    setReceiveTrack(arg) {
      let opt = epOpt[this.peer][this.connection];
      opt.receiveAudioTrack = !!arg.audio;
      opt.receiveVideoTrack = !!arg.video;
    }

    accept(stream, opt) {
      return new Promise((resolve, reject) => {
        if (this.isOfferer)
          reject(new Error('not answerer'));
        else if (this.state !== 'invited')
          reject(new Error('state is not \'invited\''));
        else if (MediaStream && stream && !(stream instanceof MediaStream))
          reject(new Error('the first parameter (\'stream\') is invalid)'));
        else {
          let uid = this.peer;
          let cid = this.connection;
          let options = {
            audio: !!stream && stream.getAudioTracks().length > 0,
            video: !!stream && stream.getVideoTracks().length > 0
          };
          this.inputStream = stream;
          provider.sendAccept(uid, cid, options).then((() => {
            resolve();
            onEndpointStateChange(uid, cid, 'connecting');
            createPeerConnection(this);
          }).bind(this));
        }
      });
    }

    reject() {
      return new Promise((resolve, reject) => {
        if (this.isOfferer)
          reject(new Error('not answerer'));
        else if (this.state !== 'invited')
          reject(new Error('state is not \'invited\''));
        else {
          provider.sendReject(this.peer, this.connection, 'rejected').then(() => {
            resolve();
            provider.onClose({ uid: this.peer, cid: this.connection });
          });
        }
      });
    }

    send(d) {
      let c = this.dataChannel;
      if (!c)
        throw new Error('data channel not open');
      else {
        let opt = epOpt[this.peer][this.connection];
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

    close() {
      return new Promise((resolve, reject) => {
        provider.sendClose(this.peer, this.connection).then(() => {
          resolve();
          provider.onClose({ uid: this.peer, cid: this.connection });
        })
      });
    }
  }

  /*
   * Client: Simple Data Store Sharing
   */

  class ItoDataStore /* extends ItoEmitter */ {
    constructor(scope, name) {
      // super();
      scopes[name] = scope;
      this.name = name;
    }

    get scope() {
      return scopes[this.name];
    }

    put(key, data) {
      if (!this.scope)
        return Promise.reject(new Error('the data store is already reset.'));
      return provider.putDataElement(this.name, key, data, this.scope);
    }

    get(key) {
      if (!this.scope)
        return Promise.reject(new Error('the data store is already reset.'));
      return provider.getDataElement(this.name, key).then(result => {
        return new ItoDataElement(this, result.key, result.data);
      });
    }

    getAll() {
      if (!this.scope)
        return Promise.reject(new Error('the data store is already reset.'));
      return provider.getAllDataElements(this.name).then(result => {
        let r = result || [];
        return Object.keys(r).reduce((a, b) => {
          a.push(new ItoDataElement(this, b, r[b]));
          return a;
        }, []);
      });
    }

    remove(key) {
      if (!this.scope)
        return Promise.reject(new Error('the data store is already reset.'));
      return provider.removeDataElement(this.name, key);
    }

    removeAll(key) {
      if (!this.scope)
        return Promise.reject(new Error('the data store is already reset.'));
      return provider.removeAllDataElements(this.name);
    }

    reset() {
      if (!this.scope)
        return Promise.reject(new Error('the data store is already reset.'));
      return provider.removeDataStore(this.name).then(() => {
        delete scopes[this.name];
      });
    }
  }

  class ItoDataElement {
    constructor(dataStore, key, data) {
      this.dataStore = dataStore;
      this.key = key;
      this.data = data;
      Object.defineProperties(this, {
        dataStore: {
          enumerable: false
        }
      });
    }
  }

  class ItoDataObserver extends ItoEmitter {
    constructor(uid, dataStore) {
      super();
      this.uid = uid;
      this.dataStore = dataStore;
    }

    disconnect() {
      provider.disconnectDataStoreObserver(this.uid, this.dataStore);
    }
  };

  class ItoDataObserverEvent extends ItoEvent {
    constructor(type, observer) {
      super();
      this.type = type;
      this.target = observer;
    }
  }

  class ItoDataObserverElementEvent extends ItoDataObserverEvent {
    constructor(observer, type, key, data) {
      super('element' + type, observer);
      this.key = key;
      this.data = data;
    }
  }

  if (!isBrowser) {
    self.ito.ItoProvider = self.ItoProvider;
    module.exports = {
      ito: self.ito,
      localStorage: self.localStorage
    };
  }
})((typeof window === 'object' ? window : global), typeof window === 'object');
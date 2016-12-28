'use strict';

((self, isBrowser) => {
  if(isBrowser) {
    self.RTCPeerConnection = 
      self.RTCPeerConnection ||
      self.webkitRTCPeerConnection ||
      self.mozRTCPeerConnection;
    self.MediaStream =
      self.MediaStream ||
      self.webkitMediaStream;
  }

  /*
   * Global Objects
   */
  self.ItoProvider = function() {};

  var ItoEmitter = function() {};
  ItoEmitter.prototype.on = function(type, func) {
    if(!this._)
      this._ = {};
    if(!this._[type])
      this._[type] = [];
    if(this._[type].indexOf(func) < 0)
      this._[type].push(func);
  };
  ItoEmitter.prototype.emit = function(event) {
    if(!(event instanceof ItoEvent))
      return;
    if(!this._)
      this._ = {};
    else if(this._[event.type]) {
      this._[event.type].forEach(func => { func.call(null, event); });
    }
  };
  ItoEmitter.prototype.removeListener = function(type, func) {
    if(!this._)
      this._ = {};
    else if(this._[type])
      this._[type].splice(this._[type].indexOf(func), 1);
  };
  ItoEmitter.prototype.removeAllListeners = function(type) {
    if(!this._)
      this._ = {};
    else
      delete this._[type];
  }

  var ItoEvent = function(type) {
    this.type = type;
    this.target = self.ito;
  }

  var ItoStateChangeEvent = function(state) {
    ItoEvent.call(this, 'statechange');
    this.state = state;
  }
  Object.setPrototypeOf(ItoStateChangeEvent.prototype, ItoEvent.prototype);

  var ItoRequestEvent = function(key, profile, usePasscode, options) {
    ItoEvent.call(this, 'request');
    this.key = key;
    this.profile = profile;
    this.status = 'pending';
    this.usePasscode = usePasscode;
    this.options = options;
  }
  Object.setPrototypeOf(ItoRequestEvent.prototype, ItoEvent.prototype);

  var ItoAcceptEvent = function(key, profile) {
    ItoEvent.call(this, 'accept');
    this.key = key;
    this.profile = profile;
  }
  Object.setPrototypeOf(ItoAcceptEvent.prototype, ItoEvent.prototype);

  var ItoRejectEvent = function(key) {
    ItoEvent.call(this, 'reject');
    this.key = key;
  }
  Object.setPrototypeOf(ItoRejectEvent.prototype, ItoEvent.prototype);

  var ItoFriendEvent = function(type, uid, profile) {
    ItoEvent.call(this, type + 'friend');
    this.uid = uid;
    this.profile = profile;
  };
  Object.setPrototypeOf(ItoFriendEvent.prototype, ItoEvent.prototype);

  var ItoMessageEvent = function(uid, msg) {
    ItoEvent.call(this, 'message');
    this.uid = uid;
    this.data = msg;
  }
  Object.setPrototypeOf(ItoMessageEvent.prototype, ItoEvent.prototype);

  var ItoMessageAckEvent = function(uid, key) {
    ItoEvent.call(this, 'messageack');
    this.uid = uid;
    this.messageKey = key;
  }
  Object.setPrototypeOf(ItoMessageAckEvent.prototype, ItoEvent.prototype);

  var ItoInviteEvent = function(endpoint) {
    ItoEvent.call(this, 'invite');
    this.endpoint = endpoint;
  }
  Object.setPrototypeOf(ItoInviteEvent.prototype, ItoEvent.prototype);

  var ItoNotificationEvent = function(data) {
    ItoEvent.call(this, 'notification');
    this.data = data; // an array of notifications (timestamp, data)
  }
  Object.setPrototypeOf(ItoNotificationEvent.prototype, ItoEvent.prototype);

  /*
   * Main Object
   */
  var Ito = function(){};
  Object.setPrototypeOf(Ito.prototype, ItoEmitter.prototype);
  self.ito = new Ito();

  let provider = null;
  let state = 'uninitialized';
  let profile = {};
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
        return user ? user.email: null;
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
  let friends = {};

  /*
   * Client: Login
   */
  function onStateChange(s) {
    if(state !== s) {
      state = s;
      ito.emit(new ItoStateChangeEvent(s));
    }
  }
  ItoProvider.prototype.onStateChange = onStateChange;

  function onOnline(b) {
    setTimeout(reconnectAll, 500);
    onStateChange(b ? 'online' : 'offline');
  }
  ItoProvider.prototype.onOnline = onOnline;

  function onDisconnect() {
    if(state !== 'uninitialized')
      onStateChange('disconnected');
  }
  ItoProvider.prototype.onDisconnect = onDisconnect;

  ito.init = function(p, arg) {
    return new Promise((resolve, reject) => {
      if(state !== 'uninitialized')
        resolve();
      else if(!(p instanceof ItoProvider))
        reject(new Error('Incorrect Provider'));
      else {
        provider = p;
        p.load().then(p.init.bind(this, arg)).then((b) => {
          onOnline(b);
          resolve(p.getUser());
        }, error => {
          reject(error);
        });
      }
    });
  };

  ito.signIn = function(p, id, pass) {
    return new Promise((resolve, reject) => {
      let user = provider.getUser();
      switch(state) {
      case 'uninitialized':
        reject(new Error('not initialized'));
        break;
      case 'online':
        resolve(provider.getUser());
        break;
      case 'disconnected':
        if(user)
          resolve(user);
        else
          reject(new Error('network offline'));
        break;
      case 'offline':
        if(provider.signIn[p])
          provider.signIn[p](id, pass).then(u => {
            state = 'online';
            resolve(u);
          }, error => {
            reject(new Error(error));
          });
        else
          reject('auth provider is not indicated or wrong');
        break;
      }
    })
  };

  ito.signOut = function() {
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
  };

  /*
   * Client: User Accounts and Status
   */
  function onRequest(key, profile, usePasscode, options) {
    ito.emit(new ItoRequestEvent(key, profile, usePasscode, options));
  }
  ItoProvider.prototype.onRequest = onRequest;

  function onAccept(key, profile) {
    ito.emit(new ItoAcceptEvent(key, profile));
  }
  ItoProvider.prototype.onAccept = onAccept;

  function onReject(key) {
    ito.emit(new ItoRejectEvent(key));
  }
  ItoProvider.prototype.onReject = onReject;

  function onAddFriend(uid, friend) {
    friends[uid] = friend;
    ito.emit(new ItoFriendEvent('add', uid, Object.assign(friend)));
  }
  ItoProvider.prototype.onAddFriend = onAddFriend;

  function onUpdateFriend(uid, friend) {
    if(friends[uid] instanceof Object) {
      Object.keys(friend).forEach(i => {
        friends[uid][i] = friend[i];
      });
      ito.emit(new ItoFriendEvent('update', uid, Object.assign(friends[uid])));
      if(friends[uid].status === 'offline')
        setTimeout(onFriendOffline.bind(this, uid), 500);
    }
  }
  ItoProvider.prototype.onUpdateFriend = onUpdateFriend;

  function onRemoveFriend(uid) {
    if(friends[uid] instanceof Object) {
      let f = friends[uid];
      delete friends[uid];
      ito.emit(new ItoFriendEvent('remove', uid, f));
      onFriendOffline(uid);
    }
  }
  ItoProvider.prototype.onRemoveFriend = onRemoveFriend;

  ito.request = (m, opt) => {
    if(!provider.getUser())
      return Promise.reject(new Error('not signed in'));
    for(let i in friends) {
      if(friends[i].email === m)
        return Promise.reject(new Error('already registered as a friend: ' + m + ' (uid: ' + i + ')'));
    }
    return provider.sendRequest(m, opt);
  };

  ito.setPasscode = pass => {
    return provider.setPasscode(pass);
  }

  ito.remove = function(uid) {
    return friends[uid] ? provider.sendRemove(uid, friends[uid].email) : Promise.reject(new Error('not registered as a friend: ' + uid));
  };

  function acceptRequest() {
    let key = this.key;
    let m = this.profile.email;
    let uid = this.profile.uid;
    let u = this.usePasscode;
    if(this.status !== 'pending')
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
  ItoRequestEvent.prototype.accept = acceptRequest;

  function rejectRequest() {
    let key = this.key;
    let m = this.profile.email;
    let uid = this.profile.uid;
    let u = this.usePasscode;
    if(this.status !== 'pending')
      return Promise.reject(new Error('already ' + this.status));
    this.status = 'rejected';
    return new Promise((resolve, reject) => {
      provider.dropRequest(key, u).then(() => {
        return provider.rejectRequest(key, m, uid, u);
      });
    });
  }
  ItoRequestEvent.prototype.reject = rejectRequest;

  /*
   * Client: Messages
   */

  ito.send = (uid, msg) => {
    if(!friends[uid])
      return Promise.reject(new Error('not registered as a friend: ' + uid));
    else
      return provider.sendMessage(uid, msg);
  };

  function onMessage(uid, msg) {
    ito.emit(new ItoMessageEvent(uid, msg));
  }
  ItoProvider.prototype.onMessage = onMessage;

  function onMessageAck(uid, key) {
    ito.emit(new ItoMessageAckEvent(uid, key));
  }
  ItoProvider.prototype.onMessageAck = onMessageAck;

  /*
   * Client: notifications
   */

  ito.sendNotification = msg => {
    return provider.sendNotification(msg);
  };

  function onNotification(data) {
    ito.emit(new ItoNotificationEvent(data));
  }
  ItoProvider.prototype.onNotification = onNotification;

  /*
   * Client: WebRTC Signaling
   */
  const useTrack = !!self.RTCRtpSender;
  const useTransceiver = !!self.RTCRtpTransceiver;
  let endpoints = {};

  ito.invite = function(uid, stream, opt) {
    return new Promise((resolve, reject) => {
      if(!MediaStream)
        reject(new Error('WebRTC is not available on this browser'))
      else if(!friends[uid])
        reject(new Error('not registered as a friend: ' + uid));
      // else if(friends[uid].status !== 'online')
      //   reject(new Error('not online: ' + uid));
      else if(MediaStream && stream && !(stream instanceof MediaStream))
        reject(new Error('the second parameter (\'stream\') is invalid)'));
      else {
        let options = {
          audio: !!stream && stream.getAudioTracks().length > 0,
          video: !!stream && stream.getVideoTracks().length > 0,
          dataChannel: opt && !!opt.dataChannel
        };
        provider.sendInvite(uid, options).then(cid => {
          if(!endpoints[uid])
            endpoints[uid] = {};
          let e = new ItoEndpoint(uid, cid, true, opt.dataChannel);
          e.inputStream = stream;
          endpoints[uid][cid] = e;
          resolve(e);
        });
      }
    });
  };

  function onEndpointStateChange(uid, cid, s) {
    if(!endpoints[uid] || !endpoints[uid][cid])
      return;
    let e = endpoints[uid][cid];
    if(e.state !== s) {
      e.state = s;
      e.emit(new ItoEndpointStateChangeEvent(e));
    }
  }

  function onFriendOffline(uid) {
    if(friends[uid] && friends[uid].status !== 'online') {
      Object.keys(endpoints).forEach(cid => {
        onClose({ uid: uid, cid: cid });
      });
      endpoints[uid] = {};
    }
  }

  function onInvite(options) {
    let uid = options.uid;
    let cid = options.cid;
    if(!MediaStream || !RTCPeerConnection)
      provider.sendReject(uid, cid, 'incompatible');
    else if(endpoints[uid] && endpoints[uid][cid])
      provider.sendReject(uid, cid, 'unexpected_id');
    else {
      if(!endpoints[uid])
        endpoints[uid] = {};
      let e = new ItoEndpoint(uid, cid, false, options.dataChannel);
      e.setReceiveTrack(options);
      endpoints[uid][cid] = e;
      ito.emit(new ItoInviteEvent(e));
    }
  }
  ItoProvider.prototype.onInvite = onInvite;

  function onReconnect(options) {
    let uid = options.uid;
    let cid = options.cid;
    if(endpoints[uid] && endpoints[uid][cid]) {
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
  ItoProvider.prototype.onReconnect = onReconnect;

  function onAcceptInvite(options) {
    let uid = options.uid;
    let cid = options.cid;
    if(endpoints[uid] && endpoints[uid][cid]) {
      let e = endpoints[uid][cid];
      e.setReceiveTrack(options);
      createPeerConnection(e);
    }
  }
  ItoProvider.prototype.onAcceptInvite = onAcceptInvite;

  function onClose(options) {
    let uid = options.uid;
    let cid = options.cid;
    if(endpoints[uid] && endpoints[uid][cid]) {
      let e = endpoints[uid][cid];
      let opt = epOpt[uid][cid];
      let pc = e.peerConnection;
      if(pc)
        pc.close();
      onEndpointStateChange(uid, cid, 'closed');
      delete endpoints[uid][cid];
      delete epOpt[uid][cid];
      if(opt.reject) {
        const reason = options.reason ? options.rejected : 'terminated';
        opt.reject(new Error(reason));
        if(e.isOfferer) {
          e.emit(new ItoEndpointRejectEvent(e, reason));
          return;
        }
      }
      e.emit(new ItoEndpointEvent('close', e));
    }
  }
  ItoProvider.prototype.onClose = onClose;

  function onSignaling(options) {
    let uid = options.uid;
    let cid = options.cid;
    if(endpoints[uid] && endpoints[uid][cid]) {
      let e = endpoints[uid][cid];
      switch(options.signalingType) {
      case 'sdp':
        setRemoteSdp(e, options.data);
        break;
      case 'iceCandidate':
        addIceCandidate(e, options.data);
        break;
      }
    }
  }
  ItoProvider.prototype.onSignaling = onSignaling;

  function updateStream(e, stream) {
    let s = e.receivedStream;
    if(!s) {
      console.log('stream', stream);
      e.receivedStream = stream;
      e.emit(new ItoEndpointAddStreamEvent(e, stream));
    }
    else {
      if(s === stream)
        return;
      else {
        s.getTracks().filter(track => {
          return stream.getTracks().indexOf(track) < 0;
        }).forEach(track => {
          console.log('removetrack', track);
          s.removeTrack(track);
        });
        stream.getTracks().forEach(track => {
          console.log('addtrack', track);
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
    while(opt.buffer.length > 0) {
      e.send(opt.buffer.shift());
    }
  }

  function createPeerConnection(e) {
    let uid = e.peer;
    let cid = e.connection;
    let opt = epOpt[uid][cid];
    if(e.peerConnection)
      opt.peerConnection = e.peerConnection;
    let pc = new RTCPeerConnection(pcOpt);
    onEndpointStateChange(uid, cid, 'connecting');
    e.peerConnection = pc;
    pc.addEventListener('icecandidate', onIceCandidate.bind(pc, e));
    if(useTrack)
      pc.addEventListener('track', event => {
        updateStream(e, event.streams[0]);
      });
    else
      pc.addEventListener('addstream', event => {
        updateStream(e, event.stream);
      });
    pc.addEventListener('iceconnectionstatechange', () => {
      if(e.state === 'connecting' && pc.iceConnectionState.match(/^(connected|completed)$/)) {
        let resolve = opt.resolve;
        if(resolve) {
          delete opt.resolve;
          delete opt.reject;
          resolve();
        }
        onEndpointStateChange(uid, cid, 'open');
        if(!opt.peerConnection) {
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
          console.log('negotiationready', opt.negotiationReady);
          if(f)
            sendReconnect(e);
        });
      }
    });
    if(opt.useDataChannel) {
      if(e.isOfferer) {
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
    if(e.inputStream) {
      if(useTransceiver) {
        e.inputStream.getTracks().forEach(track => {
          // TODO: replace the following line into codes using addTransceiver()
        });
      }
      else {
        if(useTrack) {
          e.inputStream.getTracks().forEach(track => {
            pc.addTrack(track, e.inputStream);
          });
        }
        else
          pc.addStream(e.inputStream);
      }
    }
    if(e.isOfferer)
      sendOffer(e);
  }

  function createSdpOptions(e) {
    let opt = epOpt[e.peer][e.connection];
    let sdpOpt = {};
    if(opt && !useTransceiver) {
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
        if(e.isOfferer && e.peerConnection.iceConnectionState.match(/^(disconnected|failed)$/))
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
      console.log('local', sdp.type);
      provider.sendSignaling(e.peer, e.connection, 'sdp', sdp);
    });
  }

  function onIceCandidate(e, event) {
    if(event.candidate)
      provider.sendSignaling(e.peer, e.connection, 'iceCandidate', event.candidate);
  }

  function setRemoteSdp(e, data) {
    let pc = e.peerConnection;
    let sdp = new RTCSessionDescription(JSON.parse(data));
    pc.setRemoteDescription(sdp).then(() => {
      console.log('remote', sdp.type);
      if(sdp.type === 'offer')
        pc.createAnswer(createSdpOptions(e)).then(onSdp.bind(pc, e));
    }, error => {
      console.log(error);
    });
  }

  function addIceCandidate(e, data) {
    e.peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(data)));
  }

  /*
   * Client Properties
   */
  let pcOpt = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]};

  Object.defineProperties(ito, {
    state: { get: () => { return state; }},
    profile: { get: () => { return profile; }},
    passcode: { get: () => { return provider.getPasscode(); }},
    peerConnectionOptions: {
      get: () => { return pcOpt; },
      set: opt => { if(opt instanceof Object) pcOpt = Object.assign(pcOpt); }
    }
  });

  /*
   * Communication Endpoint
   */
  let epOpt = {};

  var ItoEndpointEvent = function(type, endpoint) {
    this.type = type;
    this.target = endpoint;
  }
  Object.setPrototypeOf(ItoEndpointEvent.prototype, ItoEvent.prototype);

  var ItoEndpointStateChangeEvent = function(endpoint) {
    ItoEndpointEvent.call(this, 'statechange', endpoint);
    this.state = endpoint.state;
  }
  Object.setPrototypeOf(ItoEndpointStateChangeEvent.prototype, ItoEndpointEvent.prototype);

  var ItoEndpointRejectEvent = function(endpoint, reason) {
    ItoEndpointEvent.call(this, 'reject', endpoint);
    this.reason = reason;
  }
  Object.setPrototypeOf(ItoEndpointRejectEvent.prototype, ItoEndpointEvent.prototype);

  var ItoEndpointAddStreamEvent = function(endpoint, stream) {
    ItoEndpointEvent.call(this, 'addstream', endpoint);
    this.stream = stream;
  }
  Object.setPrototypeOf(ItoEndpointAddStreamEvent.prototype, ItoEndpointEvent.prototype);

  var ItoEndpointRemoveStreamEvent = function(endpoint, stream) {
    ItoEndpointEvent.call(this, 'removestream', endpoint);
    this.stream = stream;
  }
  Object.setPrototypeOf(ItoEndpointRemoveStreamEvent.prototype, ItoEndpointEvent.prototype);

  var ItoEndpointMessageEvent = function(endpoint, data) {
    ItoEndpointEvent.call(this, 'message', endpoint);
    this.data = data;
  }
  Object.setPrototypeOf(ItoEndpointMessageEvent.prototype, ItoEndpointEvent.prototype);

  var ItoEndpoint = function(uid, cid, isOfferer, data) {
    this.peer = uid;
    this.connection = cid;
    this.state = isOfferer ? 'inviting' : 'invited';
    this.isOfferer = isOfferer;
    this.peerConnection = null;
    this.dataChannel = null;
    this.inputStream = null;
    this.receivedStream = null;
    if(!epOpt[uid])
      epOpt[uid] = {};
    epOpt[uid][cid] = {
      receiveAudioTrack: false,
      receiveVideoTrack: false,
      useDataChannel: !!data,
      buffer: []
    }
    this.ready = new Promise(((resolve, reject) => {
      const uid = this.peer;
      const cid = this.connection;
      epOpt[uid][cid].resolve = resolve;
      epOpt[uid][cid].reject = reject;
    }).bind(this));
  };
  Object.setPrototypeOf(ItoEndpoint.prototype, ItoEmitter.prototype);

  ItoEndpoint.prototype.setInputStream = function(stream) {
    if(stream && !(stream instanceof MediaStream))
      throw new Error('the first parameter is not an instance of MediaStream');
    let opt = epOpt[this.peer][this.connection];
    if(stream === this.inputStream)
      return;
    let oldStream = this.inputStream;
    this.inputStream = stream;
    let pc = this.peerConnection;
    if(pc && this.state === 'open') {
      opt.negotiationReady = false;
      opt.negotiationNeeded = false;
      if(useTrack) {
        if(oldStream) {
          oldStream.getTracks().filter(track => {
            let f = true;
            if(stream)
              stream.getTracks().forEach(t => {
                f = f && track !== t;
              });
            return f;
          }).forEach(track => {
            pc.getSenders().forEach(sender => {
              if(sender.track === track)
                pc.removeTrack(sender);
            });
          });
        }
        if(stream) {
          stream.getTracks().forEach(track => {
            pc.getSenders().forEach(sender => {
              if(sender.track !== track)
                pc.addTrack(track, stream);
            })
          })
        }
      }
      else {
        if(oldStream)
          pc.removeStream(oldStream);
        if(stream)
          pc.addStream(stream);
      }
      opt.negotiationReady = true;
      if(opt.negotiationNeeded)
        sendReconnect(this);
    }
  }

  ItoEndpoint.prototype.setReceiveTrack = function(arg) {
    let opt = epOpt[this.peer][this.connection];
    opt.receiveAudioTrack = !!arg.audio;
    opt.receiveVideoTrack = !!arg.video;
  }

  ItoEndpoint.prototype.accept = function(stream, opt) {
    return new Promise((resolve, reject) => {
      if(this.isOfferer)
        reject(new Error('not answerer'));
      else if(this.state !== 'invited')
        reject(new Error('state is not \'invited\''));
      else if(MediaStream && stream && !(stream instanceof MediaStream))
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
  };

  ItoEndpoint.prototype.reject = function() {
    return new Promise((resolve, reject) => {
      if(this.isOfferer)
        reject(new Error('not answerer'));
      else if(this.state !== 'invited')
        reject(new Error('state is not \'invited\''));
      else {
        provider.sendReject(this.peer, this.connection, 'rejected').then(() => {
          resolve();
          onClose({ uid: this.peer, cid: this.connection });
        });
      }
    });
  };

  ItoEndpoint.prototype.send = function(d) {
    let c = this.dataChannel;
    if(!c)
      throw new Error('data channel not open');
    else {
      let opt = epOpt[this.peer][this.connection];
      switch(this.peerConnection.iceConnectionState) {
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
  };

  ItoEndpoint.prototype.close = function() {
    return new Promise((resolve, reject) => {
      provider.sendClose(this.peer, this.connection).then(() => {
        resolve();
        onClose({ uid: this.peer, cid: this.connection });
      })
    });
  };

  /*
   * Simple Data Store Sharing
   */
  let scopes = {};

  var ItoDataStore = function(scope, name) {
    scopes[name] = scope;
    this.name = name;
    Object.defineProperties(this, {
      scope: {
        get: () => { return scopes[this.name]; }
      }
    });
  };
  // Object.setPrototypeOf(ItoDataStore.prototype, ItoEmitter.prototype);

  var ItoDataElement = function(dataStore, key, data) {
    this.dataStore = dataStore;
    this.key = key;
    this.data = data;
    Object.defineProperties(this, {
      dataStore: {
        enumerable: false
      }
    });
  };

  ItoDataStore.prototype.put = function(key, data) {
    if(!this.scope)
      return Promise.reject(new Error('the data store is already reset.'));
    return provider.putDataElement(this.scope, this.name, key, data);
  };

  ItoDataStore.prototype.get = function(key) {
    if(!this.scope)
      return Promise.reject(new Error('the data store is already reset.'));
    return provider.getDataElement(this.scope, this.name, key).then(result => {
      return new ItoDataElement(this, result.key, result.data);
    });
  };

  ItoDataStore.prototype.getAll = function() {
    if(!this.scope)
      return Promise.reject(new Error('the data store is already reset.'));
    return provider.getAllDataElements(this.scope, this.name).then(result => {
      let elements = [];
      Object.keys(result || []).forEach(key => {
        elements.push(new ItoDataElement(this, key, result[key]));
      });
      return elements;
    });
  };

  ItoDataStore.prototype.remove = function(key) {
    if(!this.scope)
      return Promise.reject(new Error('the data store is already reset.'));
    return provider.removeDataElement(this.scope, this.name, key);
  };

  ItoDataStore.prototype.removeAll = function(key) {
    if(!this.scope)
      return Promise.reject(new Error('the data store is already reset.'));
    return provider.removeAllDataElements(this.scope, this.name);
  };

  ItoDataStore.prototype.reset = function() {
    if(!this.scope)
      return Promise.reject(new Error('the data store is already reset.'));
    return provider.removeDataStore(this.scope, this.name).then(() => {
      delete scopes[this.name];
    });
  };

  var ItoDataStoreObserver = function(uid, dataStore) {
    this.uid = uid;
    this.dataStore = dataStore;
  };
  Object.setPrototypeOf(ItoDataStoreObserver.prototype, ItoEmitter.prototype);

  var ItoDataObserverEvent = function(type, observer) {
    this.type = type;
    this.target = observer;
  }
  Object.setPrototypeOf(ItoDataObserverEvent.prototype, ItoEvent.prototype);

  ito.openDataStore = (name, opt) => {
    let scope = 'private';
    if(opt) {
      if(typeof opt.scope === 'string' && opt.scope.match(/^(public|friends|private)$/))
        scope = opt.scope;
      else
        throw new Error('the "scope" option must be "public", "friends" or "private".');
    }
    if(!(typeof name === 'string') || !name.match(/^.+$/))
      throw new Error('the specified data store name includes illegal letter(s).');
    return provider.openDataStore(scope, name).then(s => {
      return new ItoDataStore(s, name);
    });
  };

  if(!isBrowser) {
    ito.ItoProvider = ItoProvider;
    module.exports = ito;
  }
})(typeof window === 'object' ? window : global, typeof window === 'object');
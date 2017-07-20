/**
 * ito.js
 * 
 * Copyright 2017 KDDI Research, Inc.
 * 
 * This software is released under the MIT License.
 * http://opensource.org/licenses/mit-license.php
 */

var KII_GROUP_FRIENDS        = 'itofriends';
var KII_BUCKET               = 'ito';
var KII_BUCKET_NOTIFICATIONS = 'itonotifications';
var KII_BUCKET_FRIENDS       = KII_GROUP_FRIENDS;
var KII_BUCKET_PROFILE       = 'itoprofile';
var KII_BUCKET_DATASTORE_REF = 'itodatastore';
var KII_BUCKET_DATASTORE     = 'itodata_';
var KII_OBJ_EMAIL            = 'itoemail_';
var KII_OBJ_PASSCODE         = 'itopasscode_';
var KII_OBJ_PROFILE          = KII_BUCKET_PROFILE + '_';
var KII_OBJ_DATASTORE_REF    = KII_BUCKET_DATASTORE_REF + '_';
var KII_PROP_DATAOBSERVER    = 'dataobserver';

var subject = {
  anonymous: new KiiAnonymousUser(),
  authenticated: new KiiAnyAuthenticatedUser()
};

var action = {
  bucket: {
    create: KiiACLAction.KiiACLBucketActionCreateObjects,
    query:  KiiACLAction.KiiACLBucketActionQueryObjects,
    drop:   KiiACLAction.KiiACLBucketActionDropBucket,
    read:   KiiACLAction.KiiACLBucketActionReadObjects
  },
  object: {
    read:   KiiACLAction.KiiACLObjectActionRead,
    write:  KiiACLAction.KiiACLObjectActionWrite
  }
};

function kiiSetACLEntry(target, scope, action, grant) {
  if(!(target instanceof KiiObject) && !(target instanceof KiiBucket))
    return;
  var acl = (target.objectACL || target.acl)();
  var entry = KiiACLEntry.entryWithSubject(scope, action);
  entry.setGrant(grant);
  acl.putACLEntry(entry);
  return acl.save().catch(function() {});
}

function kiiSetAppScopeObjectACL(object) {
  if(!(object instanceof KiiObject))
    return;
  return   kiiSetACLEntry(object, subject.authenticated, action.object.read,  false)
  .then(function() {
    return kiiSetACLEntry(object, subject.anonymous,     action.object.read,  false);
  }).then(function() {
    return kiiSetACLEntry(object, subject.authenticated, action.object.write, false);
  });
}

function kiiSetNotificationACL(object) {
  if(!(object instanceof KiiObject))
    return;
  return   kiiSetACLEntry(object, subject.anonymous,     action.object.read,  false)
  .then(function() {
    return kiiSetACLEntry(object, subject.authenticated, action.object.write, false);
  });
}

function kiiSetGroupScopeObjectACL(object, group) {
  if(!(object instanceof KiiObject))
    return;
  return   kiiSetACLEntry(object, group, action.object.read,  false)
  .then(function() {
    return kiiSetACLEntry(object, group, action.object.write, false);
  });
}

function kiiSearchFriendsGroup(admin, uid, type) {
  if(!(admin instanceof KiiAppAdminContext))
    return;
  var q = KiiQuery.queryWithClause(KiiClause.and(
    KiiClause.equals('_owner', uid),
    KiiClause.equals('type', type)
  ));
  var b = admin.bucketWithName(KII_BUCKET);
  return b.executeQuery(q).then(function(params) {
    return (params[1].length > 0) ? params[1][0].get("group") : null;
  });
}

function kiiSearchObjectsInBucket(admin, type, value) {
  if(!(admin instanceof KiiAppAdminContext))
    return;
  var b = admin.bucketWithName(KII_BUCKET);
  var q = KiiQuery.queryWithClause(KiiClause.and(
    KiiClause.equals('type', type),
    KiiClause.equals(type, value)
  ));
  return b.executeQuery(q).then(function(params) {
    return params[1];
  });
}

function kiiSetOffline(object) {
  if(!(object instanceof KiiObject))
    return;
  object.set('status', 'offline');
  return object.save();
}

/**
 * @param {KiiAppAdminContext} admin
 * @param {Array<string>} uris
 */
function kiiRemovePendingRequests(admin, uris) {
  if(!(admin instanceof KiiAppAdminContext))
    return;
  if(!$.isArray(uris))
    return Promise.resolve();
  else
    return Promise.all(uris.map(function(uri) {
      try {
        var obj = admin.objectWithURI(uri);
        return obj ? obj.delete().catch(function() {}) : Promise.resolve();
      } catch(e) {
        return Promise.resolve();
      }
    }));
}

function kiiUnsubscribeDataStore(ref, user) {
  if(!(ref instanceof KiiObject))
    return;
  return ref.refresh().then(function(obj) {
    var l = obj.get(KII_PROP_DATAOBSERVER);
    return l.reduce(function(p, d) {
      return p.then(function() {
        var b = Kii.bucketWithName(d);
        return user.pushSubscription().unsubscribe(b).catch(function() {});
      });
    }, Promise.resolve()).then(function() {
      ref.set(KII_PROP_DATAOBSERVER, []);
      return ref.save();
    });
  });
}

function restrictItoMessage(params, context, done) {
  /** @type {KiiAppAdminContext} */
  var admin = context.getAppAdminContext();
  var object = admin.objectWithURI(params.uri);
  var b = admin.bucketWithName(KII_BUCKET);
  var q, m;
  object.refresh().then(function() {
    return KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
      switch(object.get('type')) {
      case 'passcode':
        if(object.getID() !== KII_OBJ_PASSCODE + user.getID())
          return object.delete();
        else {
          q = KiiQuery.queryWithClause(KiiClause.equals('passcode', object.get('passcode')));
          return b.executeQuery(q).then(function(params) {
            if(params[1].length > 1)
              return object.delete().then(function() { return true; });
          });
        }
      case 'email':
        if(object.getID() !== KII_OBJ_EMAIL + user.getID())
          return object.delete();
        m = object.get('email');
        if(m && m !== user.getEmailAddress() && m !== user.getID())
          return object.delete();
        break;
      case 'administrators':
        return object.delete();
      }
    });
  }).then(function() {
    done();
  }, function() {
    done();
  });
}

function setNotificationTimestamp(params, context, done) {
  /** @type {KiiAppAdminContext} */
  var admin = context.getAppAdminContext();
  var object = admin.objectWithURI(params.uri);
  object.refresh().then(function() {
    switch(object.get('type')) {
    case 'notification':
      object.set('timestamp', Date.now());
      return object.save();
    }
  }).then(function() {
    done();
  }, function() {
    done();
  });
}

function setPasscode(params, context, done) {
  /** @type {KiiAppAdminContext} */
  var admin = context.getAppAdminContext();
  var p = params.passcode;
  var g = params.group;
  var b, q;
  if(!g) {
    done({
      result: 'error',
      reason: 'group is not specified'
    });
  }
  else {
    KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
      b = Kii.bucketWithName(KII_BUCKET);
      var o = b.createObjectWithID(KII_OBJ_PASSCODE + user.getID());
      if(!p || p === '') {
        o.delete().catch(function() {}).then(function() {
          done({
            result: 'ok',
            uri: null
          });
        });
      }
      else {
        q = KiiQuery.queryWithClause(KiiClause.and(
          KiiClause.equals('passcode', p),
          KiiClause.notEquals('_owner', user.getID())
        ));
        return b.executeQuery(q).then(function(params) {
          if(params[1].length > 0)
            done({
              result: 'error',
              reason: 'the specified passcode already exists'
            });
          else {
            o.set('type', 'passcode');
            o.set('passcode', p);
            o.set('group', g);
            o.saveAllFields().then(function() {
              return kiiSetAppScopeObjectACL(o);
            }).then(function() {
              done({
                result: 'ok',
                uri: o.objectURI()
              });
            });
          }
        });
      }
    }).catch(function() {
      done({
        result: 'error',
        reason: 'failed to invoke Server Code'
      });
    });
  }
}

function sendRequest(params, context, done) {
  var q = params.query;
  var o = params.options;
  var u = params.uid;
  var n = params.userName;
  var m = params.email;
  var f = false;

  /** @type {KiiAppAdminContext} */
  var admin = context.getAppAdminContext();
  if(!u)
    done({
      result: 'error',
      reason: 'uid is not specified'
    });
  else if(!q)
    done({
      result: 'error',
      reason: 'query is not specified'
    });
  else {
    KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
      kiiSearchObjectsInBucket(admin, 'passcode', q).then(function(objects) {
        if(objects.length > 0) {
          f = true;
          return objects[0].get('group');
        }
        else
          return kiiSearchObjectsInBucket(admin, 'email', q).then(function(objects) {
            return (objects.length > 0) ? objects[0].get('group') : null;
          });
      }).then(function(groupId) {
        if(groupId) {
          var g = admin.groupWithID(groupId);
          var b = g.bucketWithName(KII_BUCKET_FRIENDS);
          var msg = b.createObject();
          msg.set('type', 'request');
          msg.set('query', q);
          msg.set('uid', user.getID());
          msg.set('userName', n);
          msg.set('email', m);
          msg.set('isPasscode', f);
          if(o)
            msg.set('options', o);
          msg.save().then(function(obj) {
            return kiiSetGroupScopeObjectACL(obj, g).then(function() {
              return obj;
            })
          }).then(function(obj) {
            done({
              result: 'ok',
              key: obj.objectURI()
            });
          });
        }
        else
          done({
            result: 'error',
            reason: 'the specified email address or passcode does not exist'
          });
      });
    }).catch(function() {
      done({
        result: 'error',
        reason: 'failed to invoke Server Code'
      });
    });
  }
}

function acceptRequest(params, context, done) {
  var u = params.uid;
  var m = params.email;
  var p = params.passcode;
  var k = params.requestKey;

  /** @type {KiiAppAdminContext} */
  var admin = context.getAppAdminContext();
  KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
    kiiSearchFriendsGroup(admin, u, 'email').then(function(group) {
      if(group) {
        var g = admin.groupWithID(group);
        var b = g.bucketWithName(KII_BUCKET_FRIENDS);
        var msg = b.createObject();
        msg.set('type', 'accept');
        msg.set('uid', user.getID());
        msg.set('email', m);
        msg.set('requestKey', k);
        if(p)
          msg.set('passcode', p);
        msg.save().then(function(obj) {
          done({
            result: 'ok',
            key: k
          });
        });
      }
      else
        throw null;
    });
  }).catch(function() {
    done({
      result: 'error',
      reason: 'failed to invoke Server Code'
    });
  });
}

function rejectRequest(params, context, done) {
  var u = params.uid;
  var m = params.email;
  var p = params.passcode;
  var k = params.requestKey;

  /** @type {KiiAppAdminContext} */
  var admin = context.getAppAdminContext();
  return KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
    return kiiSearchFriendsGroup(admin, u, 'email').then(function(group) {
      if(group) {
        var g = admin.groupWithID(group);
        var b = g.bucketWithName(KII_BUCKET_FRIENDS);
        var msg = b.createObject();
        msg.set('type', 'reject');
        msg.set('uid', user.getID());
        msg.set('requestKey', k);
        if(p)
          msg.set('passcode', p);
        if(m)
          msg.set('email', m);
        msg.save().then(function(obj) {
          done({
            result: 'ok',
            key: k
          });
        });
      }
      else
        throw null;
    });
  }).catch(function() {
    done({
      result: 'error',
      reason: 'failed to invoke Server Code'
    });
  });
}

function removePendingRequests(params, context, done) {
  var u = params.pendingRequests;
  (u ? kiiRemovePendingRequests(context.getAppAdminContext(), u) : Promise.resolve()).then(function() {
    done({
      result: 'ok'
    });
  })
}

function onOffline(params, context, done) {
  return KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
    var b = Kii.bucketWithName(KII_BUCKET);
    var o = b.createObjectWithID(KII_OBJ_EMAIL + user.getID());
    var u = params.pendingRequests;
    return kiiUnsubscribeDataStore(o, user).then(function(obj) {
      return kiiSetOffline(obj);
    }).then(function(obj) {
      var g = KiiGroup.groupWithID(obj.get('group'));
      b = g.bucketWithName(KII_BUCKET_PROFILE);
      o = b.createObjectWithID(KII_OBJ_PROFILE + user.getID());
      b = g.bucketWithName(KII_BUCKET_FRIENDS);
      return kiiSetACLEntry(b, subject.authenticated, action.bucket.create, false).then(function() {
        return o.refresh();
      });
    }).then(function(obj) {
      return kiiSetOffline(obj);
    }).then(function() {
      return kiiRemovePendingRequests(context.getAppAdminContext(), u);
    }).then(function() {
      done({
        result: 'ok'
      });
    });    
  }).catch(function() {
    done({
      result: 'error',
      reason: 'failed to invoke Server Code'
    });
  });
}

function checkPing(params, context, done) {
  /** @type {KiiAppAdminContext} */
  var admin = context.getAppAdminContext();
  var b = admin.bucketWithName(KII_BUCKET);
  var q = KiiQuery.queryWithClause(KiiClause.and(
    KiiClause.equals('type', 'email'),
    KiiClause.equals('status', 'online'),
    KiiClause.lessThan('_modified', Date.now() - 15000)
  ));
  return b.executeQuery(q).then(function(params) {
    return Promise.all(params[1].map(function(/** @type {KiiObject} */obj) {
      var g = obj.get('group');
      console.log('   ' + g + ': ' + obj.getModified() + ' / ' + Date.now() + ' / ' + (Date.now() - parseInt(obj.getModified())));
      return kiiSetOffline(obj).then(function() {
        return admin.groupWithID(g).bucketWithName(KII_BUCKET_PROFILE).executeQuery(
          KiiQuery.queryWithClause(KiiClause.equals('type', 'profile'))
        )
      }).then(function(params) {
        return kiiSetOffline(params[1][0]);
      });
    })).then(done);
  }).catch(done);
}

function clearOldNotifications(params, context, done) {
  var admin = context.getAppAdminContext();
  var b = admin.bucketWithName(KII_BUCKET_NOTIFICATIONS);
  var q = KiiQuery.queryWithClause(KiiClause.and(
    KiiClause.equals('rel', 'notification'),
    KiiClause.equals('type', 'notification'),
    KiiClause.lessThan('_modified', Date.now() - 14*24*60*60*1000)
  ));
  return b.executeQuery(q).then(function(params) {
    return params[1].reduce(function(p, e) {
      return p.then(function() { return e.delete(); });
    }, Promise.resolve()).then(done);
  }).catch(done);
}

function sendNotification(params, context, done) {
  return KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
    /** @type {KiiAppAdminContext} */
    var admin = context.getAppAdminContext();
    var b = admin.bucketWithName(KII_BUCKET);
    var q = KiiQuery.queryWithClause(KiiClause.equals('type', 'administrators'));
    var d = params.data;
    return b.executeQuery(q).then(function(params) {
      if(params[1].length > 0 && params[1][0].get('administrators').indexOf(user.getID()) >= 0) {
        b = admin.bucketWithName(KII_BUCKET_NOTIFICATIONS);
        var obj = b.createObject();
        obj.set('rel', 'notification');
        obj.set('type', 'notification');
        obj.set('data', d);
        obj.save().then(kiiSetNotificationACL).then(function() {
          done({ result: 'ok' });
        })
      }
      else
        throw null;
    });
  }).catch(function() {
    done({
      result: 'error',
      reason: 'failed to invoke Server Code'
    });
  });
}

function checkAdministrator(params, context, done) {
  return KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
    /** @type {KiiAppAdminContext} */
    var admin = context.getAppAdminContext();
    var b = admin.bucketWithName(KII_BUCKET);
    var q = KiiQuery.queryWithClause(KiiClause.equals('type', 'administrators'));
    return b.executeQuery(q).then(function(params) {
      done({
        result: 'ok',
        isAdmin: (params[1].length > 0 && params[1][0].get('administrators').indexOf(user.getID()) >= 0)
      });
    });
  }).catch(function() {
    done({
      result: 'error',
      reason: 'failed to invoke Server Code'
    });
  });
}

function openDataStore(params, context, done) {
  var s = params.scope;
  var d = params.dataStore;
  var r = params.dataStoreRef;
  var n = params.name;
  var g = KiiGroup.groupWithID(params.group);
  var store, dummy;
  return KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
    /** @type {KiiAppAdminContext} */
    var admin = context.getAppAdminContext();
    var b = Kii.bucketWithName(KII_BUCKET_DATASTORE_REF);
    var o = b.createObjectWithID(r);
    return o.refresh().catch(function() {
      o = b.createObjectWithID(r);
      o.set('uid', user.getID());
      o.set('scope', s);
      o.set('name', n);
      o.set('datastore', d);
      return o.saveAllFields().then(function(obj) {
        o = obj;
        return kiiSetACLEntry(o, subject.authenticated, action.object.read,  s === 'public');
      }).then(function() {
        return kiiSetACLEntry(o, subject.authenticated, action.object.write, false);
      }).then(function() {
        return kiiSetACLEntry(o, subject.anonymous,     action.object.read,  false);
      }).then(function() {
        return kiiSetACLEntry(o, g,                     action.object.read,  s === 'friends');
      }).then(function() {
        return kiiSetACLEntry(o, g,                     action.object.write, false);
      }).then(function() {
        return kiiSetACLEntry(o, user,                  action.object.read,  true );
      }).then(function() {
        return kiiSetACLEntry(o, user,                  action.object.write, true );
      }).then(function() {
        return o;
      });
    }).then(function(obj) {
      s = obj.get('scope');
      store = admin.bucketWithName(d);
      dummy = store.createObject();
      return dummy.save();
    }).then(function() {
      return kiiSetACLEntry(store, subject.authenticated, action.bucket.create, false);
    }).then(function() {
      return kiiSetACLEntry(store, user,                  action.bucket.create, true );
    }).then(function() {
      return kiiSetACLEntry(store, subject.authenticated, action.bucket.query,  s === 'public');
    }).then(function() {
      return kiiSetACLEntry(store, subject.anonymous,     action.bucket.query,  false);
    }).then(function() {
      return kiiSetACLEntry(store, g,                     action.bucket.query,  s === 'friends');
    }).then(function() {
      return kiiSetACLEntry(store, user,                  action.bucket.query,  true );
    }).then(function() {
      return kiiSetACLEntry(store, subject.authenticated, action.bucket.drop,   false);
    }).then(function() {
      return kiiSetACLEntry(store, user,                  action.bucket.drop,   true );
    }).then(function() {
      return kiiSetACLEntry(store, subject.authenticated, action.bucket.read,   s === 'public');
    }).then(function() {
      return kiiSetACLEntry(store, g,                     action.bucket.read,   s === 'friends');
    }).then(function() {
      return kiiSetACLEntry(store, user,                  action.bucket.read,   true );
    }).then(function() {
      return dummy.delete();
    }).then(function() {
      done({
        result: 'ok',
        scope: s
      });
    });
  }).catch(function() {
    done({
      result: 'error',
      reason: 'failed to invoke Server Code'
    });
  });
}

function unsubscribeDataStore(params, context, done) {
  return KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
    var emailRef = Kii.bucketWithName(KII_BUCKET).createObjectWithID(KII_OBJ_EMAIL + user.getID());
    return kiiUnsubscribeDataStore(emailRef, user).then(function() {
      done();
    });
  }).catch(function() {
    done();
  });
}

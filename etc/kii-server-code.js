function kiiAddACLEntry(object, scope, action, grant) {
  if(!(object instanceof KiiObject))
    return;
  var acl = (object.objectACL || object.acl)();
  var entry = KiiACLEntry.entryWithSubject(scope, action);
  entry.setGrant(grant);
  acl.putACLEntry(entry);
  return acl.save();
}

function kiiSetAppScopeObjectACL(object) {
  if(!(object instanceof KiiObject))
    return;
  return kiiAddACLEntry(
    object,
    new KiiAnyAuthenticatedUser(),
    KiiACLAction.KiiACLObjectActionRead,
    false
  ).then(function() {
    return kiiAddACLEntry(
      object,
      new KiiAnonymousUser(),
      KiiACLAction.KiiACLObjectActionRead,
      false
    );
  }).then(function() {
    return kiiAddACLEntry(
      object,
      new KiiAnyAuthenticatedUser(),
      KiiACLAction.KiiACLObjectActionWrite,
      false
    );
  });
}

function kiiSetGroupScopeObjectACL(object, group) {
  if(!(object instanceof KiiObject))
    return;
  return kiiAddACLEntry(
    object,
    group,
    KiiACLAction.KiiACLObjectActionRead,
    false
  ).then(function() {
    return kiiAddACLEntry(
      object,
      group,
      KiiACLAction.KiiACLObjectActionWrite,
      false
    );
  });
}

function kiiSearchFriendsGroup(admin, uid, type) {
  if(!(admin instanceof KiiAppAdminContext))
    return;
  var q = KiiQuery.queryWithClause(KiiClause.and(
    KiiClause.equals('_owner', uid),
    KiiClause.equals('type', type)
  ));
  var b = admin.bucketWithName('ito');
  return b.executeQuery(q).then(function(params) {
    return (params[1].length > 0) ? params[1][0].get("group") : null;
  });
}

function kiiSearchObjectsInBucket(admin, type, value) {
  if(!(admin instanceof KiiAppAdminContext))
    return;
  var b = admin.bucketWithName('ito');
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

function restrictItoMessage(params, context, done) {
  /** @type {KiiAppAdminContext} */
  var admin = context.getAppAdminContext();
  var object = admin.objectWithURI(params.uri);
  var b = admin.bucketWithName('ito');
  var q, p, m;
  object.refresh().then(function() {
    switch(object.get('type')) {
    case 'passcode':
      p = object.get('passcode');
      if(p) {
        q = KiiQuery.queryWithClause(KiiClause.equals('passcode', p));
        return b.executeQuery(q).then(function(params) {
          if(params[1].length > 1)
            return object.delete().then(function() { return true; });
          else
            return false;
        }).then(function(result) {
          if(!result) {
            KiiUser.authenticateWithToken(context.getAccessToken()).then(function() {
              var u = Kii.bucketWithName('ito');
              q = KiiQuery.queryWithClause(KiiClause.and(
                KiiClause.equals('type', 'passcode'),
                KiiClause.notEquals('_id', object.getID())
              ));
              u.executeQuery(q).then(function(params) {
                if(params[1].length > 0)
                  return object.delete();
              });
            });
          }
        });
      }
      else
        return object.delete();
      break;
    case 'email':
      m = object.get('email');
      if(m)
        return KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
          if(m !== user.getEmailAddress() && m !== user.getID())
            return object.delete();
        });
      else
        return object.delete();
      break;
    case 'administrators':
    case 'lastupdated':
      return object.delete();
      break;
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
      if(!p || p === '') {
        q = KiiQuery.queryWithClause(KiiClause.equals('type', 'passcode'));
        b = Kii.bucketWithName('ito');
        b.executeQuery(q).then(function(params) {
          (params[1].length !== 0 ? params[1][0].delete() : Promise.resolve()).then(function() {
            done({
              result: 'ok',
              uri: null
            });
          });
        });
      }
      else {
        b = admin.bucketWithName('ito');
        q = KiiQuery.queryWithClause(KiiClause.and(
          KiiClause.equals('passcode', p),
          KiiClause.notEquals('_owner', user.getID())
        ));
        b.executeQuery(q).then(function(params) {
          if(params[1].length > 0)
            done({
              result: 'error',
              reason: 'the specified passcode already exists'
            });
          else {
            b = Kii.bucketWithName('ito');
            q = KiiQuery.queryWithClause(KiiClause.equals('type', 'passcode'));
            b.executeQuery(q).then(function(params) {
              var f = (params[1].length === 0);
              var o = f ? b.createObject() : params[1][0];
              o.set('type', 'passcode');
              o.set('passcode', p);
              o.set('group', g);
              o.save().then(function() {
                if(f)
                  return kiiSetAppScopeObjectACL(o);
              }).then(function() {
                done({
                  result: 'ok',
                  uri: o.objectURI()
                });
              });
            });
          }
        });
      }
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
          var b = g.bucketWithName('itofriends');
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
        var b = g.bucketWithName('itofriends');
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
  KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
    return kiiSearchFriendsGroup(admin, u, 'email').then(function(group) {
      if(group) {
        var g = admin.groupWithID(group);
        var b = g.bucketWithName('itofriends');
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
  KiiUser.authenticateWithToken(context.getAccessToken()).then(function(user) {
    var b = Kii.bucketWithName('ito');
    var q = KiiQuery.queryWithClause(KiiClause.and(
      KiiClause.equals('_owner', user.getID()),
      KiiClause.equals('type', 'email')
    ));
    var u = params.pendingRequests;
    b.executeQuery(q).then(function(params) {
      if(params[1].length > 0) {
        kiiSetOffline(params[1][0]).then(function(obj) {
          var g = KiiGroup.groupWithID(obj.get('group'));
          return g.bucketWithName('itoprofile').executeQuery(
            KiiQuery.queryWithClause(KiiClause.equals('type', 'profile'))
          );
        }).then(function(params) {
          if(params[1].length > 0) {
            kiiSetOffline(params[1][0]).then(function() {
              return kiiRemovePendingRequests(context.getAppAdminContext(), u);
            }).then(function() {
              done({
                result: 'ok'
              });
            });
          }
          else
            throw null;
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

function checkPing(params, context, done) {
  /** @type {KiiAppAdminContext} */
  var admin = context.getAppAdminContext();
  var b = admin.bucketWithName('ito');
  var q = KiiQuery.queryWithClause(KiiClause.and(
    KiiClause.equals('type', 'email'),
    KiiClause.equals('status', 'online'),
    KiiClause.lessThan('_modified', Date.now() - 15000)
  ));
  b.executeQuery(q).then(function(params) {
    return Promise.all(params[1].map(function(/** @type {KiiObject} */obj) {
      var g = obj.get('group');
      console.log('   ' + g + ': ' + obj.getModified() + ' / ' + Date.now() + ' / ' + (Date.now() - parseInt(obj.getModified())));
      return kiiSetOffline(obj).then(function() {
        return admin.groupWithID(g).bucketWithName('itoprofile').executeQuery(
          KiiQuery.queryWithClause(KiiClause.equals('type', 'profile'))
        )
      }).then(function(params) {
        return kiiSetOffline(params[1][0]);
      });
    })).then(done);
  }).catch(done);
}
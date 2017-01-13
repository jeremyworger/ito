function kiiAddACLEntry(object, scope, action, grant) {
  var acl = (object.objectACL || object.acl)();
  var entry = KiiACLEntry.entryWithSubject(scope, action);
  entry.setGrant(grant);
  acl.putACLEntry(entry);
  return acl.save();
}

function kiiSetAppScopeObjectACL(object) {
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
  var b = admin.bucketWithName('ito');
  var q = KiiQuery.queryWithClause(KiiClause.and(
    KiiClause.equals('type', type),
    KiiClause.equals(type, value)
  ));
  return b.executeQuery(q).then(function(params) {
    return params[1];
  });
}

function parseItoMessage(params, context, done) {
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
        msg.set('uid', u);
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
    }).catch(function() {
      done({
        result: 'error',
        reason: 'failed to invoke Server Code'
      });
    });
  }
}

function rejectRequest(params, context, done) {
  var u = params.uid;
  var m = params.email;
  var p = params.passcode;
  var k = params.requestKey;

  /** @type {KiiAppAdminContext} */
  var admin = context.getAppAdminContext();
  kiiSearchFriendsGroup(admin, u, 'email').then(function(group) {
    if(group) {
      var g = admin.groupWithID(group);
      var b = g.bucketWithName('itofriends');
      var msg = b.createObject();
      msg.set('type', 'reject');
      msg.set('uid', u);
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
      done({
        result: 'error',
        reason: 'failed to invoke Server Code'
      });
  }, function() {
    done({
      result: 'error',
      reason: 'failed to invoke Server Code'
    });
  });
}
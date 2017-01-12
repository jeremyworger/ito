function searchObjectsInBucket(admin, type, value) {
  var bucket = admin.bucketWithName('ito');
  var query = KiiQuery.queryWithClause(
    KiiClause.and(
      KiiClause.equals('type', type),
      KiiClause.equals(type, value)
    )
  );
  return bucket.executeQuery(query).then(function(params) {
    return params[1];
  });
}

function parsePrivateMessage(params, context, done) {
  console.log(JSON.stringify(params));
  /** @type {KiiAppAdminContext} */
  var admin = context.getAppAdminContext();
  var object = admin.objectWithURI(params.uri);
  var q, u;
  object.refresh().then(function() {
    u = object.get('uid');
    if(u) {
      switch(object.get('type')) {
      case 'request':
        q = object.get('query');
        return q ? searchObjectsInBucket(admin, 'passcode', q).then(function(objects) {
          if(objects.length > 0) {
            return objects[0].get('group');
          }
          else
            return searchObjectsInBucket(admin, 'email', q).then(function(objects) {
              if(objects.length > 0)
                return objects[0].get('group');
            });
        }).then(function(groupId) {
          var group = admin.groupWithID(groupId);
          var bucket = group.bucketWithName('itofriends');
          var msg = bucket.createObject();
          msg.set('type', 'request');
          msg.set('query', q);
          msg.set('uid', u);
          msg.save();
          return object.delete();
        }) : Promise.resolve();
      }
    }
  }).then(function() {
    done();
  });
}
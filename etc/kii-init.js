'use strict';

const kii = require('kii-cloud-sdk').create();
Object.keys(kii).forEach(i => { global[i] = kii[i]; });
const arg = process.argv;
arg.splice(0, 2);

let site, appId, appKey, clientId, clientSecret;

while(arg.length > 0) {
  let t = arg.shift();
  switch(t) {
  case '--site':
    t = arg.shift();
    if(!t.match(/^(en|eu|cn|cn3|sg|jp)$/i)) {
      console.error('invalid site');
      process.exit();
    }
    site = t.toUpperCase();
    break;
  case '--app-id':
    t = arg.shift();
    if(!t) {
      console.error('invalid APP_ID');
      process.exit();
    }
    appId = t;
    break;
  case '--app-key':
    t = arg.shift();
    if(!t) {
      console.error('invalid APP_KEY');
      process.exit();
    }
    appKey = t;
    break;
  case '--client-id':
    t = arg.shift();
    if(!t) {
      console.error('invalid CLIENT_ID');
      process.exit();
    }
    clientId = t;
    break;
  case '--client-secret':
    t = arg.shift();
    if(!t) {
      console.error('invalid CLIENT_SECRET');
      process.exit();
    }
    clientSecret = t;
    break;
  default:
    console.error('invalid option: ' + t);
    process.exit();
    break;
  }
}

if(!site) {
  console.error('--site is missing');
  process.exit();
}

if(!appId) {
  console.error('--app-id is missing');
  process.exit();
}

if(!appKey) {
  console.error('--app-key is missing');
  process.exit();
}

if(!clientId) {
  console.error('--client-id is missing');
  process.exit();
}

if(!clientSecret) {
  console.error('--client-secret is missing');
  process.exit();
}

/** @type {KiiAppAdminContext} */
let admin;
/** @type {KiiBucket} */
let ito;
/** @type {KiiBucket} */
let itoNotification;
Kii.initializeWithSite(appId, appKey, KiiSite[site]);
return Kii.authenticateAsAppAdmin(clientId, clientSecret).then(a => {
  admin = a;
  ito = admin.bucketWithName('ito');
  const query = KiiQuery.queryWithClause(KiiClause.equals('type', 'administrators'));
  return ito.executeQuery(query);
}).then(params => {
  if(params[1].length === 0) {
    let object = ito.createObject();
    object.set('type', 'administrators');
    object.set('administrators', []);
    return object.save();
  }
  else
    return params[1][0];
}).then(object => {
  return kiiSetACLEntries(object, [
    {
      subject: new KiiAnyAuthenticatedUser(),
      action: KiiACLAction.KiiACLObjectActionRead,
      granted: false
    }, {
      subject: new KiiAnonymousUser(),
      action: KiiACLAction.KiiACLObjectActionRead,
      granted: false
    }, {
      subject: new KiiAnyAuthenticatedUser(),
      action: KiiACLAction.KiiACLObjectActionWrite,
      granted: true
    }, {
      subject: new KiiAnonymousUser(),
      action: KiiACLAction.KiiACLObjectActionWrite,
      granted: false
    }
  ]);
}).then(() => {
  return kiiSetACLEntries(ito, [
    {
      subject: new KiiAnyAuthenticatedUser(),
      action: KiiACLAction.KiiACLBucketActionCreateObjects,
      granted: true
    }, {
      subject: new KiiAnonymousUser(),
      action: KiiACLAction.KiiACLBucketActionCreateObjects,
      granted: false
    }, {
      subject: new KiiAnyAuthenticatedUser(),
      action: KiiACLAction.KiiACLBucketActionQueryObjects,
      granted: true
    }, {
      subject: new KiiAnonymousUser(),
      action: KiiACLAction.KiiACLBucketActionQueryObjects,
      granted: false
    }, {
      subject: new KiiAnyAuthenticatedUser(),
      action: KiiACLAction.KiiACLBucketActionDropBucket,
      granted: false
    }, {
      subject: new KiiAnonymousUser(),
      action: KiiACLAction.KiiACLBucketActionDropBucket,
      granted: false
    }, {
      subject: new KiiAnyAuthenticatedUser(),
      action: KiiACLAction.KiiACLBucketActionReadObjects,
      granted: false
    }, {
      subject: new KiiAnonymousUser(),
      action: KiiACLAction.KiiACLBucketActionReadObjects,
      granted: false
    }
  ]);
}).then(() => {
  itoNotification = admin.bucketWithName('itonotifications');
  const query = KiiQuery.queryWithClause(KiiClause.equals('type', 'lastupdated'));
  return ito.executeQuery(query);
}).then(params => {
  if(params[1].length === 0) {
    let object = itoNotification.createObject();
    object.set('type', 'lastupdated');
    return object.save();
  }
  else
    return params[1][0];
}).then(object => {
  return object.delete();
}).then(() => {
  return kiiSetACLEntries(itoNotification, [
    {
      subject: new KiiAnyAuthenticatedUser(),
      action: KiiACLAction.KiiACLBucketActionCreateObjects,
      granted: false
    }, {
      subject: new KiiAnonymousUser(),
      action: KiiACLAction.KiiACLBucketActionCreateObjects,
      granted: false
    }, {
      subject: new KiiAnyAuthenticatedUser(),
      action: KiiACLAction.KiiACLBucketActionQueryObjects,
      granted: true
    }, {
      subject: new KiiAnonymousUser(),
      action: KiiACLAction.KiiACLBucketActionQueryObjects,
      granted: false
    }, {
      subject: new KiiAnyAuthenticatedUser(),
      action: KiiACLAction.KiiACLBucketActionDropBucket,
      granted: false
    }, {
      subject: new KiiAnonymousUser(),
      action: KiiACLAction.KiiACLBucketActionDropBucket,
      granted: false
    }, {
      subject: new KiiAnyAuthenticatedUser(),
      action: KiiACLAction.KiiACLBucketActionReadObjects,
      granted: true
    }, {
      subject: new KiiAnonymousUser(),
      action: KiiACLAction.KiiACLBucketActionReadObjects,
      granted: false
    }
  ]);
}).catch(err => {
  console.error(err);
});

function kiiSetACLEntries(target, entries) {
  return entries.reduce((r, e) => {
    return r.then(() => { return kiiSetACLEntry(target, e.subject, e.action, e.granted); });
  }, Promise.resolve());
}

function kiiSetACLEntry(target, subject, action, granted) {
  let acl = (target.acl || target.objectACL)();
  let entry = KiiACLEntry.entryWithSubject(subject, action);
  entry.setGrant(granted);
  acl.putACLEntry(entry);
  return acl.save().catch(() => {});
}
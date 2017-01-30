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

const subject = {
  anonymous: new KiiAnonymousUser(),
  authenticated: new KiiAnyAuthenticatedUser()
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

const action = {
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

/** @type {KiiAppAdminContext} */
let admin;
/** @type {KiiBucket} */
let ito;
/** @type {KiiBucket} */
let itoNotification;
/** @type {KiiBucket} */
let itoDataStoreRef;
Kii.initializeWithSite(appId, appKey, KiiSite[site]);
return Kii.authenticateAsAppAdmin(clientId, clientSecret).then(a => {
  admin = a;
  ito = admin.bucketWithName(KII_BUCKET);
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
    { subject: subject.authenticated, action: action.object.read,  granted: false },
    { subject: subject.authenticated, action: action.object.write, granted: true  },
    { subject: subject.anonymous,     action: action.object.read,  granted: false },
    { subject: subject.anonymous,     action: action.object.write, granted: false }
  ]);
}).then(() => {
  return kiiSetACLEntries(ito, [
    { subject: subject.authenticated, action: action.bucket.create, granted: true  },
    { subject: subject.authenticated, action: action.bucket.query , granted: true  },
    { subject: subject.authenticated, action: action.bucket.drop  , granted: false },
    { subject: subject.authenticated, action: action.bucket.read  , granted: false },
    { subject: subject.anonymous    , action: action.bucket.create, granted: false },
    { subject: subject.anonymous    , action: action.bucket.query , granted: false },
    { subject: subject.anonymous    , action: action.bucket.drop  , granted: false },
    { subject: subject.anonymous    , action: action.bucket.read  , granted: false }
  ]);
}).then(() => {
  itoNotification = admin.bucketWithName(KII_BUCKET_NOTIFICATIONS);
  let object = itoNotification.createObject();
  return object.save();
}).then(object => {
  return object.delete();
}).then(() => {
  return kiiSetACLEntries(itoNotification, [
    { subject: subject.authenticated, action: action.bucket.create, granted: false },
    { subject: subject.authenticated, action: action.bucket.query , granted: true  },
    { subject: subject.authenticated, action: action.bucket.drop  , granted: false },
    { subject: subject.authenticated, action: action.bucket.read  , granted: true  },
    { subject: subject.anonymous    , action: action.bucket.create, granted: false },
    { subject: subject.anonymous    , action: action.bucket.query , granted: false },
    { subject: subject.anonymous    , action: action.bucket.drop  , granted: false },
    { subject: subject.anonymous    , action: action.bucket.read  , granted: false }
  ]);
}).then(() => {
  itoDataStoreRef = admin.bucketWithName(KII_BUCKET_DATASTORE_REF);
  let object = itoDataStoreRef.createObject();
  return object.save();
}).then(object => {
  return object.delete();
}).then(() => {
  return kiiSetACLEntries(itoDataStoreRef, [
    { subject: subject.authenticated, action: action.bucket.create, granted: true  },
    { subject: subject.authenticated, action: action.bucket.query , granted: false },
    { subject: subject.authenticated, action: action.bucket.drop  , granted: false },
    { subject: subject.authenticated, action: action.bucket.read  , granted: false },
    { subject: subject.anonymous    , action: action.bucket.create, granted: false },
    { subject: subject.anonymous    , action: action.bucket.query , granted: false },
    { subject: subject.anonymous    , action: action.bucket.drop  , granted: false },
    { subject: subject.anonymous    , action: action.bucket.read  , granted: false }
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
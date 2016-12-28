# Initialize ito

## Firebase

```js
let provider = ito.provider.firebase;
const config = {
  apiKey: "(see your Firebase setup)",
  authDomain: "(see your Firebase setup)",
  databaseURL: "(see your Firebase setup)"
};

ito.init(provider, config).then(user => {
  // Write your codes to be done when initialized
  console.log(user.uid);
});
```

# Account and Authentication

## Sign in
```js
ito.signIn('(sign-in type)').then(user => {
  // Write your codes to be done after signed in
  console.log(user.uid);
  console.log(user.email);
});
```
*sign-in type* must be one of the following:

* `anonymous`: an anonymous account, valid until signed out
* `google`: (browsers only) a Google account
* `facebook`: (browsers only) a Facebook account
* `email`: an account with e-mail and password (see below)

Note: *Currently, Node.js cannot keep sign-in status of `anonymous`
account persistently when the process finishes.*

### Create an account with E-mail and Password (Firebase)
```js
ito.provider.firebase.createUser('(e-mail address)', '(password)').then(user => {
  console.log(user.uid);
});
```

### Sign in with E-mail and Password (Firebase)
```js
ito.signIn('email', '(e-mail address)', '(password)').then(user => {
  // Write your codes to be done after signed in
  console.log(user.uid);
  console.log(user.email);
}, err => {
  console.log('invalid password or unknown error');
});
```

## Sign out
```js
ito.signOut().then(() => {
  // Write your codes to be done then signed out
});
```

# Profile and Friend List

A *friend* is the user to whom the signed-in user is permitted to send messages
and invitations to WebRTC peer-to-peer communications.

## Get the user profile (when signed in)

* `ito.profile.userName`: (string) the user's name (for Google and Facebook account)
* `ito.profile.email`: (string) the user's email address (same value as `uid` if `anonymous` sign-in type)
* `ito.profile.isAnonymous`: (boolean) `true` if `anonymous` sign-in type
* `ito.profile.uid`: (string) the user's ID (uid)

## Send a friend request
```js
let requestKey;

// When the request is accepted
ito.on('accept', event => {
  if(event.key === requestKey)
    console.log(event.profile);
});

// When the request is rejected
ito.on('reject', event => {
  if(event.key === requestKey)
    console.log('the request was rejected.');
});

// the object opt will be attached to this friend request;
// opt can be any JavaScript object as you like
let opt = { password: 'OpenSesame!' };

ito.request('(e-mail address or passcode)', opt).then(key => {
  requestKey = key;
}, () => {
  console.log('Such a user does not exist.')
})
```

## Wait for friend requests
```js
ito.on('request', event => {
  console.log(event.profile.email);

  // accept this request
  if(event.options && event.options.password === 'OpenSesame!')
    event.accept();
  // reject this request
  else
    event.reject();
})
```

### Set a passcode for friend discovery
```js
ito.setPasscode('(passcode)').catch(() => {
  console.log('the passcode is already used by other user');
});
```

`passcode` must be a string which consists one or more letters out of
alphabets in lower and upper cases, numbers, `-`, `_` and `=`
(i.e. the letters compatible with URL-safe Base64 encoding).
When `null` is passed, passcode-based friend discovery becomes inactive.

ito `keeps` the passcode value even when a web app reloads.

Note: A passcode should be a string which is difficult to guess.
While you could generate 6- or 8-digit passcode and show it to users,
it would be recommended that a hashed value of the passcode should be set
to `ito.setPasscode()`, for example.

## Watch friend's status
```js
// When a friend is added to your friend list
ito.on('addfriend', event => {
  console.log('friend [' + event.uid + '] is added');
});

// When a friend's status has been changed
ito.on('updatefriend', event => {
  console.log('status of friend [' + event.uid + ']: ' + event.profile.status);
});

// When a friend is removed from your friend list
ito.on('removefriend', event => {
  console.log('friend [' + event.uid + '] is removed');
});
```

# Messaging and Notifications

*Messaging* is a feature to notify a single friend ("peer") of a text string
or a serializable JavaScript object.

*Notifications* is a feature to broadcast a text string or a serializable
JavaScript object to all users (not limited to friends). Sending notifications
is allowed to the users who are registered as administrator.

## Register a user as an administrator

### Firebase

To register a user as an administrator, add a key-value pair as a child of
the *administrators* node, like below:

```
(your database name)
[-] administrators
 | + (the user's uid) : true
```

## Send a message to a friend
```js
ito.send('(friend\'s uid)', '(message)');
```

## Wait for messages from friends
```js
ito.on('message', event => {
  console.log('message from [' + event.uid + ']: ' + event.data);
});
```

## Wait for notifications from an administrator
```js
ito.on('notification', event => {
  event.data.forEach(notification => {
    console.log('notification: '
      + (typeof notification.data === 'object' ?
        notification.data.body : notification.data)
      + ' (at ' + new Date(notification).toLocaleString()));
  });
});
```

## Send a notification (if administrator's account)
```js
// send a string
ito.sendNotification('update available');

// send a JavaScript object
ito.sendNotification({
  title: 'app update',
  body: 'An update for this web app is available now.'
});
```

# WebRTC Peer-to-Peer Communication

## Offerer: Invite a friend to peer-to-peer communication

```js
navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
}).then(stream => {
  return ito.invite('(friend\'s uid)', stream, {
    dataChannel: true // true if using WebRTC data channel
  });
}).then(endpoint => {
  // If the peer rejects the invitation
  endpoint.on('reject', event => {
    console.log('rejected: ' + event.reason);
  });
});
```

## Answerer: Wait for friend's invitation

```js
ito.on('invite', endpoint => {
  console.log(endpoint.peer); // the peer's uid
  if(/* accept the peer's invitation*/) {
    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then(stream => {
      endpoint.accept(stream);
    });
  }
  else // refuse the peer's invitation
    endpoint.reject();
});
```

## Both offerer and answerer: The peer-to-peer communication starts

```js
endpoint.on('open', () => {
  let video = document.querySelector('video');
  video.autoplay = true;
  if('srcObject' in video)
    video.srcObject = endpoint.receivedStream;
  else
    video.src = URL.createObjectURL(endpoint.receivedStream);
});
```

## Send messages via WebRTC data channel

```js
endpoint.send('(message)');
```

## Wait for messages from the peer friend via WebRTC data channel

```js
endpoint.on('message', event => {
  console.log('message received: ' + event.data);
});
```

# Simple Data Store Sharing

## Open a data store

```js
let store;
ito.openDataStore(
  '(datastorename)',
  { scope: 'public' } /* options */
).then(s => {
  store = s;
});
```

If the specified data store name does not exist, an empty data store is newly
created. The following option(s) are currently supported:

* scope:
  * `public`: The data store is publicly visible.
  * `friends`: The data store is visible only from friends.
  * `private`: The data store is visible only from the user.
  * If not specified for a new data store, `private` is set to the scope.
  * If the specified data store already exists, this option is ignored.

## Put a new data element in the data store

```js
store.put('key', { /* any JavaScript object */ }).then(() => {
  /* succeeded to put the data */
}, () => {
  /* failed to put the data */
});
```

If the data store already has a data element named the specified label,
the data element is overwritten by the new data element.

Note: *In the case of Firebase, data elements must NOT include any array
as their descendants.*

## Get a data element in the data store

```js
store.get('key').then(element => {
  console.log(element.key, element.data);
});
```

## Get all data elements in the data store

```js
store.getAll().then(elements => {
  Object.keys(elements).forEach(element => {
    console.log(element.key, element.data);
  });
});
```

## Remove a data element from the data store

```js
store.remove('key').then(()) => {
  console.log('a data element was removed from the data store.');
});
```

## Remove all data elements from the data store

```js
store.removeAll().then(() => {
  console.log('All data elements were removed from the data store.');
});
```

## Remove the data store entirely

```js
store.reset().then(() => {
  console.log('The data store was entirely reset.');
});
```

## Observe other user's data store

```js
let observer;
ito.observeDataStore('(user ID)', '(datastorename)').then(o => {
  /* allowed to observe the user's data store */
  observer = o;

  /* a data element is added */
  observer.on('elementadd', event => {
    console.log('added', event.key, event.data);
  });
  /* a data element is updated */
  observer.on('elementupdate', event => {
    console.log('updated', event.key, event.data);
  });
  /* a data element is removed */
  observer.on('elementremove', event => {
    console.log('removed', event.key);
  });
  /* get a data element */
  observer.get('key').then(event => {
    console.log(event.key, event.data);
  });
  /* get all data elements */
  observer.getAll().then(event => {
    Object.keys(event).forEach(event => {
      console.log(event.key, event.data);
    });
  });
}, () => {
  /* rejected to observe the user's data store */
});
```


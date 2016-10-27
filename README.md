# About **ito**

**ito** is a JavaScript library for browser-to-browser communication,
which is intended to work on devices without an input human interface
like keyboard or mouse, of course as well as PCs, smartphones and tablets.

This library is composed of two parts; application and backend interfaces.
While the backend interface can be implemented for various kinds of backend services,
only Firebase is currently supported.

"ito" is a Japanese word which means "*string*", "*thread*" or "*yarn*", and is also an anagram of "*IoT*". 

# How to run

## Loading the library on your application
### Web
```html
<script src="ito.js"></script>
<script src="ito-firebase.js"></script>
```
### Node.js
```js
let ito = require('./ito-firebase.js');
```
This library requires the `firebase` module:

```bash
$ npm install firebase --save
```

## Initializing the library
```js
let provider = ito.provider.firebase;
const config = {
  apiKey: "(see your Firebase setup)",
  authDomain: "(see your Firebase setup)",
  databaseURL: "(see your Firebase setup)"
};

ito.init(provider, config).then(() => {
  // Write your codes to be done when initialized
});
```

## Signing in
```js
ito.signIn('(sign-in type)').then(user => {
  // Write your codes to be done after signed in
  console.log(user.uid);
  console.log(user.email);
});
```
*sign-in type* must be one of the following ones:

* `anonymous`: an anonymous account, which is valid until signed out
* `google`: (web only) a Google account
* `facebook`: (web only) a Facebook account
* `email`: an account with e-mail and password (see below)

### Creating an account with E-mail and Password (Firebase)
```js
ito.provider.firebase.createUser('(e-mail address)', '(password)').then(user => {
  console.log(user.uid);
});
```

### Signing in with E-mail and Password (Firebase)
```js
ito.signIn('email', '(e-mail address)', '(password)').then(user => {
  // Write your codes to be done after signed in
  console.log(user.uid);
  console.log(user.email);
}, err => {
  console.log('invalid password or unknown error');
});
```

## Signing out
```js
ito.signOut().then(() => {
  // Write your codes to be done then signed out
});
```

## Getting the user profile (when signed in)

* `ito.profile.userName`: (string) the user's name (for Google and Facebook account)
* `ito.profile.email`: (string) the user's email address (same value as `uid` if `anonymous` sign-in type)
* `ito.profile.isAnonymous`: (boolean) `true` if `anonymous` sign-in type
* `ito.profile.uid`: (string) the user's ID

## Sending a friend request
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

## Waiting for friend requests
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

`passcode` must be a string which consists one or more characters out of
alphabets in lower and upper cases, numbers, `-`, `_` and `=`.
When `null` is passed, passcode-based friend discovery becomes inactive.

Note: A passcode should be a string which is difficult to guess.
While you could generate 6- or 8-digit passcode and show it to users,
it would be recommended that a hashed value of the passcode should be set
to `ito.setPasscode()`, for example.

## Watching friends' status
```js
// When a friend is added to your friend list
ito.on('addfriend', event => {
  console.log('friend [' + event.uid + '] is added');
});

// When a friend's status has been changed
ito.on('updatefriend', event => {
  console.log('status of friend [' + event.uid + ']: ' + event.profile.status);
});

// When a friend is removed on your friend list
ito.on('removefriend', event => {
  console.log('friend [' + event.uid + '] is removed');
});
```

## Sending a message to a friend
```js
ito.send('(friend\'s uid)', '(message)');
```

## Waiting for messages from friends
```js
ito.on('message', event => {
  console.log('message from [' + event.uid + ']: ' + event.message);
});
```

## Waiting for notifications from an administrator
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

## Sending a notification (if administrator's account)
```js
// send a string
ito.sendNotification('update available');

// send a JavaScript object
ito.sendNotification({
  title: 'app update',
  body: 'An update for this web app is available now.'
});
```

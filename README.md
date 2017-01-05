
# About **ito**

**ito** is a JavaScript library for browser-to-browser communication,
which is intended to work on devices without an input human interface
like keyboard or mouse, of course as well as PCs, smartphones and tablets.

This library is composed of two parts; application and backend interfaces.
While the backend interface can be implemented for various kinds of backend
services, only Firebase is currently supported.

"ito" is a Japanese word "糸" which means "*string*", "*thread*" or "*yarn*",
and is also an anagram of "*IoT*". 

## Copyright

Copyright (c) 2017 [KDDI Research, Inc.](http://www.kddi-research.jp)

Use of source code of this software is governed by Apache License, Version 2.0,
that can be found in [LICENSE](LICENSE) file.

# Functional Features

ito provides web applications running on browosers and web servers running on
Node.js with the following features:

* account and authentication
* friend list, as a whitelist of connectable accounts
* messaging and Notifications
* WebRTC peer-to-peer communication (browsers only)
* simple database sharing

# Prerequisites

* Browser or Node.js, compatible with ES2015(ES6)
* WebRTC compatibility (when using WebRTC peer-to-peer communication)
* A developer account for one of the following backend service(s):
  * [Firebase](https://firebase.google.com)
  * [Kii Cloud](https://www.kii.com)

## Setup before using ito

### Firebase

1. Create your Firebase project at https://console.firebase.google.com.
2. Configure *Authentication -> Sign-in method* (if needed).
    * Select *Sign-in providers* as you need.
    For Facebook, *App ID*, *App secret* and *OAuth redirect URI* must be
    configured as well.
    * Add your domain to *OAuth redirect domains*.
    * Note: GitHub and Twitter are not supported yet.
3. Copy and paste `etc/firebase-rules.json` into *Database -> Rules*.
4. Confirm the snippet from *Authentication -> Web setup*, and note down
the values of `apiKey`, `authDomain` and `databaseURL`. These values are
used in `ito.init()`.

### Kii Cloud

1. Create your app at https://developer.kii.com.
    * Choose HTML5 as your application's platform.
    * Choose a server location appropriate for you.
    * For detailed information, please refer to 
    http://docs.kii.com/en/guides/cloudsdk/javascript/quickstart/create-app/.
2. Configure social network settings (if needed).
    * For detailed information, please refer to
    http://docs.kii.com/en/guides/cloudsdk/javascript/managing-users/social-network-integration/.
3. Create a bucket named `ito` in the app's application scope, then create a object
in the bucket, copy and paste `etc/kii-objects.json` inside the
"Objects Attribute" window, and save it.
4. Confirm your APP ID and APP KEY.
    * For detailed information, please refer to
    http://docs.kii.com/en/guides/cloudsdk/javascript/quickstart/create-app/#checking-appid-and-appkey.

# How to run

## Loading the library on your application

Note: You can modify paths of scripts according to your environment.

### Firebase

#### Browsers
```html
<script src="src/ito.js"></script>
<script src="src/ito-firebase.js"></script>
```
#### Node.js
```js
let ito = require('./src/ito-firebase.js');
```
This library requires the `firebase` module:

```bash
$ npm install firebase --save
```

### Kii Cloud

#### Browsers
```html
<script src="src/ito.js"></script>
<script src="src/ito-kii.js"></script>
```
#### Node.js
```js
let ito = require('./src/ito-kii.js');
```
This library requires the `kii-cloud-sdk` and `mqtt` modules:

```bash
$ npm install kii-cloud-sdk --save
$ npm install mqtt --save
```

For detailed description of API, please refer to [the API documentation](API.md).
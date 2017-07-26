
# About **ito**

**ito** is a JavaScript library for browser-to-browser communication,
which is intended to work on devices without an input human interface
like keyboard or mouse, of course as well as PCs, smartphones and tablets.

This library is composed of two layers; application and backend interface layers.
The application interface layer provides a set of APIs for JavaScript-based
web applications. The backend interface layer works as a bridge between the
application interface and a backend service. As a backend service,
[Firebase](https://firebase.google.com) and [Kii Cloud](https://www.kii.com/)
are supported currently.

"ito" is a Japanese word "糸" which means "*string*", "*thread*" or "*yarn*",
and is also an anagram of "*IoT*". 

## Copyright

Copyright (c) 2017 [KDDI Research, Inc.](http://www.kddi-research.jp)

This software is released under the MIT License, see [LICENSE](LICENSE) file.

## Notice

When using this library, you MUST follow Terms of Service for each backend service
which you use with this library:

* [Terms of Service for Firebase Services](https://firebase.google.com/terms/)
* [Terms of Use | Kii](https://en.kii.com/terms/)

# Functional Features

ito provides web applications running on browsers and web servers running on
Node.js with the following features:

* account and authentication
* friend list, as a whitelist of connectable accounts
* messaging and Notifications
* WebRTC peer-to-peer communication (browsers only)
* simple database sharing

# Prerequisites

* Browser or Node.js, compatible with ES2015(ES6)
  * If you need to run your web application on an ES5 environment,
  please use the ES5-transpiled files, `src-es5/ito*.js`.
* WebRTC compatibility (when using WebRTC peer-to-peer communication)
* A developer account for one of the following backend service(s):
  * [Firebase](https://firebase.google.com)
  * [Kii Cloud](https://www.kii.com)

## Setup before using ito

### Firebase

1. Create your Firebase project at [Firebase Console](https://console.firebase.google.com).
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

Note: *Node.js is required to initialize a Kii Cloud application.*

1. Create your app at [Kii Developer Portal](https://developer.kii.com).
    * Choose HTML5 as your application's platform.
    * Choose a server location appropriate for you.
    * For detailed information, please refer to 
    http://docs.kii.com/en/guides/cloudsdk/javascript/quickstart/create-app/.
2. Configure social network settings (if needed).
    * For detailed information, please refer to
    http://docs.kii.com/en/guides/cloudsdk/javascript/managing-users/social-network-integration/.
3. Confirm your APP ID, APP KEY, CLIENT ID and CLIENT SECRET.
    * These values are required to initialize your Kii Cloud application (see 4.) and
    deploy Server Code (see 5.).
    * The values of APP ID and APP KEY are used in `ito.init()`.
    * For detailed information, please refer to
    http://docs.kii.com/en/guides/cloudsdk/javascript/quickstart/create-app/#checking-appid-and-appkey.
4. Run the script `etc/kii-init.js` by Node.js on your shell (Terminal, etc.), as follows:
    ```bash
    $ node etc/kii-init.js \
      --site [us|eu|cn3|sg|jp] \
      --app-id <your_app_id> \
      --app-key <your_app_key> \
      --client-id <your_client_id> \
      --client-secret <your_client_secret>
    ```
5. Deploy `etc/kii-server-code.js` as Server Code with `etc/kii-server-hook.json` as Server hook
    Configuration File, by using
    [Command Line Tools](http://docs.kii.com/en/guides/commandlinetools/). For example:
    ```bash
    $ node kii-cli/bin/kii-servercode.js deploy-file \
      --file etc/kii-server-code.js \
      --site [us|eu|cn3|sg|jp] \
      --app-id <your_app_id> \
      --app-key <your_app_key> \
      --client-id <your_client_id> \
      --client-secret <your_client_secret> \
      --hook-config etc/kii-server-hook.json
    ```

# How to load **ito** library in your application

Note: You can modify paths of scripts according to your environment.

## Browsers

### Firebase

```html
<script src="src/ito.js"></script>
<script src="src/ito-firebase.js"></script>
```

### Kii Cloud

```html
<script src="src/ito.js"></script>
<script src="src/ito-kii.js"></script>
```

## Node.js

On your shell (Terminal, etc.),

```bash
$ npm install ito-js --save
```

In your web application,

```js
let ito = require('ito-js');
```

For detailed description of API, please refer to [the API documentation](API.md).
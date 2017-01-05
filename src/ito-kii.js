/*
 * Copyright 2017 KDDI Research, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

((self, isBrowser) => {
  if(!isBrowser) {
    self.ito = require('./ito.js');
    self.ItoProvider = self.ito.ItoProvider;
  }

  if(!self.ito) {
    throw new Error('Ito base library has not been loaded yet.');
  }

  /*
   * Global variables
   */
  const KII_LOGIN_TOKEN = 'ito.provider.kii.loginToken';

  let development = true;
  let email = null;
  let userName = null;

  if(!self.ito.provider)
    self.ito.provider = {};

  class KiiProvider extends ItoProvider {
    constructor(parent) {
      super(parent);
      this.signIn = {
        anonymous: () => {
          let token = localStorage.getItem(KII_LOGIN_TOKEN);
          return token ?
            KiiUser.authenticateWithToken(token).then(kiiSetProfile) :
            KiiUser.registerAsPseudoUser().then(user => {
              localStorage.setItem(KII_LOGIN_TOKEN, user.getAccessToken());
              return kiiSetProfile();
            });
        }
      };
    }

    /*
     * Kii Login
     */
    load(url) {
      // Initialize Firebase client
      if(!self.Kii) {
        // Browser
        if(isBrowser) {
          let h = document.querySelector('head');
          return new Promise((resolve, reject) => {
            let s = document.createElement('script');
            s.src = url || 'KiiSDK.min.js';
            s.addEventListener('load', () => {
              let t = document.createElement('script');
              t.src = 'https://unpkg.com/mqtt/dist/mqtt.min.js';
              t.addEventListener('load', () => {resolve(); });
              t.addEventListener('error', () => {
                reject(new Error('cannot load mqtt.js'));
              });
              h.appendChild(t);
            });
            s.addEventListener('error', () => {
              reject(new Error('cannot load Kii SDK'));
            });
            h.appendChild(s);
          });
        }
        // Node.js
        else {
          let kii = require('kii-cloud-sdk').create();
          Object.keys(kii).forEach(i=> { self[i] = kii[i]; });
          self.mqtt = require('mqtt');
          return Promise.resolve();
        }
      }
      else
        return Promise.resolve();
    }

    init(arg) {
      return new Promise((resolve, reject) => {
        development = !!arg && !!arg.development;
        Kii.initializeWithSite(arg.appId, arg.appKey, KiiSite[arg.serverLocation]);
        let token = localStorage.getItem(KII_LOGIN_TOKEN);
        if(token)
          KiiUser.authenticateWithToken(token)
            .then(kiiGetProfile)
            .then(prof => { resolve(prof); });
        else
          resolve();
      });
    }

    getUser() {
      let user = getUser();
      return user ? {
        userName: user.getUsername(),
        email: email,
        isAnonymous: user.isPseudoUser(),
        uid: user.getID()
      } : null;
    }

    signOut() {
      return new Promise((resolve, reject) => {
        let user = getUser();
        if(user && user.isPseudoUser()) {
          return user.delete()
            .then(() => {
              email = null;
              userName = null;
              localStorage.removeItem(KII_LOGIN_TOKEN);
            }).then(KiiUser.logOut);
        }
        else {
          KiiUser.logOut();
          resolve();
        }
      });
    }

    /*
     * Constant properties
     */
    get US()  { return 'US'; }
    get EU()  { return 'EU'; }
    get CN()  { return 'CN' }
    get CN3() { return 'CN3' }
    get SG()  { return 'SG' }
    get JP()  { return 'JP'; }
  }
  self.ito.provider.kii = new KiiProvider(self.ito);
  let provider = self.ito.provider.kii;

  /*
   * Internal functions
   */

  /*
   * Kii Cloud Login
   */
  function getUser() {
    return KiiUser ? KiiUser.getCurrentUser() : null;
  }

  function kiiGenerateRandomString(l) {
    return crypto.getRandomValues(new Uint8Array(l)).reduce((a,b)=>{
      let c = '0' + b.toString(16);
      return a + c.substr(c.length-2);
    }, '');
  }

  function kiiCreateAnonymousUser() {
    let name = 'user_' + kiiGenerateRandomString(16);
    let password = kiiGenerateRandomString(24);
    console.log(password);
    let user = KiiUser.userWithUsername(name, password);
    return user.register().then(kiiSetProfile, kiiCreateAnonymousUser);
  }

  /*
   * Firebase Database: User Accounts and Status
   */

  function kiiSetProfile(createOnly) {
    let user = getUser();
    email = email || user.getID();
    userName = user.getUsername() || email;
    let prof = {
      userName: userName,
      email: email,
      status: createOnly ? 'offline' : 'online'
    };
    return prof;
    /*
    let p = firebase.database().ref('users/' + user.uid).set(prof)
      .then(firebase.database().ref('emails/' + firebaseEscape(email)).set(user.uid))
      .then(firebaseCheckAdministrator);
    if(!createOnly)
      firebaseOnOnline();
    return p.then(() => { return prof; });
    */
  }

  function kiiGetProfile() {
    return new Promise((resolve, reject) => {
      let user = getUser();
      email = email || user.getID();
      userName = user.getUsername() || email;
      let prof = {
        userName: userName,
        email: email,
        status: 'online'
      };
      resolve(prof);
    });
  }

  if(!isBrowser)
    module.exports = self.ito;
})(typeof window === 'object' ? window : global, typeof window === 'object');
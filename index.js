/**
 * index.js
 * 
 * Copyright 2017 KDDI Research, Inc.
 * 
 * This software is released under the MIT License.
 * http://opensource.org/licenses/mit-license.php
 */

'use strict';

require('./src/ito.js');
require('./src/ito-firebase.js');
require('./src/ito-kii.js');

module.exports = {
  ito: global.ito,
  localStorage: global.localStorage
};
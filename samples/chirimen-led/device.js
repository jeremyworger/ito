// You can modify this passcode as you like
const passcode = 'chirimen';

let parent = null, interval = null, port;

// turn on/off LED
const turnOn = light => {
  turnBlink(false);
  port.write(light ? 1 : 0);
};

// let LED start/stop blinking
const turnBlink = start => {
  let v = 1;
  if (start) {
    port.write(1);
    if (interval)
      return;
    else {
      interval = setInterval(() => {
        v = 1 - v;
        port.write(v);
      }, 500);
    }
  }
  else {
    clearInterval(interval);
    interval = null;
    port.write(0);
  }
};

// dispatch commands
ito.on('message', event => {
  try {
    const data = JSON.parse(event.data);
    if ('type' in data) {
      switch (data.type) {
        case 'on':
          turnOn(true);
          break;
        case 'off':
          turnOn(false);
          break;
        case 'blink':
          turnBlink(true);
          break;
      }
    }
  } catch(e) {}
});

// pairing is established
ito.on('addfriend', event => {
  parent = event.uid;
  ito.setPasscode(null);
});

// revoke pairing
ito.on('removefriend', () => {
  parent = null;
  turnBlink(false);
  ito.setPasscode(passcode);
});

// accept a pairing request
ito.on('request', event => {
  if (parent)
    event.reject();
  else
    event.accept();
});

// read the config file and initialize ito
window.addEventListener('DOMContentLoaded', () => {
  fetch('config.json').then(response => {
    return response.json();
  }).then(json => {
    const provider = json.provider;
    const script = document.createElement('script');
    script.src = 'ito-' + provider + '.js';
    script.onload = () => {
      ito.init(ito.provider[provider], json.settings).then(user => {
        return user || ito.signIn('anonymous');
      // initialize GPIOAccess
      }).then(() => {
        return navigator.requestGPIOAccess();
      }).then(gpio => {
        port = gpio.ports.get(198);
        return port.export("out");
      }).then(() => {
        ito.setPasscode(passcode);
      });
    };
    document.querySelector('head').appendChild(script);
  });
});

let remote = null, endpoint = null;

// connect to the remote camera
const connect = () => {
  const passcode = document.getElementById('passcode');
  const connectBtn = document.getElementById('connect');
  connectBtn.disabled = true;
  if (passcode.checkValidity()) {
    ito.request(passcode.value).catch(() => {
      connectBtn.disabled = false;
    });    
  }
};

// ready for controlling LED
const ready = () => {
  document.getElementById('controller').disabled = false;
  document.getElementById('pairing').disabled = true;
  document.getElementById('passcode').value = '';
};

// avoid duplicated pairing
ito.on('addfriend', event => {
  if (remote && remote !== event.uid)
    revoke();
  else {
    remote = event.uid;
    ready();
  }
});

// track status change of the remote camera
ito.on('updatefriend', event => {
  const controller = document.getElementById('controller');
  const pairing = document.getElementById('pairing');
  const online = (event.profile.status === 'online');
  pairing.disabled = !online;
  if (!online)
    controller.disabled = true;
});

// revoke the remote camera
const revoke = () => {
  ito.remove(remote);
  document.getElementById('controller').disabled = true;
  document.getElementById('pairing').disabled = false;
};

// read the config file and initialize ito
window.addEventListener('DOMContentLoaded', () => {
  // user interfaces for controller
  document.getElementById('revoke').onclick = revoke;
  document.getElementById('turnon').onclick = () => {
    if (remote)
      ito.send(remote, JSON.stringify({ type: 'on' }));
  };
  document.getElementById('turnoff').onclick = () => {
    if (remote)
      ito.send(remote, JSON.stringify({ type: 'off' }));
  };
  document.getElementById('turnblink').onclick = () => {
    if (remote)
      ito.send(remote, JSON.stringify({ type: 'blink' }));
  };

  // user interfaces for pairing
  const passcode = document.getElementById('passcode');
  const connectBtn = document.getElementById('connect');
  passcode.onkeyup = () => {
    connectBtn.disabled = !passcode.checkValidity();
  };
  connectBtn.onclick = () => {
    if (passcode.checkValidity())
      connect();
  };

  fetch('config.json').then(response => {
    return response.json();
  }).then(json => {
    const provider = json.provider;
    const script = document.createElement('script');
    script.src = 'ito-' + provider + '.js';
    script.onload = () => {
      ito.init(ito.provider[provider], json.settings).then(user => {
        return user || ito.signIn('anonymous');
      }).then(() => {
        document.getElementById('pairing').disabled = false;
      });
    };
    document.querySelector('head').appendChild(script);
  });
});

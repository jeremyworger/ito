let remote = null, endpoint = null;

// connect to the remote camera
const connect = () => {
  document.getElementById('wait').classList.add('hidden');
  document.getElementById('toggle').disabled = true;
  ito.invite(remote, null, { dataChannel: false }).then(e => {
    endpoint = e;
    endpoint.on('reject', () => {
      endpoint = null;
      ito.remove(remote);
      remote = null;
    });
    endpoint.on('open', () => {
      const toggle = document.getElementById('toggle');
      toggle.disabled = false;
      toggle.textContent = 'stop';
      document.getElementById('video').srcObject = endpoint.receivedStream;
    });
  });
};

const toggleConnection = event => {
  const toggle = event.currentTarget;
  if (toggle.textContent === 'stop') {
    if (endpoint) {
      endpoint.close();
      endpoint = null;
    }
    toggle.disabled = false;
    toggle.textContent = 'start';
  }
  else {
    toggle.disabled = true;
    toggle.textContent = 'stop';
    connect();
  }
};

// avoid duplicated pairing
ito.on('addfriend', event => {
  if (remote && remote !== event.uid)
    revoke();
  else {
    remote = event.uid;
    if (event.profile.status === 'online')
      connect();
  }
});

// track status change of the remote camera
ito.on('updatefriend', event => {
  const toggle = document.getElementById('toggle');
  toggle.textContent = 'start';
  if (event.profile.status === 'online') {
    toggle.disabled = false;
  }
  else if (event.profile.status === 'offline') {
    toggle.disabled = true;
    if (endpoint) {
      endpoint.close();
      endpoint = null;
    }
  }
});

// revoke the remote camera
const revoke = () => {
  if (endpoint) {
    endpoint.close();
    endpoint = null;
  }
  ito.remove(remote);
  document.getElementById('screen').classList.add('hidden');
};

// read the config file and initialize ito
window.addEventListener('DOMContentLoaded', () => {
  const param = location.search.substr(1).split('&').reduce((r, i) => {
    const s = i.split('=');
    r[s[0]] = s[1] || null;
    return r;
  }, {});
  // remove the query string like "?passcode=12345678" from the current URL
  history.replaceState(null, null, location.href.replace(/\?.*$/, ''));

  document.getElementById('toggle').addEventListener('click', toggleConnection);
  document.getElementById('revoke').addEventListener('click', revoke);

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
        if (param.passcode) {
          ito.request(param.passcode).catch(() => {
            document.querySelector('#wait > div').innerHTML =
              'No such a device was found.<br>Please scan the QR code again.';
          });
        }
      });
    };
    document.querySelector('head').appendChild(script);
  });
});

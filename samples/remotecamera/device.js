let parent = null, endpoint = null, stream = null;

// get a media stream from the local camera
const getMediaStream = () => {
  return !stream ?
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(s => {
      stream = s;
      document.getElementById('video').srcObject = s;
    }) : Promise.resolve();
};

// accept a request for streaming automatically
ito.on('invite', event => {
  endpoint = event.endpoint;
  endpoint.on('close', () => {
    endpoint = null;
  })
  getMediaStream().then(() => {
    endpoint.accept(stream);
    document.getElementById('qrcode').classList.add('hidden');
  });
});

// pairing is established
ito.on('addfriend', event => {
  parent = event.uid;
  ito.setPasscode(null);
  getMediaStream();
});

// revoke pairing
ito.on('removefriend', () => {
  parent = null;
  document.getElementById('qrcode').classList.remove('hidden');
  createQRCode();
  document.getElementById('video').srcObject = null;
  stream.getTracks().forEach(track => {
    track.stop();
  });
  stream = null;
});

// accept a pairing request
ito.on('request', event => {
  if (parent)
    event.reject();
  else {
    event.accept();
    document.getElementById('qrcode').classList.add('hidden');
    getMediaStream();
  }
});

// update a passcode with 8-digit random integer value
const updatePasscode = () => {
  let a = new Uint32Array(1);
  passcode = (crypto.getRandomValues(a)[0]%100000000 + 100000000).toString().substr(1);
  return ito.setPasscode(passcode).catch(updatePasscode);
};

// display a QR code representing a URL with a passcode
const createQRCode = () => {
  return updatePasscode().then(() => {
    if (parent) {
      ito.setPasscode(null);
      return;
    }

    console.log(ito.passcode);
    const div = document.createElement('div');
    const qr = new QRCode(div, new Request('./index.html').url + '?passcode=' + ito.passcode);
    div.children[1].onload = event => {
      document.getElementById('code').style.backgroundImage = 'url(' + event.target.src + ')';
    };
  });
};

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
      }).then(createQRCode);
    };
    document.querySelector('head').appendChild(script);
  });
});

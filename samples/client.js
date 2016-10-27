let passcode, hasController = false;

function updatePasscode() {
  if(hasController)
    return;

  document.getElementById('update').disabled = true;
  let a = new Uint32Array(1);
  passcode = (crypto.getRandomValues(a)[0]%100000000+100000000).toString().substr(1);
  getHash(passcode).then(ito.setPasscode).then(() => {
    document.getElementById('passcode').textContent = passcode;
    document.getElementById('update').disabled = false;
  }, updatePasscode);
}

document.getElementById('update').addEventListener('click', updatePasscode);

ito.on('addfriend', () => {
  hasController = true;
  document.getElementById('update').disabled = true;
});

ito.on('removefriend', () => {
  hasController = false;
  document.getElementById('update').disabled = false;
  updatePasscode();
});

ito.on('message', event => {
  if(event.data && event.data.color)
    document.documentElement.style.backgroundColor = event.data.color;
});

ito.on('notification', event => {
  event.data.forEach(n => {
    if(n.data && n.data.color)
      document.documentElement.style.backgroundColor = n.data.color;
  });
});

ito.on('request', event => {
  if(event.options && event.options.secret && event.options.secret == 'demoapp') {
    event.accept();
    document.getElementById('passcode').textContent = '';
    document.getElementById('update').disabled = true;
  }
  else
    event.reject();
});

let xhr = new XMLHttpRequest();
xhr.open('GET', 'config.json');
xhr.responseType = 'json';
xhr.onload = () => {
  ito.init(ito.provider.firebase, xhr.response).then(user => {
    return user ? null : ito.signIn('anonymous');
  }).then(() => {
    document.getElementById('uid').textContent = ito.profile.uid;
    setTimeout(updatePasscode, 3000);
  });
};
xhr.send(null);
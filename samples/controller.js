function change(isSignIn) {
  let e = document.getElementById('email');
  let p = document.getElementById('password');
  let i = document.getElementById('signin');
  let o = document.getElementById('signout');
  let c = document.getElementById('controller');

  e.disabled = isSignIn;
  p.disabled = isSignIn;
  i.disabled = isSignIn;
  o.disabled = !isSignIn;
  c.disabled = !isSignIn;
  if(isSignIn) {
    setTimeout(() => {
      document.getElementById('passcode').focus();
    }, 10);
  }
}

document.getElementById('signin').onclick = event => {
  let m = document.getElementById('email');
  let p = document.getElementById('password');
  m.disabled = true;
  p.disabled = true;
  document.getElementById('signin').disabled = true;
  ito.signIn('email', m.value, p.value)
    .then(() => { change(true); }, () => { change(false); });
}

document.getElementById('signout').onclick = event => {
  document.getElementById('signout').disabled = true;
  ito.signOut().catch(() => {}).then(() => {
    change(false);
    document.getElementById('clients').innerHTML = '';
  });
}

function checkPasscode() {
  let e = document.getElementById('passcode');
  document.getElementById('add').disabled = !e.value || !e.checkValidity();
}

let input = document.getElementById('passcode');
input.onkeyup = checkPasscode;
input.onblur = checkPasscode;

ito.on('accept', () => {
  document.getElementById('controller').disabled = false;
})

ito.on('reject', () => {
  document.getElementById('controller').disabled = false;
})

document.getElementById('add').onclick = () => {
  document.getElementById('controller').disabled = true;
  getHash(document.getElementById('passcode').value)
    .then(hash => {
      ito.request(hash, { secret: 'demoapp' }).catch(() => {
        document.getElementById('controller').disabled = false;
      });
    });
}

['white', 'red', 'green', 'blue'].forEach(i => {
  let e = document.getElementById(i);
  e.onclick = event => {
    ito.sendNotification({ color: event.currentTarget.id }); 
  };
});

ito.on('addfriend', client => {
  let c = document.getElementById('clients');
  let t = document.getElementById('client');
  let d = document.importNode(t.content, true);
  d.children[0].id = client.uid;
  d.querySelector('.uid').textContent = client.uid;
  ['white', 'pink', 'lightgreen', 'lightblue'].forEach(i => {
    d.querySelector('.' + i).onclick = event => {
      let e = event.currentTarget;
      ito.send(e.parentNode.id, { color: e.className });
    };
  });
  d.querySelector('.remove').onclick = event => {
    let p = event.currentTarget.parentNode;
    p.disabled = true;
    ito.remove(p.id);
  }
  d.children[0].disabled = client.profile.status !== 'online';
  c.appendChild(d);
});

ito.on('updatefriend', client => {
  let d = document.getElementById(client.uid);
  if(d)
    d.disabled = client.profile.status !== 'online';
});

ito.on('removefriend', client => {
  let d = document.getElementById(client.uid);
  if(d)
    d.parentNode.removeChild(d);
});

let xhr = new XMLHttpRequest();
xhr.open('GET', 'config.json');
xhr.responseType = 'json';
xhr.onload = () => {
  let provider = xhr.response.provider;
  let script = document.createElement('script');
  script.src = '../src/ito-' + provider + '.js';
  script.onload = () => {
    ito.init(ito.provider[provider], xhr.response.settings).then(user => {
      if(user) {
        document.getElementById('email').value = ito.profile.email;
        change(true);
      }
      else
        change(false);
    });
  };
  document.querySelector('head').appendChild(script);
};
xhr.send(null);
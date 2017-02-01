crypto.subtle = crypto.subtle || crypto.webkitSubtle;

function stringToArray(t) {
  return window.TextEncoder
  ? Promise.resolve(new TextEncoder().encode(t))
  : new Promise(resolve => {
    let r = new FileReader();
    r.onload = () => {
      console.log(r.result);
      resolve(r.result);
    };
    r.readAsArrayBuffer(new Blob([t]));
  });
}

function getHash(t) {
  return stringToArray(t).then(d => {
    return crypto.subtle.digest({name:'SHA-256'}, d);
  }).then(a => {
    return new Uint8Array(a).reduce((s,i)=>{
      return s + (i+0x100).toString(16).substr(1);
    }, '');
  });
}
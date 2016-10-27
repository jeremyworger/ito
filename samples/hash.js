function getHash(t) {
  return crypto.subtle.digest({name:'SHA-256'}, new TextEncoder().encode(t))
    .then(a => {
      return new Uint8Array(a).reduce((s,i)=>{
        return s + (i+0x100).toString(16).substr(1);
      }, '');
    });
}
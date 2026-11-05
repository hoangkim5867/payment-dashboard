'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
for(const name of ['payment.html','payment-mobile-renderer.html']){
  test(name+' clears hidden Firebase login secret after success without changing form amounts',()=>{
    const html=fs.readFileSync(path.join(__dirname,'../../site',name),'utf8');
    const a=html.indexOf('async function doFirebaseLogin()');
    const b=html.indexOf('authLoginBtn.addEventListener(',a);
    assert.ok(a>=0&&b>a);
    const login=html.slice(a,b);
    const sign=login.indexOf('await signInWithEmailAndPassword(');
    const wipe=login.indexOf('authPasswordInput.value = "";',sign);
    const failed=login.indexOf('}catch(error)',sign);
    assert.ok(sign>=0&&wipe>sign&&wipe<failed,'password must clear on successful Firebase sign-in');
    assert.match(login,/await setPersistence\(/);
    assert.match(login,/browserLocalPersistence/);
    assert.doesNotMatch(login,/authUsernameInput.value = ""/);
    assert.match(html,/id="formAmount"/);
    assert.match(html,/id="authPasswordInput"/);
  });
}

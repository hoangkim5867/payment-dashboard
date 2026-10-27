'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'RC1_FILE_MANIFEST.json'),'utf8'));
for(const entry of manifest.files){const file=path.resolve(root,entry.path);assert(file.startsWith(root+path.sep),'Unsafe manifest path');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),entry.sha256,'Release file changed: '+entry.path)}
console.log('PASS '+manifest.files.length+' frozen RC file checksums');

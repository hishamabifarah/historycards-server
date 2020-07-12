const admin = require('firebase-admin'); // admin operations on database
const config = require('../util/config');

// const key = require('./../../admin/firebase-admin.json');
// admin.initializeApp({
//     credential: admin.credential.cert(key),
//     storageBucket: config.storageBucket
// });

// use when firebase deploy
admin.initializeApp();
const db = admin.firestore();
module.exports = { admin, db };         
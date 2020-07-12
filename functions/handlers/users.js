const firebase = require('firebase');
const config = require('../util/config');

if (!firebase.apps.length) {
    firebase.initializeApp(config);
}

const { admin, db } = require('../util/admin');

const { validateSignupData, validateLoginData, reduceUserDetails } = require('../util/validators');

exports.uploadImage = (req, res) => {
    const BusBoy = require('busboy');
    const path = require('path');
    const fs = require('fs');
    const os = require('os');

    const busboy = new BusBoy({ headers: req.headers });

    let imageFileName;
    let imageToBeUploaded = {};

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {

        if (mimetype !== 'image/png' && mimetype !== 'image/jpeg') {
            return res.status(400).json({ error: 'Wrong image file type' });
        }
        console.log('filename', filename);
        console.log('fieldname', fieldname);
        console.log('mimetype', mimetype);

        // const image = 'my.image.png'
        // const split = image.split('.')[image.split('.').length - 1]; >> 'png'
        // get image extension : split string by dots then split image to get last 
        const imageExtension = filename.split('.')[filename.split('.').length - 1];

        // image file name
        // 1231239983.png
        imageFileName = `${Math.round(Math.random() * 1000000000000)}.${imageExtension}`;

        const filepath = path.join(os.tmpdir(), imageFileName);

        // create image to be uploaded
        imageToBeUploaded = { filepath, mimetype }

        // use fs lib to create file
        file.pipe(fs.createWriteStream(filepath));

        busboy.on('finish', () => {
            // upload created file
            admin.storage().bucket().upload(imageToBeUploaded.filepath, {
                resumable: false,
                metadata: {
                    metadata: {
                        contentType: imageToBeUploaded.mimetype
                    }
                }
            })
                .then(() => {
                    // construct image url to add it to user
                    //alt=media : so it shows it on browser not download it on pc
                    //   const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;

                    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${
                        config.storageBucket
                        }/o/${imageFileName}?alt=media`;

                    // add image to user profile
                    return db.doc(`/users/${req.user.handle}`).update({ imageUrl })
                })
                .then(() => {
                    return res.json({ message: 'image uploaded successfully' });
                })
                .catch((err) => {
                    console.log('image upload', err);
                    return res.status(500).json({ error: err.code });
                })
        })
    });
    busboy.end(req.rawBody);
}

exports.login = (req, res) => {
    const user = {
        email: req.body.email,
        password: req.body.password
    }

    const { valid, errors } = validateLoginData(user);

    if (!valid) return res.status(400).json(errors);

    firebase.auth()
        .signInWithEmailAndPassword(user.email, user.password)
        .then((data) => {
            return data.user.getIdToken();
        })
        .then(token => {
            return res.json({ token });
        })
        .catch(err => {
            // no need to handle error codes
            // if (err.code === 'auth/wrong-password') {
            //     return res.status(500).json({ general: 'Wrong credentials, please try again' });
            // } else return res.status(500).json({ error: err.code });

            return res.status(403).json({ general: 'Wrong credentials, please try again' });
        });
}

exports.signup = (req, res) => {
    const newUser = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle
    };

    const { valid, errors } = validateSignupData(newUser);

    if (!valid) return res.status(400).json(errors);

    // upload image manually to firebase storage
    const defaultImage = 'no-img.png';

    let tokenId;
    let userId;
    db.doc(`/users/${newUser.handle}`)
        .get()
        .then((doc) => {
            if (doc.exists) {
                return res.status(400).json({ handle: 'this username is already taken' });
            } else {
                return firebase
                    .auth()
                    .createUserWithEmailAndPassword(newUser.email, newUser.password);
            }
        })
        .then((data) => {
            userId = data.user.uid;
            // console.log('userId' , userId);
            return data.user.getIdToken();
        })
        .then(token => {
            tokenId = token;
            // console.log('tokenId' , tokenId)
            const userCredentials = {
                handle: newUser.handle,
                email: newUser.email,
                createdAt: new Date().toISOString(),
                imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${defaultImage}?alt=media`,
                userId
            };

            return db.doc(`/users/${newUser.handle}`).set(userCredentials);
        })
        .then(() => {
            return res.status(201).json({ tokenId });
        })
        .catch((error => {
            // console.log(error);
            if (error.code === 'auth/email-already-in-use') {
                return res.status(400).json({ email: 'Email is already in use' });
            } else if (error.code === 'auth/weak-password') {
                return res.status(400).json({ password: 'Password should be at least 6 characters' });
            }
            else {
                // return res.status(500).json({ error: error });
                return res.status(500).json({ general: 'Something went wrong, please try again' });
            }
        }));
}

// Add user details
exports.addUserDetails = (req, res) => {

    if (Object.keys(req.body).length === 0) {
        return res.json({ message: 'No Details to update' });
    }
    let userDetails = reduceUserDetails(req.body);

    db.doc(`/users/${req.user.handle}`)
        .update(userDetails)
        .then(() => {
            return res.json({ message: 'Details added successfully' });
        })
        .catch((err) => {
            console.log('addUserDetails', err);
            return res.status(500).json({ error: err.code });
        });
}

exports.markNotificationRead = (req, res) => {

    db.doc(`/notifications/${req.params.notificationId}`)
        .get()
        .then((doc) => {
            if (!doc.exists) {
                return res.status(404).json({ error: 'Notification not found' });
            } else {
                return db.doc(`/notifications/${req.params.notificationId}`).update({
                    read: true
                })
            }
        })
        .then(() => {
            return res.json({ message: 'notification marked read' });
        })
        .catch((err) => {
            console.log(err);
            return res.status(500).json({ error: err.code });
        });
}

exports.markNotificationsRead = (req, res) => {
    // batch write: update multiple documents
    let batch = db.batch();

    req.body.forEach(notificationId => {
        const notification = db.doc(`/notifications/${notificationId}`);

        batch.update(notification, { read: true });
    });

    batch.commit()
        .then(() => {
            return res.json({ message: 'notifications marked read' });
        })
        .catch((err) => {
            console.log(err);
            return res.status(500).json({ error: err.code });
        })
}

// Get any user details
exports.getUserDetails = (req, res) => {
    let userData = {};

    db.doc(`/users/${req.params.handle}`)
        .get()
        .then((doc) => {
            if (doc.exists) {
                userData.user = doc.data();
                return db.collection('screams')
                    .where('userHandle', '==', req.params.handle)
                    .orderBy('createdAt', 'desc')
                    .get();
            } else {
                return res.json(404).json({ error: 'user not found' });
            }
        })

        .then((data) => {
            userData.screams = [];
            data.forEach((doc) => {
                userData.screams.push({
                    body: doc.data().body,
                    createdAt: doc.data().createdAt,
                    userHandle: doc.data().userHandle,
                    userImage: doc.data().userImage,
                    commentCount: doc.data().commentCount,
                    likeCount: doc.data().likeCount,
                    screamId: doc.id
                })
            })
            return res.json(userData)
        })
        .catch((err) => {
            console.log('', err);
            return res.status(500).json({ error: err.code })
        });
}

// Get own user details
// we keep login route to minimal, get only token 
// then use this route to get extra user details after login or any page
// first gets user primary data from /users/handle and add it to userData
// then another get to get likes,comments etc..
// add likes to userData as array and return all 
// even if likes collection doesn't exist it will return a document for likes or other collections
exports.getAuthenticatedUser = (req, res) => {
    let userData = {};

    db.doc(`/users/${req.user.handle}`)
        .get()
        .then(doc => {
            if (doc.exists) {
                userData.credentials = doc.data();
                return db.collection('likes').where('userHandle', '==', req.user.handle).get();
            }
        })
        .then(data => {
            userData.likes = [];
            data.forEach(doc => {
                userData.likes.push(doc.data());
            });
            return db.collection('notifications')
                .where('recipient', '==', req.user.handle)
                .orderBy('createdAt', 'desc')
                .limit(10)
                .get();

        })
        .then((data) => {
            userData.notifications = [];
            data.forEach(doc => {
                userData.notifications.push({
                    recipient: doc.data().recipient,
                    sender: doc.data().sender,
                    createdAt: doc.data().createdAt,
                    timelineId: doc.data().timelineId,
                    type: doc.data().type,
                    read: doc.data().read,
                    notificationId: doc.id
                })
            });

            return db.collection('favorites')
                .where('userHandle', '==', req.user.handle)
                .orderBy('createdAt', 'desc')
                .get();
        })
        .then((data) => {
            userData.favorites = [];
            data.forEach(doc => {
                userData.favorites.push({
                    createdAt: doc.data().createdAt,
                    timelineId: doc.data().timelineId,
                    userHandle: req.user.handle
                })
            });
            return res.json(userData);
        })
        .catch(err => {
            console.log('getAuthenticatedUser', err);
            return res.status(500).json({ error: err.code });
        });
}

// Get any user details
exports.getUserDetails = (req, res) => {
    let userData = {};

    db.doc(`/users/${req.params.handle}`)
        .get()
        .then((doc) => {
            if (doc.exists) {
                userData.user = doc.data();
                return db.collection('screams')
                    .where('userHandle', '==', req.params.handle)
                    .orderBy('createdAt', 'desc')
                    .get();
            } else {
                return res.json(404).json({ error: 'user not found' });
            }
        })

        .then((data) => {
            userData.screams = [];
            data.forEach((doc) => {
                userData.screams.push({
                    body: doc.data().body,
                    createdAt: doc.data().createdAt,
                    userHandle: doc.data().userHandle,
                    userImage: doc.data().userImage,
                    commentCount: doc.data().commentCount,
                    likeCount: doc.data().likeCount,
                    screamId: doc.id
                })
            })
            return res.json(userData)
        })
        .catch((err) => {
            console.log('', err);
            return res.status(500).json({ error: err.code })
        });
}

// Get any user favorited timelines
exports.getFavoriteTimelines = (req, res) => {
    let userData = {};

    db.doc(`/users/${req.params.handle}`)
        .get()
        .then((doc) => {
            if (doc.exists) {
                userData.user = doc.data();
                return db.collection('favorites')
                    .where('userHandle', '==', req.params.handle)
                    .orderBy('createdAt', 'desc')
                    .get();
            } else {
                return res.json(404).json({ error: 'user not found' });
            }
        })

        .then((data) => {
            userData.timelines = [];
            data.forEach((doc) => {
                userData.timelines.push({
                    favoritedTiemlineId: doc.id,
                    timelineId: doc.data().timelineId,
                    title: doc.data().title,
                    description: doc.data().description,
                    viewsCount: doc.data().viewsCount,
                    likeCount: doc.data().likeCount,
                    commentCount: doc.data().commentCount,
                    imageUrl: doc.data().imageUrl,
                    bookmarked: doc.data().bookmarked,
                    createdAt: doc.data().createdAt,
                    userHandle: doc.data().userHandle,
                    userImage: doc.data().userImage,
                    favoriteCount: doc.data().favoriteCount,
                    ratingAverage: doc.data().ratingAverage
                })
            })
            return res.json(userData)
        })
        .catch((err) => {
            console.log('', err);
            return res.status(500).json({ error: err.code })
        });
}

// Get any user details (for my timelines page)
exports.getUserTimelines = (req, res) => {
    let userData = {};

    db.doc(`/users/${req.params.handle}`)
        .get()
        .then((doc) => {
            if (doc.exists) {
                userData.user = doc.data();
                return db.collection('timelines')
                    .where('userHandle', '==', req.params.handle)
                    .orderBy('createdAt', 'desc')
                    .get();
            } else {
                return res.json(404).json({ error: 'user not found' });
            }
        })

        .then((data) => {
            userData.timelines = [];
            data.forEach((doc) => {
                userData.timelines.push({
                    timelineId: doc.id,
                    title: doc.data().title,
                    description: doc.data().description,
                    viewsCount: doc.data().viewsCount,
                    likeCount: doc.data().likeCount,
                    commentCount: doc.data().commentCount,
                    imageUrl: doc.data().imageUrl,
                    bookmarked: doc.data().bookmarked,
                    createdAt: doc.data().createdAt,
                    userHandle: doc.data().userHandle,
                    userImage: doc.data().userImage,
                    favoriteCount: doc.data().favoriteCount
                })
            })
            return res.json(userData)
        })
        .catch((err) => {
            console.log('', err);
            return res.status(500).json({ error: err.code })
        });
}
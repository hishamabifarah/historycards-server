const { db, admin } = require('../util/admin');
const config = require('../util/config');
const { validateTimelineData, reduceTimelineDetails } = require('../util/validators');
/**
 *
 * Get all timelines
 * Get all timelines for one user (paginate?)
 * Get all timelines with cards (paginate)
 * Get Public timelines for HomePage (latest or by rating..)
 *  
 */

/**
 * No need for favorite count when we get favorite timelines (?)
 * No need to have bookmarked in timeline , cause it's in favorites collection
 */

// Upload timeline image
exports.uploadTimelineImage = (req, res) => {
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
                    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${
                        config.storageBucket
                        }/o/${imageFileName}?alt=media`;

                    // add image to timeline
                    return db.doc(`/timelines/${req.params.timelineId}`).update({ imageUrl })
                })
                .then(() => {
                    // return res.json({ message: 'image uploaded successfully' });
                    return db.doc(`/timelines/${req.params.timelineId}`).get();

                }).then((doc) => {
                    let resTimeline = {};
                    resTimeline.timelineId = doc.id;
                    resTimeline.title = doc.data().title;
                    resTimeline.description = doc.data().description;
                    resTimeline.image = doc.data().imageUrl;
                    return res.json({
                        resTimeline
                    })
                })

                .catch((err) => {
                    console.log('Timeline image upload', err);
                    return res.status(500).json({ error: err.code });
                })
        })
    });
    busboy.end(req.rawBody);
}

// Get Recent Activity
exports.getRecentActivity = (req, res) => {
    let activity = [];

    let getLatestCards = db.collection('cards')
        .orderBy('createdAt', 'desc')
        .limit(5)

    db.collection('timelines')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get()
        .then((data) => {
            data.forEach((doc) => {
                activity.push({
                    timelineId: doc.id,
                    title: doc.data().title,
                    userHandle: doc.data().userHandle,
                    userImage: doc.data().userImage,
                    createdAt: doc.data().createdAt,
                    type: 'timeline'
                });
            })
            return getLatestCards.get();
        })
        .then((data) => {
            data.forEach((doc) => {
                console.log(doc.data());
                activity.push({
                    timelineId: doc.data().timelineId,
                    timelineTitle: doc.data().timelineTitle,
                    title: doc.data().title,
                    userHandle: doc.data().userHandle,
                    userImage: doc.data().userImage,
                    cardId: doc.id,
                    createdAt: doc.data().createdAt,
                    type: 'card'
                });
            })
            // return res.json(activity);
             return res.json(activity.sort(function (a, b) { return Math.random() - 0.5; }));
        })
        .catch((err) => {
            console.log('getRecentActivity', err);
            return res.status(500).json({ error: 'Something went wrong' });
        })
}

// Get all timelines
exports.getAllTimelines = (req, res) => {
    db
        .collection('timelines')
        .orderBy('createdAt', 'desc')
        .get()
        .then((data) => {
            let timelines = [];
            data.forEach((doc) => {
                timelines.push({
                    timelineId: doc.id,
                    title: doc.data().title,
                    description: doc.data().description,
                    viewsCount: doc.data().viewsCount,
                    likeCount: doc.data().likeCount,
                    favoriteCount: doc.data().favoriteCount,
                    commentCount: doc.data().commentCount,
                    imageUrl: doc.data().imageUrl,
                    bookmarked: doc.data().bookmarked,
                    createdAt: doc.data().createdAt,
                    userHandle: doc.data().userHandle,
                    userImage: doc.data().userImage,
                    ratingCount: doc.data().ratingCount,
                    ratingAverage: doc.data().ratingAverage,
                    ratingNegativeCount: doc.data().ratingNegativeCount,
                    ratingPositiveCount: doc.data().ratingPositiveCount,
                });
            });
            return res.json(timelines);
        })
        .catch(err => {
            console.log(err)
            return res.status(500).json({ error: err.code })
        });
}

// Create new Timeline
exports.createNewTimeline = (req, res) => {

    const { valid, errors } = validateTimelineData(req.body);

    if (!valid) return res.status(400).json(errors);

    // When you call doc() without any arguments, it will immediately return a DocumentReference that has a unique id, 
    // without writing anything to the database
    // https://stackoverflow.com/questions/46752724/can-i-get-the-generated-id-for-a-document-created-with-batch-set-using-firesto
    const timelineRef = db.collection('timelines').doc();
    const cardsCounterRef = db.collection('cardsCounter').doc();

    const timelineCountStatRef = db.collection('timelines').doc('--- stats ---');

    const increment = admin.firestore.FieldValue.increment(1)

    const newTimeline = {
        userHandle: req.user.handle,
        userImage: req.user.imageUrl,
        title: req.body.title,
        description: req.body.description,
        imageUrl: req.body.imageUrl,
        createdAt: new Date().toISOString(),
        bookmarked: false,
        viewsCount: 0,
        likeCount: 0,
        commentCount: 0,
        favoriteCount: 0,
        ratingCount: 0,
        ratingAverage: 0
    };

    const batch = db.batch();

    batch.set(timelineRef, newTimeline);
    batch.set(timelineCountStatRef, { timelinesCount: increment }, { merge: true });
    batch.commit()
        .then(() => {
            const resTimeline = newTimeline;
            resTimeline.timelineId = timelineRef.id;
            db.collection("cardsCounter").doc(timelineRef.id).set({
                count: 0
            })
            res.json({ resTimeline });
        })
        .catch((err) => {
            console.log('createNewTimeline', err);
            return res.status(500).json({ error: err.code });
        })

    // admin
    //     .firestore()
    //     .collection('timelines')
    //     .add(newTimeline)
    //     .then((doc) => {
    //         const resTimeline = newTimeline;
    //         resTimeline.timelineId = doc.id;
    //        return res.json({
    //              resTimeline
    //         })
    //     })
    //     .catch((err) => {
    //         res.status(500).json({ error: 'something went wrong, plz try again' });
    //         console.log(err)
    //     });
};

// Get Timeline by ID with cards
exports.getTimeline = (req, res) => {
    let timelineData = {};

    db.doc(`/timelines/${req.params.timelineId}`)
        .get()
        .then((doc) => {
            if (!doc.exists) {
                return res.status(404).json({ error: 'Timeline does not exist' });
            }
            timelineData = doc.data();
            timelineData.timelineId = doc.id;

            return db
                .collection('cards')
                .where('timelineId', '==', req.params.timelineId)
                .orderBy('cardDate', 'asc')
                .get();
        }).then((data) => {
            timelineData.cards = [];
            data.forEach((doc) => {
                let card = doc.data();
                card.cardId = doc.id;
                timelineData.cards.push(card);
            });
            return res.json(timelineData);
        })
        .catch((err) => {
            console.log('error getTimeline', err.message); // .message to get the index generation link, code doesn't show it
            return res.status(500).json({ error: err.code });
        });
}

// Favorite Timeline
exports.favoriteTimeline = (req, res) => {
    // 1 check if timeline exists
    // 2 check if timeline already favorited

    const favoriteDocument = db.collection('favorites')
        .where('userHandle', '==', req.user.handle)
        .where('timelineId', '==', req.params.timelineId)
        .limit(1);

    const timelineDocument = db.doc(`/timelines/${req.params.timelineId}`);

    let timelineData;
    // Get timeline
    timelineDocument
        .get()
        .then((doc) => {
            if (doc.exists) {
                timelineData = doc.data();
                timelineData.timelineId = doc.id;
                return favoriteDocument.get();
            } else {
                return res.status(404).json({ error: 'Timeline not found' });
            }
        })
        .then((data) => {
            // user hasn't favorited timeline
            if (data.empty) {
                //  add new favorite document to db
                return db.collection('favorites').add({
                    timelineId: req.params.timelineId,
                    userHandle: req.user.handle,
                    createdAt: new Date().toISOString(),
                    title: timelineData.title,
                    description: timelineData.description,
                    viewsCount: timelineData.viewsCount,
                    likeCount: timelineData.likeCount,
                    commentCount: timelineData.commentCount,
                    imageUrl: timelineData.imageUrl,
                    bookmarked: timelineData.bookmarked,
                    createdAt: timelineData.createdAt,
                    userImage: timelineData.userImage,
                    favoriteCount: timelineData.favoriteCount
                })
                    .then(() => {
                        timelineData.favoriteCount++;
                        timelineData.bookmarked = true;
                        return timelineDocument.update(
                            {
                                favoriteCount: timelineData.favoriteCount,
                                bookmarked: timelineData.bookmarked
                            });
                    })
                    .then(() => {
                        return res.json(timelineData);
                    })
            } else {
                return res.status(500).json({ error: 'Timeline already favorited' });
            }
        })
        .catch((err) => {
            console.log('favoriteTimeline', err);
            res.status(500).json({ error: err.code });
        })
}

// like Timeline
exports.likeTimeline = (req, res) => {
    // 1 check if timeline exists
    // 2 check if timeline already liked

    const likeDocument = db.collection('likes')
        .where('userHandle', '==', req.user.handle)
        .where('timelineId', '==', req.params.timelineId)
        .limit(1);

    const timelineDocument = db.doc(`/timelines/${req.params.timelineId}`);

    let timelineData;
    // Get timeline
    timelineDocument
        .get()
        .then((doc) => {
            if (doc.exists) {
                timelineData = doc.data();
                timelineData.timelineId = doc.id;
                return likeDocument.get();
            } else {
                return res.status(404).json({ error: 'Timeline not found' });
            }
        })
        .then((data) => {
            // user haven't like timeline
            if (data.empty) {
                //  add like document do db
                return db.collection('likes').add({
                    timelineId: req.params.timelineId,
                    userHandle: req.user.handle,
                    createdAt: new Date().toISOString()
                })
                    .then(() => {
                        timelineData.likeCount++;
                        return timelineDocument.update({ likeCount: timelineData.likeCount });
                    })
                    .then(() => {
                        return res.json(timelineData);
                    })
            } else {
                return res.status(500).json({ error: 'Timeline already liked' });
            }
        })
        .catch((err) => {
            console.log('favoriteTimeline', err);
            res.status(500).json({ error: err.code });
        })
}

// Unlike Timeline
exports.unlikeTimeline = (req, res) => {
    const likeDocument =
        db
            .collection('likes')
            .where('userHandle', '==', req.user.handle)
            .where('timelineId', '==', req.params.timelineId)
            .limit(1);

    const timelineDocument = db.doc(`timelines/${req.params.timelineId}`);

    let timelineData;

    // get timeline
    timelineDocument
        .get()
        .then((doc) => {
            if (doc.exists) {
                timelineData = doc.data();
                timelineData.timelineId = doc.id;
                return likeDocument.get();
            } else {
                return res.status(500).json({ error: 'Timeline not found' });
            }
        })
        .then((data) => {
            if (data.empty) {
                return res.status(500).json({ error: 'Timeline not liked' });
            } else {
                return db
                    .doc(`likes/${data.docs[0].id}`)
                    .delete()
                    .then(() => {
                        timelineData.likeCount--;
                        return timelineDocument.update({ likeCount: timelineData.likeCount });
                    })
                    .then(() => {
                        res.json(timelineData);
                    })
            }
        })
        .catch((err) => {
            console.log('unlikeTimeline', err);
            res.status(500).json({ error: err.code });
        })
}

// Unfavorite Timeline
exports.unfavoriteTimeline = (req, res) => {
    const favoriteDocument =
        db
            .collection('favorites')
            .where('userHandle', '==', req.user.handle)
            .where('timelineId', '==', req.params.timelineId)
            .limit(1);

    const timelineDocument = db.doc(`timelines/${req.params.timelineId}`);

    let timelineData;

    // get timeline
    timelineDocument
        .get()
        .then((doc) => {
            if (doc.exists) {
                timelineData = doc.data();
                timelineData.timelineId = doc.id;
                return favoriteDocument.get();
            } else {
                return res.status(500).json({ error: 'Timeline not found' });
            }
        })
        .then((data) => {
            if (data.empty) {
                return res.status(500).json({ error: 'Timeline not favorited' });
            } else {
                return db
                    .doc(`favorites/${data.docs[0].id}`)
                    .delete()
                    .then(() => {
                        timelineData.favoriteCount--;
                        timelineData.bookmarked = false;
                        return timelineDocument.update({
                            favoriteCount: timelineData.favoriteCount,
                            bookmarked: timelineData.bookmarked
                        });
                    })
                    .then(() => {
                        res.json(timelineData);
                    })
            }
        })
        .catch((err) => {
            console.log('unfavoriteTimeline', err);
            res.status(500).json({ error: err.code });
        })

}

// Delete Timeline
exports.deleteTimeline = (req, res) => {

    const timelineRef = db.doc(`timelines/${req.params.timelineId}`);
    const timelineRefCardsCounter = db.doc(`cardsCounter/${req.params.timelineId}`);

    const timelineCountStatRef = db.collection('timelines').doc('--- stats ---');

    const decrement = admin.firestore.FieldValue.increment(-1);

    timelineRef
        .get()
        .then((doc) => {
            if (!doc.exists) {
                return res.status(404).json({ error: 'Timeline not found' });
            }
            if (doc.data().userHandle !== req.user.handle) {
                return res.status(403).json({ error: 'Not Authorized' });
            } else {
                // return document.delete();
                const batch = db.batch();
                batch.delete(timelineRef);
                batch.delete(timelineRefCardsCounter);
                batch.update(timelineCountStatRef, { timelinesCount: decrement }, { merge: true });
                batch.commit()
                    .then(() => {
                        // const resTimeline = newTimeline;
                        // resTimeline.timelineId = timelineRef.id;
                        // res.json({resTimeline});
                    })
                    .catch((err) => {
                        console.log('deleteTimeline', err);
                        return res.status(500).json({ error: err.code });
                    })
            }
        })
        .then(() => {
            res.json({ message: 'Timeline deleted successfully' });
        })
        .catch((err) => {
            console.log('deleteTimeline', err);
            return res.status(500).json({ error: err.code });
        })
}

// Update Timeline
exports.updateTimeline = (req, res) => {
    let timelineDetails = reduceTimelineDetails(req.body);
    let timeline = db.doc(`/timelines/${req.params.timelineId}`);

    db.doc(`/timelines/${req.params.timelineId}`)
        .update(timelineDetails)
        .then(() => {
            // return res.json({ message: 'Timeline updated successfully' });
            return timeline.get();
        })
        .then((doc) => {
            let resTimeline = {};
            resTimeline.timelineId = doc.id;
            resTimeline.title = doc.data().title;
            resTimeline.description = doc.data().description;
            return res.json({
                resTimeline
            })
        })
        .catch((err) => {
            console.log('addTimelineDetails', err);
            return res.status(500).json({ error: err.code });
        });
}

// Update timeline view count
exports.updateTimelineViewCount = (req, res) => {

    const timelineDocument = db.doc(`timelines/${req.params.timelineId}`);

    let timelineData;

    timelineDocument.get()
        .then((doc) => {
            if (doc.exists) {
                timelineData = doc.data();
                timelineData.timelineId = doc.id;
                timelineData.viewsCount++;
                timelineDocument.update({
                    viewsCount: timelineData.viewsCount
                })
            }
        }).then(() => {
            return res.json(timelineData);
        })
        .catch((err) => {
            console.log('err views count update ', err);
            return res.status(500).json({ error: 'Timeline not found' });
        })
}

// paginate timeline cards

let limitCards = 10;

exports.getTimelineCards = (req, res) => {
    let timelineData = {};
    let document;
    let totalCards = 0;
    let pageCount = 0;
    let offset = 0;
    let page = parseInt(req.params.page);

    db.doc(`/timelines/${req.params.timelineId}`)
        .get()
        .then((doc) => {
            if (!doc.exists) {
                return res.status(404).json({ error: 'Timeline does not exist' });
            }
            timelineData = doc.data();
            timelineData.timelineId = doc.id;
            document = db.doc(`cardsCounter/${req.params.timelineId}`);
            return document.get();
        })
        .then((doc) => {

            if (doc.data().count === 0) {
                return res.json({
                    "message": "success",
                    "status": 200,
                    "totalRecords": totalCards,
                    "page": 1,
                    "pageCount": 1,
                    "timeline": timelineData,
                    "hasMore": false,
                    "cards": []
                });
            }

            totalCards = doc.data().count;
            pageCount = Math.ceil(totalCards / limitCards);

            if (!page || page === 1) {
                page = 1;
            } else if (page <= pageCount) {
                page;
                offset = (page * limitCards - limitCards);
            } else {
                res.json({
                    "status": 204,
                    "message": "end of records reached",
                    "hasMore": false,
                    "timelines": []
                })
            }
            return db
                .collection('cards')
                .where('timelineId', '==', req.params.timelineId)
                .orderBy('cardDate', 'asc')
                .limit(limitCards)
                .offset(offset)
                .get()
                .then((data) => {
                    if (data.size !== 0) {
                        timelineData.cards = [];
                        data.forEach((doc) => {
                            let card = doc.data();
                            card.cardId = doc.id;
                            timelineData.cards.push(card);
                        });

                        return res.json({
                            "message": "success",
                            "status": 200,
                            "totalRecords": totalCards,
                            "page": page,
                            "pageCount": pageCount,
                            "timeline": timelineData
                        });
                    }
                })
                .catch((err) => {
                    console.log('error getTimelineCards', err.message);
                    return res.status(500).json({ error: err.code });
                });
        }) // end .then(doc)
        .catch((err) => {
            console.log('paginate cards', err);
            return res.status(500).json({ error: err.code });
        });
};

exports.getTimelineCardsOld = (req, res) => {
    let timelineData = {};
    let document;
    let totalCards = 0;
    let pageCount = 0;
    let page = parseInt(req.params.page);

    db.doc(`/timelines/${req.params.timelineId}`)
        .get()
        .then((doc) => {
            if (!doc.exists) {
                return res.status(404).json({ error: 'Timeline does not exist' });
            }
            timelineData = doc.data();
            timelineData.timelineId = doc.id;
            document = db.doc(`cardsCounter/${req.params.timelineId}`);
            return document.get();
        })
        .then((doc) => {
            totalCards = doc.data().count;
            pageCount = Math.ceil(totalCards / limitCards);

            if (!page || page === 1) {
                lastVisibleCard = '';
                return db
                    .collection('cards')
                    .where('timelineId', '==', req.params.timelineId)
                    .orderBy('cardDate', 'asc')
                    .limit(limitCards)
                    .get()
                    .then((data) => {
                        if (data.size !== 0) {
                            lastVisibleCard = data.docs[data.docs.length - 1];
                            timelineData.cards = [];
                            data.forEach((doc) => {
                                let card = doc.data();
                                card.cardId = doc.id;
                                timelineData.cards.push(card);
                            });

                            return res.json({
                                "message": "success",
                                "status": 200,
                                "totalRecords": totalCards,
                                "page": page,
                                "pageCount": pageCount,
                                "timeline": timelineData
                            });
                        }
                    })
                    .catch((err) => {
                        console.log('error getTimelineCards', err.message);
                        return res.status(500).json({ error: err.code });
                    });
            } else
                if (page <= pageCount) {
                    return db
                        .collection('cards')
                        .where('timelineId', '==', req.params.timelineId)
                        .orderBy('cardDate', 'asc')
                        .limit(limitCards)
                        .startAfter(lastVisibleCard)
                        .get()
                        .then((data) => {
                            if (data.size !== 0) {
                                lastVisibleCard = data.docs[data.docs.length - 1];
                                timelineData.cards = [];
                                data.forEach((doc) => {
                                    let card = doc.data();
                                    card.cardId = doc.id;
                                    timelineData.cards.push(card);
                                });
                                return res.json({
                                    "message": "success",
                                    "status": 200,
                                    "totalRecords": totalCards,
                                    "page": page,
                                    "pageCount": pageCount,
                                    "timeline": timelineData
                                });
                            }
                        })
                        .catch(err => {
                            console.log(err)
                            return res.status(500).json({ error: err.code })
                        })
                } else {
                    return res.json({
                        "status": 204,
                        "message": "end of records reached",
                        "hasMore": false,
                        "timeline": []
                    });
                }

        }) // end .then(doc)
        .catch((err) => {
            console.log('paginate cards', err);
            return res.status(500).json({ error: err.code });
        });
};


// paginate home timelines

let limit = 10;

exports.getLatestTimelines = (req, res) => {

    let totalTimelines = 0;
    let page = parseInt(req.params.page);
    let offset = 0;
    const document = db.doc('timelines/--- stats ---');
    document
        .get()
        .then((doc) => {

            totalTimelines = doc.data().timelinesCount;
            const pageCount = Math.ceil(totalTimelines / limit);

            if (!page || page === 1) {
                page = 1;
            } else if (page <= pageCount) {
                page;
                // offset = limit ;
                offset = (page * limit - limit);
            } else {
                res.json({
                    "status": 204,
                    "message": "end of records reached",
                    "hasMore": false,
                    "timelines": []
                })
            }
            console.log('getting data from page: ', page);
            db
                .collection('timelines')
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .offset(offset)
                .get()
                .then((data) => {
                    if (data.size !== 0) {
                        let timelines = [];
                        data.forEach((doc) => {
                            timelines.push({
                                timelineId: doc.id,
                                title: doc.data().title,
                                description: doc.data().description,
                                viewsCount: doc.data().viewsCount,
                                likeCount: doc.data().likeCount,
                                favoriteCount: doc.data().favoriteCount,
                                commentCount: doc.data().commentCount,
                                ratingAverage: doc.data().ratingAverage,
                                imageUrl: doc.data().imageUrl,
                                bookmarked: doc.data().bookmarked,
                                createdAt: doc.data().createdAt,
                                userHandle: doc.data().userHandle,
                                userImage: doc.data().userImage
                            });
                        });
                        return res.json({
                            "message": "success",
                            "status": 200,
                            "totalRecords": totalTimelines,
                            "page": page,
                            "pageCount": pageCount,
                            "timelines": timelines
                        });
                    }
                })
                .catch(err => {
                    console.log(err)
                    return res.status(500).json({ error: err.code })
                });
        })
        .catch((err) => {
            console.log('paginate', err);
            return res.status(500).json({ error: err.code });
        })
}

exports.getLatestTimelinesOld = (req, res) => {
    // console.log('On Function Enter : lastVisibleTimeline', lastVisibleTimeline.id);

    let totalTimelines = 0;
    let page = parseInt(req.params.page);

    const document = db.doc('timelines/--- stats ---');
    document
        .get()
        .then((doc) => {

            totalTimelines = doc.data().timelinesCount;
            const pageCount = Math.ceil(totalTimelines / limit);

            if (!page || page === 1) {
                lastVisibleTimeline = '';
                page = 1;
                console.log('getting data from page 1');
                db
                    .collection('timelines')
                    .orderBy('createdAt', 'desc')
                    .limit(limit)
                    .get()
                    .then((data) => {
                        if (data.size !== 0) {
                            lastVisibleTimeline = data.docs[data.docs.length - 1];
                            console.log(lastVisibleTimeline.id);
                            let timelines = [];
                            data.forEach((doc) => {
                                timelines.push({
                                    timelineId: doc.id,
                                    title: doc.data().title,
                                    description: doc.data().description,
                                    viewsCount: doc.data().viewsCount,
                                    likeCount: doc.data().likeCount,
                                    favoriteCount: doc.data().favoriteCount,
                                    commentCount: doc.data().commentCount,
                                    ratingAverage: doc.data().ratingAverage,
                                    imageUrl: doc.data().imageUrl,
                                    bookmarked: doc.data().bookmarked,
                                    createdAt: doc.data().createdAt,
                                    userHandle: doc.data().userHandle,
                                    userImage: doc.data().userImage
                                });
                            });
                            return res.json({
                                "message": "success",
                                "status": 200,
                                "totalRecords": totalTimelines,
                                "page": page,
                                "pageCount": pageCount,
                                "timelines": timelines,
                                "lastVisibleItem": lastVisibleTimeline
                            });
                        }
                    })
                    .catch(err => {
                        console.log(err)
                        return res.status(500).json({ error: err.code })
                    });
            } else {
                if (page <= pageCount) {
                    page
                    console.log('getting data from page ' + page);
                    db
                        .collection('timelines')
                        .orderBy('createdAt', 'desc')
                        .limit(limit)
                        .startAfter(lastVisibleTimeline)
                        .get()
                        .then((data) => {
                            if (data.size !== 0) {
                                lastVisibleTimeline = data.docs[data.docs.length - 1];
                                console.log(lastVisibleTimeline.id);
                                let timelines = [];
                                data.forEach((doc) => {
                                    timelines.push({
                                        timelineId: doc.id,
                                        title: doc.data().title,
                                        description: doc.data().description,
                                        viewsCount: doc.data().viewsCount,
                                        likeCount: doc.data().likeCount,
                                        favoriteCount: doc.data().favoriteCount,
                                        commentCount: doc.data().commentCount,
                                        ratingAverage: doc.data().ratingAverage,
                                        imageUrl: doc.data().imageUrl,
                                        bookmarked: doc.data().bookmarked,
                                        createdAt: doc.data().createdAt,
                                        userHandle: doc.data().userHandle,
                                        userImage: doc.data().userImage
                                    });
                                });
                                return res.json({
                                    "message": "success",
                                    "status": 200,
                                    "totalRecords": totalTimelines,
                                    "page": page,
                                    "pageCount": pageCount,
                                    "timelines": timelines
                                });
                            }
                        })
                        .catch(err => {
                            console.log(err)
                            return res.status(500).json({ error: err.code })
                        });
                } else {
                    return res.json({
                        "status": 204,
                        "message": "end of records reached",
                        "hasMore": false,
                        "timelines": []
                    });
                }
            }
        })
        .catch((err) => {
            console.log('paginate', err);
            return res.status(500).json({ error: err.code });
        })
}
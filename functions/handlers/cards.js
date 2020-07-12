const { db, admin } = require('../util/admin');
const config = require('../util/config');
const { validateCardData, reduceCardDetails } = require('../util/validators');

// Upload card image
exports.uploadCardImage = (req, res) => {
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

                    console.log(req.params.cardId);

                    // add image to card
                    return db.doc(`/cards/${req.params.cardId}`).update({ imageUrl })
                })
                .then(() => {
                    // return res.json({ message: 'image uploaded successfully' });
                    return db.doc(`/cards/${req.params.cardId}`).get();

                }).then((doc) => {
                    let resCard = {};
                    resCard.cardId = doc.id;
                    resCard.title = doc.data().title;
                    resCard.body = doc.data().body;
                    resCard.source = doc.data().source;
                    resCard.cardDate = doc.data().cardDate;
                    resCard.image = doc.data().imageUrl;
                    return res.json({
                        resCard
                    })
                })

                .catch((err) => {
                    console.log('Card image upload', err);
                    return res.status(500).json({ error: err.code });
                })
        })
    });
    busboy.end(req.rawBody);
}

// COMMENT ON TIMELINE CARD
exports.commentOnTimeline = (req, res) => {
    const { valid, errors } = validateCardData(req.body);

    if (!valid) return res.status(400).json(errors);

    let cardData;

    const cardsRef = db.collection('cards').doc();
    const cardCountStatRef = db.collection('cardsCounter').doc(req.params.timelineId);
    const timelineRef = db.collection('timelines').doc(req.params.timelineId);

    const increment = admin.firestore.FieldValue.increment(1)

    const newCard = {
        timelineId: req.params.timelineId,
        userHandle: req.user.handle,
        userImage: req.user.imageUrl,
        title: req.body.title,
        createdAt: new Date().toISOString(),
        body: req.body.body,
        imageUrl: '',
        source: req.body.source,
        likeCount: 0,
        dislikeCount: 0,
        cardDate: req.body.cardDate
    };

    timelineRef
        .get()
        .then((doc) => {
            if (!doc.exists) {
                return res.status(403).json({ message: 'Timeline does not exist' });
            } else {
                cardData = newCard;
                cardData.cardId = cardsRef.id;
                cardData.timelineTitle = doc.data().title;

                const batch = db.batch();

                batch.set(cardsRef, newCard);
                batch.update(timelineRef, { commentCount: increment })
                batch.set(cardCountStatRef, { count: increment }, { merge: true });
                batch.commit()
                    .then(() => {
                        res.json(cardData);
                    })
                    .catch((err) => {
                        console.log('createNewCard', err);
                        return res.status(500).json({ error: err.code });
                    })
            }
        });
};

// COMMENT ON TIMELINE CARD
exports.commentOnTimelineOLD = (req, res) => {

    const { valid, errors } = validateCardData(req.body);

    if (!valid) return res.status(400).json(errors);

    const newCard = {
        timelineId: req.params.timelineId,
        userHandle: req.user.handle,
        userImage: req.user.imageUrl,
        title: req.body.title,
        createdAt: new Date().toISOString(),
        body: req.body.body,
        // image: req.body.image,
        source: req.body.source,
        likeCount: 0,
        dislikeCount: 0,
        cardDate: req.body.cardDate
    };

    let timeline;
    let cardData;

    db
        .doc(`/timelines/${req.params.timelineId}`)
        .get()
        .then((doc) => {
            if (!doc.exists) {
                return res.status(400).json({ error: 'Timeline does not exist' });
            }
            timeline = doc;
            newCard.timelineTitle = timeline.data().title; // added title to display with recent activities
            return db.collection('cards').add(newCard);
        })
        .then((doc) => {
            cardData = newCard;
            cardData.cardId = doc.id;
        })
        .then(() => {
            timeline.ref.update({ commentCount: timeline.data().commentCount + 1 });

            res.json(cardData);
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({ error: err.code });
        });
};


// LIKE TIMELINE CARD
exports.likeCard = (req, res) => {
    // cards for one timelines are liked 
    // they can be already liked so return already liked
    // if not liked , add like count 
    // then function aggregate to commute all ratings and average

    let likedOrDisliked = req.params.type;
    let type = likedOrDisliked === "1" ? true : false;
    let ratingDocument;

    if (likedOrDisliked === "1") {
        ratingDocument = db.collection('ratings')
            .where('userHandle', '==', req.user.handle)
            .where('cardId', '==', req.params.cardId)
            .where('liked', '==', true)
            .limit(1);
    } else {
        ratingDocument = db.collection('ratings')
            .where('userHandle', '==', req.user.handle)
            .where('cardId', '==', req.params.cardId)
            .where('liked', '==', false)
            .limit(1);
    }

    let ratingDocLimit = db.collection('ratings')
        .where('userHandle', '==', req.user.handle)
        .where('cardId', '==', req.params.cardId)
        .orderBy('createdAt', 'desc')
        .limit(2);

    let cardDocument = db.doc(`/cards/${req.params.cardId}`);
    let userData = {};
    let cardData;

    cardDocument
        .get()
        .then((doc) => {
            if (doc.exists) {
                cardData = doc.data();
                cardData.cardId = doc.id;
                return ratingDocument.get();
            } else {
                return res.status(404).json({ error: 'Card not found' });
            }
        }).then((data) => {
            if (data.empty) {
                return db.collection('ratings').add({
                    cardId: req.params.cardId,
                    userHandle: req.user.handle,
                    timelineId: req.params.timelineId,
                    createdAt: new Date().toISOString(),
                    liked: type
                })
                    .then(() => {
                        return ratingDocLimit.get();
                    })
                    .then(data => {
                        userData.ratings = [];
                        data.forEach(doc => {
                            userData.ratings.push(doc.data());
                        });

                        console.log(userData);

                        if (data.size === 1 && userData.ratings[0].liked) {
                            cardData.likeCount++;
                            return cardDocument.update({
                                likeCount: cardData.likeCount
                            });
                        } else
                            if (data.size === 1 && !userData.ratings[0].liked) {
                                cardData.dislikeCount++;
                                return cardDocument.update({
                                    dislikeCount: cardData.dislikeCount
                                });
                            } else
                                if ((data.size === 2) && (userData.ratings[0].liked)) {
                                    if (cardData.dislikeCount > 0) {
                                        cardData.dislikeCount--;
                                    }
                                    cardData.likeCount++;
                                    return cardDocument.update({
                                        dislikeCount: cardData.dislikeCount,
                                        likeCount: cardData.likeCount
                                    });
                                } else
                                    if ((data.size === 2) && (!userData.ratings[0].liked)) {
                                        if (cardData.likeCount > 0) {
                                            cardData.likeCount--;
                                        }
                                        cardData.dislikeCount++;

                                        return cardDocument.update({
                                            dislikeCount: cardData.dislikeCount,
                                            likeCount: cardData.likeCount
                                        });
                                    }
                    })
                    .then(() => {
                        return res.json(cardData);
                    })
            } else {
                return res.status(204).json({ error: 'Card already liked' });
            }
        })
        .catch((err) => {
            console.log('likeCard', err);
            return res.status(500).json({ error: 'Something went wrong' });
        });
};

// EDIT comment on timeline
exports.editCommentOnTimeline = (req, res) => {

    let cardDetails = reduceCardDetails(req.body);
    let card = db.doc(`/cards/${req.params.cardId}`);

    db.doc(`/cards/${req.params.cardId}`)
        .update(cardDetails)
        .then(() => {
            // return res.json({ message: 'Card Details updated successfully' });
            return card.get();
        })
        .then((doc) => {
            let card = {};
            card.cardId = doc.id;
            card.title = doc.data().title;
            card.source = doc.data().source;
            card.body = doc.data().body;
            card.cardDate = doc.data().cardDate;
            return res.json({
                card
            })
        })
        .catch((err) => {
            console.log('editCommentOnTimeline', err);
            return res.status(500).json({ error: err.code });
        });
};

// DELETE comment on timeline
exports.deleteCommentOnTimeline = (req, res) => {

    const timelineRef = db.doc(`timelines/${req.params.timelineId}`);
    // const timelineRefCollection = db.collection('timelines').doc(req.params.timelineId);

    const cardsRef = db.doc(`cards/${req.params.cardId}`);

    const cardCountStatRef = db.collection('cardsCounter').doc(req.params.timelineId);

    const decrement = admin.firestore.FieldValue.increment(-1);

    timelineRef
        .get()
        .then((doc) => {
            if (!doc.exists) {
                return res.status(404).json({ error: 'Timeline not found' });
            }
            return cardsRef.get()

        }).then((doc) => {
            if(!doc.exists){
                return res.status(404).json({ error: 'Card not found' });
            }
            if (doc.data().userHandle !== req.user.handle) {
                return res.status(403).json({ error: 'Not Authorized' });
            } else {
                const batch = db.batch();
                batch.delete(cardsRef);
                batch.update(timelineRef, { commentCount: decrement });
                batch.set(cardCountStatRef, { count: decrement }, { merge: true });
                batch.commit()
                    .then(() => {
                        res.json({ message: 'Card deleted successfully' });
                    })
                    .catch((err) => {
                        console.log('deleteCommentOnTimeline', err);
                        return res.status(500).json({ error: err.code });
                    })
            }
        })
        .catch((err) => {
            console.log('deleteTimelineCard', err);
            return res.status(500).json({ error: err.code });
        })
};

exports.deleteCommentOnTimelineOLD = (req, res) => {
    const document = db.doc(`timelines/${req.params.timelineId}`);

    const card = db.doc(`cards/${req.params.cardId}`);

    let timeline;

    document
        .get()
        .then((doc) => {
            if (!doc.exists) {
                return res.status(404).json({ error: 'Timeline not found' });
            }
            timeline = doc.data();
            timeline.timelineId = doc.id;
            return card.get()
        })
        .then((doc) => {
            if (!doc.exists) {
                return res.status(404).json({ error: 'Card not found' });
            }
            if (doc.data().userHandle !== req.user.handle) {
                return res.status(403).json({ error: 'Not Authorized' });
            } else {
                return card.delete();
            }
        }).then(() => {
            timeline.commentCount--;
            return document.update({ commentCount: timeline.commentCount });
        })
        .then(() => {
            res.json({ message: 'Card deleted successfully' });
        })
        .catch((err) => {
            console.log('deleteTimelineCard', err);
            return res.status(500).json({ error: err.code });
        })
};
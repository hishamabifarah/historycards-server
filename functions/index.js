const functions = require('firebase-functions');

// const express = require('express');
// const app = express();
const app = require('express')();

const auth = require('./util/authenticate');

const cors = require('cors');
app.use(cors());

const { db } = require('./util/admin');

const {
  createNewTimeline,
  getAllTimelines,
  getTimeline,
  getLatestTimelines,
  getTimelineCards,
  likeTimeline,
  unlikeTimeline,
  favoriteTimeline,
  unfavoriteTimeline,
  deleteTimeline,
  updateTimeline,
  getRecentActivity,
  uploadTimelineImage,
  updateTimelineViewCount
} = require('./handlers/timelines')

const {
  commentOnTimeline,
  deleteCommentOnTimeline,
  editCommentOnTimeline,
  likeCard,
  uploadCardImage
} = require('./handlers/cards')

const {
  getTimelineRatings
} = require('./handlers/ratings')

const {
  signup,
  login,
  addUserDetails,
  getAuthenticatedUser,
  uploadImage,
  getUserDetails,
  markNotificationRead,
  markNotificationsRead,
  getUserTimelines,
  getFavoriteTimelines
} = require('./handlers/users');

// IMPLEMENT FROM HERE 
// https://medium.com/@atbe/firebase-functions-true-routing-2cb17a5cd288
// Useful: Let's make sure we intercept un-matched routes and notify the client with a 404 status code
// app.get("*", async (req: express.Request, res: express.Response) => {
// 	res.status(404).send("This route does not exist.");
// });

// timelines routes
app.get('/timelines', getAllTimelines);
app.get('/timelinesp/:page', getLatestTimelines);
app.get('/timeline/:timelineId', getTimeline);
app.get('/timeline/:timelineId/like', auth, likeTimeline);
app.get('/timeline/:timelineId/unlike', auth, unlikeTimeline);
app.post('/timeline', auth, createNewTimeline);
app.post('/timeline/:timelineId/favorite', auth, favoriteTimeline);
app.post('/timeline/:timelineId/unfavorite', auth, unfavoriteTimeline);
app.post('/timeline/:timelineId/edit', auth, updateTimeline);
app.post('/timeline/:timelineId/image', auth, uploadTimelineImage);
app.post('/timeline/:timelineId/updateCount' , updateTimelineViewCount);
app.delete('/timeline/:timelineId', auth, deleteTimeline);

// cards routes
app.get('/timelinep/:timelineId/:page', getTimelineCards);
app.post('/timeline/:timelineId/comment', auth, commentOnTimeline);
app.delete('/timeline/:timelineId/:cardId/delete', auth, deleteCommentOnTimeline);
app.post('/timeline/:timelineId/:cardId/edit', auth, editCommentOnTimeline);
app.post('/timeline/:timelineId/card/:cardId/like/:type', auth, likeCard);
app.post('/timeline/:timelineId/:cardId/image', auth, uploadCardImage);

// ratings routes
app.get('/ratings/:timelineId', getTimelineRatings)

// activities routes
app.get('/activity', getRecentActivity);

//users routes
app.post('/signup', signup);
app.post('/login', login);
app.post('/user/image', auth, uploadImage);
app.post('/user', auth, addUserDetails);
app.get('/user', auth, getAuthenticatedUser);
app.get('/user/:handle', getUserDetails);
app.get('/user/timelines/:handle', getUserTimelines);
app.get('/user/favorites/:handle', getFavoriteTimelines);
app.post('/notification/:notificationId', auth, markNotificationRead);
app.post('/notifications', auth, markNotificationsRead);

exports.api = functions.region('europe-west1').https.onRequest(app);

/** notifications database triggers
 * have to deploy them to firebase after created
 * can be tested in online firebase 
 * (for example if we change user image in the user collectio change will reflet to timeline userimg)
 * 
 * */

exports.calculateRatingTimeline = functions.region('europe-west1').firestore.document('ratings/{id}').onCreate((snapshot) => {
  // snapshot of document that has just been created which is ratings
  // doc is the timeline document

  // get the timeline with ID so can edit ratings properties in it

  // user who made the rating: snapshot.data().userHandle

    let timelineData;
    let ratingSnapshotData = snapshot.data();

    return db
      .doc(`/timelines/${ratingSnapshotData.timelineId}`)
      .get()
      .then((doc) => {
        if (doc.exists) {
          let timelineId = doc.id;
          timelineData = doc.data();
          let newAverage = 0;
      
          return db
          .collection('ratings')
          .where('userHandle', '==', ratingSnapshotData.userHandle)
          .where('cardId', '==', ratingSnapshotData.cardId)
          .get()
          .then(data => {
              if(data.size === 1){
                let ratingCount = timelineData.ratingCount === 0 ? 1 : timelineData.ratingCount + 1;
                let positiveRatingCount = timelineData.ratingPositiveCount;
                let negativeRatingCount = timelineData.ratingNegativeCount;
      
                if (ratingSnapshotData.liked) {
                  // if positive rating add + 1 to ratingPositiveCount
                  positiveRatingCount = positiveRatingCount + 1;
                  newAverage = (positiveRatingCount * 5) / ratingCount;
                } else {
                  negativeRatingCount = timelineData.ratingNegativeCount + 1;
                  newAverage = (timelineData.ratingPositiveCount * 5) / ratingCount;
                }
                console.log(`new average ${newAverage}`);

                return db.doc(`/timelines/${timelineId}`).update({
                  ratingNegativeCount: negativeRatingCount,
                  ratingPositiveCount: positiveRatingCount,
                  ratingCount: ratingCount,
                  ratingAverage: newAverage
                })
              }else{
                if(data.size === 2){
                  let positiveRatingCount = timelineData.ratingPositiveCount;
                  let negativeRatingCount = timelineData.ratingNegativeCount;
                  let ratingCount = timelineData.ratingCount;

                  if (ratingSnapshotData.liked) {
                    positiveRatingCount = positiveRatingCount + 1;
                    negativeRatingCount = timelineData.ratingNegativeCount - 1;
                    newAverage = (positiveRatingCount * 5) / ratingCount;
                  } else {
                    negativeRatingCount = timelineData.ratingNegativeCount + 1;
                    positiveRatingCount = positiveRatingCount - 1;
                    newAverage = (positiveRatingCount * 5) / ratingCount;
                  }

                  console.log(`new average ${newAverage}`);

                  return db.doc(`/timelines/${timelineId}`).update({
                    ratingNegativeCount: negativeRatingCount,
                    ratingPositiveCount: positiveRatingCount,
                    ratingCount: ratingCount,
                    ratingAverage: newAverage
                  })
                }
              }
            })
            .catch((err) => console.error(err));
          }
        })
      });

  // end ratings calcultions

exports.createNotificationOnLike = functions
  .region('europe-west1')
  .firestore.document('likes/{id}')
  // snapshot of document that has just been created which is likes
  // doc is the timeline document
  .onCreate((snapshot) => {
    return db
      .doc(`/timelines/${snapshot.data().timelineId}`)
      .get()
      .then((doc) => {
        if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
          return db.doc(`/notifications/${snapshot.id}`).set({ // notifcation id and snapshot(likes) id are same
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: 'like',
            read: false,
            timelineId: doc.id
          });
        }
      })
      .catch((err) => console.error(err));
    // no need to return a document or json, this is a db trigger not api endpoint
  });

// notification on comment
exports.createNotificationOnComment = functions
  .region('europe-west1')
  .firestore.document('cards/{id}')
  .onCreate((snapshot) => {
    return db
      .doc(`/timelines/${snapshot.data().timelineId}`)
      .get()
      .then((doc) => {
        if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: 'comment',
            read: false,
            timelineId: doc.id
          });
        }
      })
      .catch((err) => console.error(err));
  });

// notification on favorite
exports.createNotificationOnFavorite = functions
  .region('europe-west1')
  .firestore.document('favorites/{id}')
  // snapshot of document that has just been created which is likes
  // doc is the timeline document
  .onCreate((snapshot) => {
    return db
      .doc(`/timelines/${snapshot.data().timelineId}`)
      .get()
      .then((doc) => {
        if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: 'favorite',
            read: false,
            timelineId: doc.id
          });
        }
      })
      .catch((err) => console.error(err));
  });


// delete notification if post is unliked before recipient checks notifications
exports.deleteNotificationsOnUnlike = functions
  .region('europe-west1')
  .firestore.document('likes/{id}')
  .onDelete((snapshot) => {
    return db.doc(`/notifications/${snapshot.id}`) // id of like is same id of notifications (set in createNotificationOnLike)
      .delete()
      .catch((err) => {
        console.log(err);
        return;
      })
  });

// delete notification if post is unfavorited before recipient checks notifications
exports.deleteNotificationsOnUnfavorite = functions
  .region('europe-west1')
  .firestore.document('favorites/{id}')
  .onDelete((snapshot) => {
    return db.doc(`/notifications/${snapshot.id}`) // id of like is same id of notifications (set in createNotificationOnLike)
      .delete()
      .catch((err) => {
        console.log(err);
        return;
      })
  });

// delete notification if comment card is deleted
// TEST with endpoint
exports.deleteNotificationsOnUncomment = functions
  .region('europe-west1')
  .firestore.document('cards/{id}')
  .onDelete((snapshot) => {
    return db.doc(`/notifications/${snapshot.id}`) // id of like is same id of notifications (set in createNotificationOnLike)
      .delete()
      .catch((err) => {
        console.log(err);
        return;
      })
  });

// change timeline userImage if user edits his profile's image
exports.onUserImageChange = functions
  .region('europe-west1')
  .firestore.document('/users/{userId}')
  .onUpdate(change => {
    console.log(change.before.data());
    console.log(change.after.data());
    if (change.before.data().imageUrl !== change.after.data().imageUrl) {
      console.log('image has changed');
      const batch = db.batch();
      return db
        .collection('timelines')
        .where('userHandle', '==', change.before.data().handle)
        .get()
        .then(data => {
          data.forEach(doc => {
            const timeline = db.doc(`/timelines/${doc.id}`);
            batch.update(timeline, { userImage: change.after.data().imageUrl });
          });
          return db
            .collection('cards')
            .where('userHandle', '==', change.before.data().handle)
            .get()
        })
        .then((data) => {
          data.forEach(doc => {
            const card = db.doc(`cards/${doc.id}`);
            batch.update(card, { userImage: change.after.data().imageUrl });
          });
            return batch.commit();
        });
    } else return true; // have to return true if if condition is not met,or it will return undefined
  });

  // when timeline deleted
  exports.onTimelineDelete = functions
  .region('europe-west1')
  .firestore.document('/timelines/{timelineId}')
  .onDelete((snapshot, context) => {
    const timelineId = context.params.timelineId;

    // to delete document cardsCounter of timeline
    const cardCountStatRef = db.collection('cardsCounter').doc(timelineId);

    const batch = db.batch();

    return db
      .collection('cards')
      .where('timelineId', '==', timelineId)
      .get()
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/cards/${doc.id}`));
        });
        return db
          .collection('likes')
          .where('timelineId', '==', timelineId)
          .get();
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection('notifications')
          .where('timelineId', '==', timelineId)
          .get();
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return db
          .collection('favorites')
          .where('timelineId', '==', timelineId)
          .get();
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/favorites/${doc.id}`));
        });
          return cardCountStatRef.delete();
      })
      .then(()=>{
        return batch.commit();
      })
      .catch(err => console.error(err));
  });

    // when card deleted
    exports.onCardDelete = functions
    .region('europe-west1')
    .firestore.document('/cards/{cardId}')
    .onDelete((snapshot, context) => {
      const cardId = context.params.cardId;
      const batch = db.batch();
      return db
        .collection('ratings')
        .where('cardId', '==', cardId)
        .get()
        .then(data => {
          data.forEach(doc => {
            batch.delete(db.doc(`/ratings/${doc.id}`));
          });
          return batch.commit();
        })
        .catch(err => console.error(err));
    });
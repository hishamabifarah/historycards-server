const { db , admin } = require('../util/admin');

module.exports = (req, res, next) => {
    let tokenId;
    let requestHeaders = req.headers

    // if req headers have authorization token and it starts with Bearer+space
    // get the token with split because it would start with Bearer >> ['Bearer ' , tokenId]
    // Bearer + space is not mandatory but it's a convention to follow
    if (requestHeaders.authorization && requestHeaders.authorization.startsWith('Bearer ')) {
        tokenId = requestHeaders.authorization.split('Bearer ')[1];
    } else {
        console.error('no token found');
        return res.status(403).json({ error: 'Not Authorized' });
    }

    admin
        .auth()
        .verifyIdToken(tokenId)
        .then(decodedToken => {
            // decodedToken holds data that is inside token, which is going to be user data
            // we need to add this data , req will have user data
            req.user = decodedToken
            // console.log('decodedtoken', decodedToken);
            // need to get the user handle because it's not stored in firebase auth system , it's in our user collection
            return db
                .collection('users')
                .where('userId', '==', req.user.uid) // user properties is in the request
                .limit(1)
                .get();
        })
        .then(data => {
            // when user with uid is found get the handle and add it to request
            req.user.handle = data.docs[0].data().handle;
            // add the user image so we will have it in the comments query, better here then getting it with another query
            req.user.imageUrl = data.docs[0].data().imageUrl;
            return next();
        })
        .catch((err) => {
            console.log('error verifying token', err);
            return res.status(403).json(err);
        });
}
const { db , admin } = require('../util/admin');

// without admin in require , complains :error verifying token Error: Could not load the default credentials

exports.getTimelineRatings = (req,res) =>{

    let ratingsData = {};

    db.collection('ratings')
        .where('timelineId', '==' , req.params.timelineId)
        .orderBy('createdAt' , 'desc')
        .get()
        .then((data)=>{
            // if(data.size > 0){
                ratingsData.ratings = [];
                data.forEach((doc) => {
                    ratingsData.ratings.push({
                        ratingsId: doc.id,
                        cardId: doc.data().cardId,
                        createdAt: doc.data().createdAt,
                        timelineId: doc.data().timelineId,
                        userHandle: doc.data().userHandle,
                        liked: doc.data().liked
                    });
                });
                return res.json(ratingsData);
            // }else{
            //     // return res.status(204).json({message: 'No Ratings for timeline cards'})
            //     res.json({ message: 'No Ratings for timeline cards' });
            // }
        })
        .catch((err)=>{
            console.log('getTimelineRatings' , err.message);
            return res.status(500).json({error: 'Something went wrong'});
        })
};
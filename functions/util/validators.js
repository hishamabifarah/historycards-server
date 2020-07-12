// check if value is empty
const isEmpty = (string) => {
    if (string.trim() === '') return true;
    else return false;
}

// check if email is valid
const isEmail = (email) => {
    const regEx = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (email.match(regEx)) return true;
    else return false;
}

exports.validateSignupData = (data) => {
    let errors = {};

    if (isEmpty(data.email)) {
        errors.email = 'Must not be empty';
    } else if (!isEmail(data.email)) {
        errors.email = 'Must be a valid email address';
    }

    // no need for password must not be empty or email etc.. 
    // on the frontend the error will show under the textfield with password or email word
    if (isEmpty(data.password)) errors.password = 'Must not be empty';
    if (data.password !== data.confirmPassword) errors.confirmPassword = 'Passwords must match';
    if (isEmpty(data.handle)) errors.handle = 'Must not be empty';

    // if (Object.keys(errors).length > 0) return res.status(400).json(errors);

    return {
        errors,
        valid: Object.keys(errors).length === 0 ? true : false
    }
}

exports.validateLoginData = (data) => {
    let errors = {}

    if (isEmpty(data.email)) errors.email = 'Must not be empty';
    if (isEmpty(data.password)) errors.password = 'Must not be empty';
    if (!isEmail(data.email)) errors.email = 'Must be a valid email address';

    return {
        errors,
        valid: Object.keys(errors).length === 0 ? true : false
    }
}

exports.validateTimelineData = (data) => {
    let errors = {};

    if (isEmpty(data.title.trim())) errors.title = 'Must not be empty';
    if (isEmpty(data.description.trim())) errors.description = 'Must not be empty';

    return {
        errors,
        valid: Object.keys(errors).length === 0 ? true : false
    }
}

exports.validateCardData = (data) => {
    let errors = {};

    if (isEmpty(data.title.trim())) errors.title = 'Must not be empty';
    if (isEmpty(data.body.trim())) errors.body = 'Must not be empty';
    if (isEmpty(data.source.trim())) errors.source = 'Must not be empty';
    if (isEmpty(data.cardDate.trim())) errors.date = 'Must not be empty';

    return {
        errors,
        valid: Object.keys(errors).length === 0 ? true : false
    }
}

exports.reduceUserDetails = (data) => {

    // console.log('data' , data);
    // if(Object.keys(data).length === 0) {
    //     return;
    // }
    // make sure we don't submit an empty string, it will be empty if not submitted
    let userDetails = {};

    if (!isEmpty(data.bio.trim())) userDetails.bio = data.bio;
    if (!isEmpty(data.website.trim())) {
        // add 'http' to beginning of website
        if (data.website.trim().substring(0, 4) !== 'http') {
            userDetails.website = `http://${data.website.trim()}`;
        } else userDetails.website = data.website;
    }
    if (!isEmpty(data.location.trim())) userDetails.location = data.location;
    if (!isEmpty(data.facebook.trim())) userDetails.facebook = data.facebook;
    if (!isEmpty(data.twitter.trim())) userDetails.twitter = data.twitter;

    return userDetails;
};

exports.reduceTimelineDetails = (data) => {
    // make sure we don't submit an empty string, it will be empty if not submitted
    let timelineDetails = {};

    if (!isEmpty(data.title.trim())) timelineDetails.title = data.title;
    if (!isEmpty(data.description.trim())) timelineDetails.description = data.description;

    return timelineDetails;
};

exports.reduceCardDetails = (data) => {
    // make sure we don't submit an empty string, it will be empty if not submitted
    let cardDetails = {};

    if (!isEmpty(data.title.trim())) cardDetails.title = data.title;
    if (!isEmpty(data.body.trim()))cardDetails.body = data.body;
    if (!isEmpty(data.source.trim())) cardDetails.source = data.source;
    if (!isEmpty(data.cardDate.trim())) cardDetails.cardDate = data.cardDate;

    return cardDetails;
};
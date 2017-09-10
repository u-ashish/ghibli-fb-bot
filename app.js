var express = require("express");
var request = require("request");
var bodyParser = require("body-parser");
var mongoose = require("mongoose");
var API_KEY = 'cec55b7b';
var db = mongoose.connect(process.env.MONGODB_URI);
var Movie = require("./models/movie");

var app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 5000));

var BASE_URL = 'https://ghibliapi.herokuapp.com';

// Server index page
app.get("/", function (req, res) {
    res.send("Deployed!");
});

// Facebook Webhook
// Used for verification
app.get("/webhook", function (req, res) {
    if (req.query["hub.verify_token"] === process.env.VERIFICATION_TOKEN) {
        console.log("Verified webhook");
        res.status(200).send(req.query["hub.challenge"]);
    } else {
        console.error("Verification failed. The tokens do not match.");
        res.sendStatus(403);
    }
});

// All callbacks for Messenger will be POST-ed here
app.post("/webhook", function (req, res) {
    // Make sure this is a page subscription
    if (req.body.object == "page") {
        // Iterate over each entry
        // There may be multiple entries if batched
        req.body.entry.forEach(function(entry) {
            // Iterate over each messaging event
            entry.messaging.forEach(function(event) {
                if (event.postback) {
                    processPostback(event);
                } else if (event.message) {
                    processMessage(event);
                }
            });
        });

        res.sendStatus(200);
    }
});

function processPostback(event) {
    var senderId = event.sender.id;
    var payload = event.postback.payload;

    if (payload === "Greeting") {
        // Get user's first name from the User Profile API
        // and include it in the greeting
        request({
            url: "https://graph.facebook.com/v2.6/" + senderId,
            qs: {
                access_token: process.env.PAGE_ACCESS_TOKEN,
                fields: "first_name"
            },
            method: "GET"
        }, function(error, response, body) {
            var greeting = "";
            if (error) {
                console.log("Error getting user's name: " +  error);
            } else {
                var bodyObj = JSON.parse(body);
                name = bodyObj.first_name;
                greeting = "Hi " + name + ". ";
            }
            var message = greeting + "I'm the Ghibli Bot. What studio Ghibli movie would you like to learn more about?";
            sendMessage(senderId, {text: message});
        });
    } else if (payload === "Correct") {
        sendMessage(senderId, {text: "Awesome! What would you like to find out? Enter 'plot', 'date', 'runtime', 'director', 'cast' or 'rating' for the various details."});
    } else if (payload === "Incorrect") {
        sendMessage(senderId, {text: "Oops! Sorry about that. Try using the exact title of the movie"});
    }
}

function processMessage(event) {
    if (!event.message.is_echo) {
        var message = event.message;
        var senderId = event.sender.id;

        console.log("Received message from senderId: " + senderId);
        console.log("Message is: " + JSON.stringify(message));

        // You may get a text or attachment but not both
        if (message.text) {
            var formattedMsg = message.text.toLowerCase().trim();

            // If we receive a text message, check to see if it matches any special
            // keywords and send back the corresponding movie detail.
            // Otherwise search for new movie.

            if(formattedMsg.includes('find')) {
                findSpecificMovie(senderId, formattedMsg.substring(5));              
            } else if (formattedMsg.includes('show all')) {
                findAllGhibliMovies(senderId, formattedMsg);
            } else if(formattedMsg.includes('get description')) {
                getMovieDetail(senderId, description);
            } else {
                sendMessage(senderId, {text: "Try again with a known command."});
            }
        } else if (message.attachments) {
            sendMessage(senderId, {text: "Sorry, I don't understand your request."});
        }
    }
}

function findAllGhibliMovies(userId) {
     request(`${BASE_URL}/films`, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var movies = JSON.parse(body);
            movies.forEach(function(movie) {
                var query = {user_id: userId};
                var update = {
                    user_id: userId,
                    title: movie.title,
                    description: movie.description,
                    director: movie.director,
                    producer: movie.director,
                    release_date: movie.release_date,
                    rt_score: movie.rt_score
                };
                var options = {upsert: true};
                Movie.findOneAndUpdate(query, update, options, function(err, mov) {
                    if (err) {
                        console.log('Database error: ' + err);
                    } else {
                        message = {
                            text: movie.title,
                        }
                    }
                    sendMessage(userId, message);
                })
            })                 
        }
     })
}

function findSpecificMovie(userId, movieTitle) {
    var foundMovie;
    request(`${BASE_URL}/films`, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var movies = JSON.parse(body);
            movies.forEach(function(movie) {
                if(movie.title.toLowerCase() === movieTitle.toLowerCase()) {
                    foundMovie = movie;
                }
            })
            if(foundMovie) {
                var query = {user_id: userId};
                var update = {
                    user_id: userId,
                    title: foundMovie.title,
                    description: foundMovie.description,
                    director: foundMovie.director,
                    producer: foundMovie.director,
                    release_date: foundMovie.release_date,
                    rt_score: foundMovie.rt_score
                };
                var options = {upsert: true};
                Movie.findOneAndUpdate(query, update, options, function(err, mov) {
                    if (err) {
                        console.log('Database error: ' + err);
                    } else {
                        message = {
                            //Update this to create a full detailed text window
                            text: 'Title: ' + foundMovie.title + '\n' +'Rating: ' + foundMovie.rt_score,
                        }
                    }
                    sendMessage(userId, message);
                })                  
            } else {
                sendMessage(userId, {text: "No movie found"});
            }    
              
        }
     })   
}

function getDescription(userId, field) {
    Movie.findOne({user_id: userId}, function(err, movie) {
        if(err) {
            sendMessage(userId, {text: "Something went wrong. Try again"});
        } else {
            sendMessage(userId, {text: movie[field]});
        }
    })
}

function getMovieDetail(userId, field) {
    Movie.findOne({user_id: userId}, function(err, movie) {
        if(err) {
            sendMessage(userId, {text: "Something went wrong. Try again"});
        } else {
            sendMessage(userId, {text: movie[field]});
        }
    });
}

// sends message to user
function sendMessage(recipientId, message) {
    console.log("SENDING MESSAGE");
    request({
        url: "https://graph.facebook.com/v2.6/me/messages",
        qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
        method: "POST",
        json: {
            recipient: {id: recipientId},
            message: message,
        }
    }, function(error, response, body) {
        if (error) {
            console.log("Error sending message: " + response.error);
        }
    });
}
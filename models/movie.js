var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var MovieSchema = new Schema({
  user_id: {type: String},
  title: {type: String},
  description: {type: String},
  director: {type: String},
  producer: {type: String},
  release_date: {type: String},
  rt_score: {type: String},
  people: {type: String},
  species: {type: String},
  locations: {type: String},
  url: {type: String}
});

module.exports = mongoose.model("Movie", MovieSchema);
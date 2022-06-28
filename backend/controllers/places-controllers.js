const fs = require("fs");
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");

const HttpError = require("../models/http-error");
const getCoordsForAddress = require("../util/location");
const Place = require("./../models/place");
const User = require("../models/user");

const getPlaceById = async (req, res, next) => {
  const placeId = req.params.pid;

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError("Could not find that place.", 500);
    return next(error);
  }

  if (!place) {
    return next(new HttpError("Could not find a place for the provided id.", 404));
  }

  res.json({
    place,
  });
};

const getPlacesByUserId = async (req, res, next) => {
  const userId = req.params.uid;
  let places;

  try {
    places = await Place.find({ creator: userId });
  } catch (err) {
    const error = new HttpError("Fetching places failed, please try again later!", 500);

    return next(error);
  }

  if (places.length === 0) {
    return next(new HttpError("Could not find places for the provided user id.", 404));
  }

  res.json({
    places,
  });
};

const createPlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError("Invalid inputs passed. Please check your data!", 422));
  }

  const { title, description, address } = req.body;

  let coordinates;
  try {
    coordinates = await getCoordsForAddress(address);
  } catch (error) {
    return next(error);
  }

  // console.log(req.file);
  // console.log(creator);

  const createdPlace = new Place({
    title,
    description,
    address,
    location: coordinates,
    image: req.file.path,
    creator: req.userData.userId,
  });

  let user;
  try {
    user = await User.findById(req.userData.userId);
  } catch (err) {
    const error = new HttpError("Creating place failed, please try again! :)", 500);
    console.log(user);
    return next(error);
  }

  if (!user) {
    next(new HttpError("Could not find user for provided id!", 404));
  }

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await createdPlace.save({ session: sess });
    user.places.push(createdPlace);
    await user.save({ session: sess });
    await sess.commitTransaction();
  } catch (err) {
    const error = new HttpError("Creating place failed, please try again! :(", 500);
    return next(error);
  }

  res.status(201).json({
    place: createdPlace,
  });
};

const updatePlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError("Invalid inputs passed. Please check your data!", 422));
  }

  const { title, description } = req.body;
  const placeId = req.params.pid;

  let createdPlace;
  try {
    createdPlace = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError("Could not update that place.", 500);
    return next(error);
  }

  if (createdPlace.creator.toString() !== req.userData.userId) {
    const error = new HttpError("You are not allowed to edit this place.", 401);
    return next(error);
  }

  createdPlace.title = title;
  createdPlace.description = description;

  try {
    await createdPlace.save();
  } catch (err) {
    const error = new HttpError("Could not update that place.", 500);
    return next(error);
  }

  res.status(200).json({ createdPlace });
};

const deletePlace = async (req, res, next) => {
  const placeId = req.params.pid;

  let place;
  try {
    place = await Place.findById(placeId).populate("creator");
  } catch (err) {
    return next(new HttpError(err.message, 500));
  }

  if (!place) {
    return next(new HttpError("Could not find a place for that id", 404));
  }

  if (place.creator.id !== req.userData.userId) {
    const error = new HttpError("You are not allowed to delete this place.", 401);
    return next(error);
  }

  try {
    await place.remove();
  } catch (err) {
    return next(new HttpError("Could not delete place!"));
  }

  const imagePath = place.image;

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await place.remove({ session: sess });
    place.creator.places.pull(place);
    await place.creator.save({ session: sess });
    await sess.commitTransaction();
  } catch (err) {
    const error = new HttpError("Could not delete place!", 500);
    return next(error);
  }

  fs.unlink(imagePath, err => {
    console.log(err);
  });

  res.status(204).json(null);
};

exports.getPlaceById = getPlaceById;
exports.getPlacesByUserId = getPlacesByUserId;
exports.createPlace = createPlace;
exports.updatePlace = updatePlace;
exports.deletePlace = deletePlace;

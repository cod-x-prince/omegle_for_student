// server/utils/validation.js
const Joi = require("joi");

const authValidation = {
  register: Joi.object({
    email: Joi.string().email().required().max(255),
    password: Joi.string().min(8).max(100).required(),
    name: Joi.string().max(100).required(),
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),
};

const chatValidation = {
  sendMessage: Joi.object({
    message: Joi.string().max(1000).required(),
    roomId: Joi.string().max(50).required(),
  }),
};

const userValidation = {
  updateProfile: Joi.object({
    name: Joi.string().max(100).optional(),
    bio: Joi.string().max(500).optional(),
  }),
};

module.exports = {
  authValidation,
  chatValidation,
  userValidation,
};

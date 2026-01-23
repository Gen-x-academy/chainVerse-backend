const Joi = require('joi');

exports.recommendationResponseSchema = Joi.object({
  recommendations: Joi.array().items(
    Joi.object({
      courseId: Joi.string().required(),
      title: Joi.string().required(),
      reason: Joi.string().required(),
    })
  ),
});
